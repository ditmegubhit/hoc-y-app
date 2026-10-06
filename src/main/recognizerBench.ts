import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { getDb } from './db'
import { recognizeImageLines, terminatePaddleOcr, type PaddleOcrLine } from './services/anatomy/paddleOcrClient'
import { clusterLabelFragments, type LabelCluster } from './services/anatomy/labelDetection'
import { rereadVietnameseLines } from './services/anatomy/vietnameseOcr'
import { normalizeLabel, suggestVietnameseLabel } from './services/anatomy/vietnameseLabels'
import { tessdataDir } from './services/ocr/resourcePaths'
import { renderPageToPngBuffer, RENDER_SCALE } from './services/textExtraction/pdfRender'
import { recognizeLabelCrops, terminateLabelRecognizer } from './services/ocr-vi/labelRecognizer'
import { mergeTextItemsIntoLines, type TextLayerItem } from './services/ocr-vi/textLayer'
import { cerNoAccents, cerWithAccents, isExactMatch } from './services/ocr-vi/textMetrics'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'
import { normalizeForAnswerMatch } from '../shared/text/normalizeVietnamese'

// Bo do BO NHAN DANG chu tieng Viet (npm run ocr:bench:rec -- --label=ten).
//  A) "GT bac": ~250 dong chu cat theo hop cua text layer DUNG (PDF M11 + cac dong tin duoc cua 'He than'),
//     so voi text layer -> do thuan bo nhan dang (khong lien quan phat hien o).
//  B) 17 muc GT do nguoi dung tu sua (bang anatomy_*): chay dung pipeline (PaddleOCR det -> doc -> gom cum).
// Chi DOC pdf goc va ban sao luu DB; moi thu ghi vao tmp/ocr-bench.

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

const argValue = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const label = argValue('label') ?? 'rec'
const skipGt = process.argv.includes('--skip-gt')
const regen = process.argv.includes('--regen-silver')
const skipSilver = process.argv.includes('--skip-silver')
const benchDir = resolve('tmp/ocr-bench')
const silverDir = join(benchDir, 'silver')
const outPath = resolve(argValue('out') ?? join(benchDir, `recognizer-${label}.json`))
const dataDir = join(benchDir, 'app-data')
const BACKUP_DB = resolve('..', 'hoc-y-app-backup-2026-10-06', 'hoc-y-app.sqlite3')
const ATTACHMENTS = join(process.env.APPDATA ?? '', 'Thach may hoc Y gioi hon tao', 'attachments')
const M11_PDF = join(ATTACHMENTS, '2d944a2a-2597-48aa-acb2-da913f7d9652.pdf')
const HETHAN_PDF = join(ATTACHMENTS, 'c1383f40-6d10-42c9-8b44-b45de8604c82.pdf')

mkdirSync(dataDir, { recursive: true })
if (!skipGt && !existsSync(join(dataDir, 'hoc-y-app.sqlite3'))) {
  if (!existsSync(BACKUP_DB)) throw new Error(`Khong thay ban sao luu DB: ${BACKUP_DB}`)
  copyFileSync(BACKUP_DB, join(dataDir, 'hoc-y-app.sqlite3'))
}
app.setPath('userData', dataDir)

interface Box { x0: number; y0: number; x1: number; y1: number }
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const cleanRef = (text: string): string => text.replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})]+$/gu, '')

// ---------------------------------------------------------------- GT bac
interface SilverItem { id: string; set: 'm11' | 'hethan'; page: number; text: string; width: number; height: number }
let seed = 12345
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

async function openPdf(path: string): Promise<{ numPages: number; getPage: (n: number) => Promise<any>; }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const standardFontDataUrl = new URL('file:///' + resolve('node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/') + '/').href
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0, standardFontDataUrl })
  return await task.promise as never
}

async function pageItems(page: any): Promise<TextLayerItem[]> {
  const tc = await page.getTextContent()
  return (tc.items as Array<{ str?: string; transform: number[]; width: number; height: number }>)
    .filter((i) => typeof i.str === 'string')
    .map((i): TextLayerItem => ({ str: i.str as string, transform: i.transform, width: i.width, height: i.height }))
}

async function buildSilver(): Promise<SilverItem[]> {
  mkdirSync(silverDir, { recursive: true })
  const specs = [
    { set: 'm11' as const, path: M11_PDF, perPage: 2, cap: 190 },
    { set: 'hethan' as const, path: HETHAN_PDF, perPage: 5, cap: 130 }
  ]
  const items: SilverItem[] = []
  for (const spec of specs) {
    if (!existsSync(spec.path)) { console.warn(`Thieu PDF mau: ${spec.path}`); continue }
    const doc = await openPdf(spec.path)
    const counts = new Map<string, number>()
    const perPage: Array<{ page: number; H: number; lines: ReturnType<typeof mergeTextItemsIntoLines> }> = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const lines = mergeTextItemsIntoLines(await pageItems(page))
      perPage.push({ page: p, H: page.view[3], lines: lines.filter((l) => l.trusted) })
      for (const l of lines) counts.set(l.text, (counts.get(l.text) ?? 0) + 1)
      page.cleanup()
    }
    const cands: Array<{ page: number; H: number; text: string; box: Box }> = []
    for (const pp of perPage) {
      const ok = pp.lines.filter((l) => (counts.get(l.text) ?? 0) <= 2 && (l.text.match(/\p{L}/gu) ?? []).length >= 2 && l.fontSize >= 4.5)
      ok.sort(() => rnd() - 0.5)
      for (const l of ok.slice(0, spec.perPage)) cands.push({ page: pp.page, H: pp.H, text: l.text, box: l.box })
    }
    cands.sort(() => rnd() - 0.5)
    const chosen = cands.slice(0, spec.cap).sort((a, b) => a.page - b.page)
    let n = 0
    const pages = [...new Set(chosen.map((c) => c.page))]
    for (const pageNo of pages) {
      const page = await doc.getPage(pageNo)
      const img = await loadImage(await renderPageToPngBuffer(page, RENDER_SCALE))
      for (const c of chosen.filter((x) => x.page === pageNo)) {
        const x0 = c.box.x0 * RENDER_SCALE; const x1 = c.box.x1 * RENDER_SCALE
        const y0 = (c.H - c.box.y1) * RENDER_SCALE; const y1 = (c.H - c.box.y0) * RENDER_SCALE
        const pad = Math.max(2, (y1 - y0) * 0.12)
        const sx = Math.max(0, Math.floor(x0 - pad)); const sy = Math.max(0, Math.floor(y0 - pad))
        const w = Math.min(img.width, Math.ceil(x1 + pad)) - sx; const h = Math.min(img.height, Math.ceil(y1 + pad)) - sy
        if (w < 4 || h < 4) continue
        const cv = createCanvas(w, h); cv.getContext('2d').drawImage(img, sx, sy, w, h, 0, 0, w, h)
        const id = `${spec.set}-p${pageNo}-${n++}`
        writeFileSync(join(silverDir, `${id}.png`), cv.toBuffer('image/png'))
        items.push({ id, set: spec.set, page: pageNo, text: c.text, width: w, height: h })
      }
      page.cleanup()
    }
    console.log(`GT bac ${spec.set}: ${n} dong`)
  }
  writeFileSync(join(silverDir, 'silver.json'), JSON.stringify(items, null, 1))
  return items
}

// ------------------------------------------------- bo doc cu (de so sanh "truoc")
let legacyWorker: Promise<Worker> | null = null
async function legacyRead(png: Buffer): Promise<string> {
  // Sao chep logic cu cua vietnameseOcr.ts truoc cai tien: vie+eng, PSM 7, phong <=3x, vien 6px, nen trang.
  if (!legacyWorker) {
    legacyWorker = createWorker(['vie', 'eng'], undefined, { langPath: tessdataDir(), gzip: false, cacheMethod: 'none', logger: () => {} })
      .then(async (w) => { await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }); return w })
  }
  const worker = await legacyWorker
  const image = await loadImage(png)
  const padding = Math.max(2, image.height * 0.08)
  const scale = Math.max(1, Math.min(3, 48 / image.height))
  const canvas = createCanvas(Math.ceil(image.width * scale) + 12, Math.ceil(image.height * scale) + 12)
  const ctx = canvas.getContext('2d'); void padding
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, image.width, image.height, 6, 6, image.width * scale, image.height * scale)
  const { data } = await worker.recognize(canvas.toBuffer('image/png'))
  const text = normalizeLabel(data.text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
  return data.confidence >= 55 && (text.match(/\p{L}/gu) ?? []).length >= 2 ? (suggestVietnameseLabel(text) ?? text) : ''
}

interface Row { id: string; set: string; ref: string; read: Record<string, string>; ms: Record<string, number> }
const RECOGNIZERS = ['tesseract-cu', 'tesseract-moi', 'vietocr', 'bo-phieu+tu-dien'] as const

async function runSilver(): Promise<{ rows: Row[]; summary: Record<string, unknown> }> {
  let items: SilverItem[]
  if (!regen && existsSync(join(silverDir, 'silver.json'))) items = JSON.parse(readFileSync(join(silverDir, 'silver.json'), 'utf8')) as SilverItem[]
  else items = await buildSilver()
  console.log(`GT bac: ${items.length} dong (m11 ${items.filter((i) => i.set === 'm11').length}, he than ${items.filter((i) => i.set === 'hethan').length})`)
  const rows: Row[] = []
  for (const [index, item] of items.entries()) {
    const png = readFileSync(join(silverDir, `${item.id}.png`))
    const box: Box = { x0: 0, y0: 0, x1: item.width, y1: item.height }
    const row: Row = { id: item.id, set: item.set, ref: cleanRef(item.text), read: {}, ms: {} }
    const timed = async (name: string, fn: () => Promise<string>): Promise<void> => {
      const s = Date.now(); try { row.read[name] = await fn() } catch (e) { row.read[name] = ''; console.warn(name, String(e).slice(0, 100)) } row.ms[name] = Date.now() - s
    }
    await timed('tesseract-cu', () => legacyRead(png))
    await timed('tesseract-moi', async () => (await recognizeLabelCrops(png, [box], { disableVietOcr: true }))[0].text)
    await timed('vietocr', async () => (await recognizeLabelCrops(png, [box], { disableTesseract: true }))[0].text)
    await timed('bo-phieu+tu-dien', async () => (await recognizeLabelCrops(png, [box]))[0].text)
    rows.push(row)
    if ((index + 1) % 50 === 0) console.log(`  ... ${index + 1}/${items.length}`)
  }
  const stat = (rs: Row[], name: string) => ({
    n: rs.length,
    exact: rs.filter((r) => isExactMatch(r.read[name], r.ref)).length / Math.max(1, rs.length),
    cer: rs.reduce((a, r) => a + cerWithAccents(r.read[name], r.ref), 0) / Math.max(1, rs.length),
    cerNoAccent: rs.reduce((a, r) => a + cerNoAccents(r.read[name], r.ref), 0) / Math.max(1, rs.length),
    secPerLabel: rs.reduce((a, r) => a + r.ms[name], 0) / Math.max(1, rs.length) / 1000
  })
  const summary: Record<string, unknown> = {}
  for (const name of RECOGNIZERS) {
    summary[name] = { all: stat(rows, name), m11: stat(rows.filter((r) => r.set === 'm11'), name), hethan: stat(rows.filter((r) => r.set === 'hethan'), name) }
  }
  return { rows, summary }
}

// ---------------------------------------------------------------- GT 17 muc
interface GroundTruth {
  candidateId: string; attachmentId: string; fileName: string; storedPath: string; pageNumber: number
  box: Box; refWidth: number; refHeight: number; answerText: string; alternates: string[]
}
const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length
const area = (b: Box): number => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
const inter = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

function loadGroundTruth(): GroundTruth[] {
  const rows = getDb().prepare(`
    SELECT c.id AS candidate_id, c.attachment_id, c.page_number, c.raw_text, c.label_box_json, c.ref_width, c.ref_height,
           q.answer_text, q.accepted_alternates_json, a.file_name, a.stored_path
    FROM anatomy_questions q JOIN anatomy_label_candidates c ON c.id = q.candidate_id JOIN attachments a ON a.id = c.attachment_id
    WHERE a.file_type = 'pdf' ORDER BY c.attachment_id, c.page_number, c.id`).all() as Array<{
    candidate_id: string; attachment_id: string; page_number: number; raw_text: string; label_box_json: string; ref_width: number
    ref_height: number; answer_text: string; accepted_alternates_json: string; file_name: string; stored_path: string }>
  const byId = new Map<string, GroundTruth>()
  for (const r of rows) {
    const alternates = (JSON.parse(r.accepted_alternates_json || '[]') as unknown[]).filter((x): x is string => typeof x === 'string')
    const changed = r.answer_text.trim().toLowerCase() !== r.raw_text.trim().toLowerCase()
    const junk = letterCount(r.answer_text) < 2 || /^d$/i.test(r.answer_text.trim())
    const interesting = r.raw_text.trim() === '' || alternates.length > 0 || (changed && !junk)
    if (!interesting || letterCount(r.answer_text) < 2) continue
    const existing = byId.get(r.candidate_id)
    if (existing) { existing.alternates = [...new Set([...existing.alternates, ...alternates])]; continue }
    byId.set(r.candidate_id, { candidateId: r.candidate_id, attachmentId: r.attachment_id, fileName: r.file_name, storedPath: r.stored_path,
      pageNumber: r.page_number, box: JSON.parse(r.label_box_json) as Box, refWidth: r.ref_width, refHeight: r.ref_height,
      answerText: r.answer_text, alternates })
  }
  return [...byId.values()]
}

const MODES = ['tesseract-cu', 'moi', 'moi+text-layer'] as const
type Mode = typeof MODES[number]
interface GtRow { index: number; page: number; answer: string; visible: string | null; visibleExact: Record<Mode, boolean | null>; visibleCer: Record<Mode, number | null>; alternates: string[]; reads: Record<Mode, string | null>; exact: Record<Mode, boolean>; cer: Record<Mode, number> }

async function runGt(): Promise<{ rows: GtRow[]; summary: Record<string, unknown> } | null> {
  if (skipGt) return null
  let gts: GroundTruth[]
  try { gts = loadGroundTruth() } catch (e) { console.warn('Bo qua GT 17 muc:', String(e).slice(0, 120)); return null }
  const byPage = new Map<string, GroundTruth[]>()
  for (const g of gts) byPage.set(`${g.storedPath}#${g.pageNumber}`, [...(byPage.get(`${g.storedPath}#${g.pageNumber}`) ?? []), g])
  const rows: GtRow[] = []
  const visibleFile = join(benchDir, 'gt-visible.json')
  // gt-visible.json: { "<chi so>": "chu nhin thay tren anh" } - nguoi soan nhin crop gt-crops/<chi so>.png roi ghi tay.
  const visibleMap: Record<string, string> = existsSync(visibleFile) ? JSON.parse(readFileSync(visibleFile, 'utf8')) as Record<string, string> : {}
  mkdirSync(join(benchDir, 'gt-crops'), { recursive: true })
  for (const [key, pageGts] of byPage) {
    const { storedPath, pageNumber } = pageGts[0]
    if (!existsSync(storedPath)) { console.warn(`Thieu file: ${storedPath}`); continue }
    const doc = await openPdf(storedPath)
    const page = await doc.getPage(pageNumber)
    const png = await renderPageToPngBuffer(page, RENDER_SCALE)
    const image = await loadImage(png)
    const H = page.view[3] as number
    const textLines = mergeTextItemsIntoLines(await pageItems(page))
    page.cleanup()
    const paddleLines = (await recognizeImageLines(png)).filter((l) => l.score >= 0.2)

    // 1) doc "cu": Tesseract vie+eng nhu truoc cai tien
    const oldLines: PaddleOcrLine[] = []
    for (const l of paddleLines) {
      const pad = Math.max(2, (l.box.y1 - l.box.y0) * 0.08)
      const x0 = Math.max(0, Math.floor(l.box.x0 - pad)); const y0 = Math.max(0, Math.floor(l.box.y0 - pad))
      const w = Math.min(image.width - x0, Math.ceil(l.box.x1 + pad) - x0); const h = Math.min(image.height - y0, Math.ceil(l.box.y1 + pad) - y0)
      if (w <= 0 || h <= 0) continue
      const cv = createCanvas(w, h); cv.getContext('2d').drawImage(image, x0, y0, w, h, 0, 0, w, h)
      const text = await legacyRead(cv.toBuffer('image/png'))
      oldLines.push({ ...l, text: text || normalizeLabel(l.text), score: text ? 0.8 : Math.min(l.score, 0.54) })
    }
    // 2) doc "moi"
    const newLines = await rereadVietnameseLines(png, paddleLines)
    const toClusters = (ls: PaddleOcrLine[]): LabelCluster[] => clusterLabelFragments(ls.map((l): LabelCluster =>
      ({ box: l.box, text: l.text, coordSpace: 'image_pixel', confidence: l.score }))).map((c) => ({ ...c, text: suggestVietnameseLabel(c.text) ?? c.text }))
    const clustersOld = toClusters(oldLines)
    const clustersNew = toClusters(newLines)
    // 3) text layer tin duoc + OCR moi cho phan con lai
    const trusted = textLines.filter((l) => l.trusted).map((l): LabelCluster => ({
      box: { x0: l.box.x0 * RENDER_SCALE, x1: l.box.x1 * RENDER_SCALE, y0: (H - l.box.y1) * RENDER_SCALE, y1: (H - l.box.y0) * RENDER_SCALE },
      text: l.text, coordSpace: 'pdf_point', confidence: 1 }))
    const textClusters = clusterLabelFragments(trusted)
    const overlap = (a: Box, b: Box): number => inter(a, b) / Math.max(1, Math.min(area(a), area(b)))
    const hybrid = [...textClusters, ...clustersNew.filter((c) => !textClusters.some((t) => overlap(t.box, c.box) >= 0.7))]

    const sets: Record<Mode, LabelCluster[]> = { 'tesseract-cu': clustersOld, moi: clustersNew, 'moi+text-layer': hybrid }
    for (const g of pageGts) {
      const sx = image.width / g.refWidth; const sy = image.height / g.refHeight
      const gb: Box = { x0: g.box.x0 * sx, y0: g.box.y0 * sy, x1: g.box.x1 * sx, y1: g.box.y1 * sy }
      const refs = [g.answerText, ...g.alternates]
      const reads = {} as Record<Mode, string | null>; const exact = {} as Record<Mode, boolean>; const cer = {} as Record<Mode, number>
      for (const mode of MODES) {
        let best: LabelCluster | null = null; let bestIou = -1
        for (const c of sets[mode]) {
          const i = inter(gb, c.box)
          if (i / Math.max(1, Math.min(area(gb), area(c.box))) >= 0.5) {
            const iou = i / (area(gb) + area(c.box) - i)
            if (iou > bestIou) { best = c; bestIou = iou }
          }
        }
        reads[mode] = best?.text ?? null
        exact[mode] = best ? refs.map(normalizeForAnswerMatch).includes(normalizeForAnswerMatch(best.text)) : false
        cer[mode] = best ? Math.min(...refs.map((r) => cerWithAccents(best!.text, r))) : 1
      }
      const index = rows.length
      const cw = Math.max(2, Math.ceil(gb.x1 - gb.x0)); const ch = Math.max(2, Math.ceil(gb.y1 - gb.y0))
      const cropCanvas = createCanvas(cw, ch); cropCanvas.getContext('2d').drawImage(image, gb.x0, gb.y0, cw, ch, 0, 0, cw, ch)
      writeFileSync(join(benchDir, 'gt-crops', `${index}.png`), cropCanvas.toBuffer('image/png'))
      const visible = visibleMap[String(index)] ?? null
      const visibleExact = {} as Record<Mode, boolean | null>; const visibleCer = {} as Record<Mode, number | null>
      for (const mode of MODES) {
        visibleExact[mode] = visible == null ? null : (reads[mode] != null && isExactMatch(cleanRef(reads[mode] as string), cleanRef(visible)))
        visibleCer[mode] = visible == null ? null : cerWithAccents(cleanRef(reads[mode] ?? ''), cleanRef(visible))
      }
      rows.push({ index, page: pageNumber, answer: g.answerText, visible, visibleExact, visibleCer, alternates: g.alternates, reads, exact, cer })
    }
    console.log(`  GT ${key.split(/[\\/]/).pop()}: ${pageGts.length} muc`)
  }
  const summary: Record<string, unknown> = {}
  for (const mode of MODES) {
    summary[mode] = { n: rows.length, exact: rows.filter((r) => r.exact[mode]).length / Math.max(1, rows.length),
      cer: rows.reduce((a, r) => a + r.cer[mode], 0) / Math.max(1, rows.length),
      visibleN: rows.filter((r) => r.visible != null).length,
      visibleExact: rows.filter((r) => r.visibleExact[mode] === true).length / Math.max(1, rows.filter((r) => r.visible != null).length),
      visibleCer: rows.filter((r) => r.visible != null).reduce((a, r) => a + (r.visibleCer[mode] ?? 1), 0) / Math.max(1, rows.filter((r) => r.visible != null).length) }
  }
  return { rows, summary }
}

async function main(): Promise<void> {
  console.log(`=== Recognizer bench "${label}" ===`)
  const silver = skipSilver ? null : await runSilver()
  if (silver) console.log('\n--- GT bac (nhan dang thuan, so voi text layer) ---')
  if (silver) console.log('bo nhan dang'.padEnd(20), 'tap'.padEnd(8), 'dung chu'.padEnd(10), 'CER co dau'.padEnd(11), 'CER ko dau'.padEnd(11), 'giay/nhan')
  for (const name of silver ? RECOGNIZERS : []) {
    const s = silver!.summary[name] as Record<string, { n: number; exact: number; cer: number; cerNoAccent: number; secPerLabel: number }>
    for (const set of ['all', 'm11', 'hethan']) {
      const x = s[set]
      console.log(name.padEnd(20), `${set}(${x.n})`.padEnd(8), pct(x.exact).padEnd(10), pct(x.cer).padEnd(11), pct(x.cerNoAccent).padEnd(11), x.secPerLabel.toFixed(2))
    }
  }
  const gt = await runGt()
  if (gt) {
    console.log('\n--- GT 17 muc (pipeline day du: PaddleOCR det -> doc -> gom cum) ---')
    for (const mode of MODES) {
      const s = gt.summary[mode] as { n: number; exact: number; cer: number; visibleN: number; visibleExact: number; visibleCer: number }
      console.log(mode.padEnd(16), `n=${s.n}`.padEnd(6), 'so voi dap an nguoi dung: dung', pct(s.exact).padEnd(7), 'CER', pct(s.cer).padEnd(7),
        s.visibleN > 0 ? `| so voi chu nhin thay (${s.visibleN} muc): dung ${pct(s.visibleExact)} CER ${pct(s.visibleCer)}` : '')
    }
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ label, silver, gt }, null, 2))
  console.log(`\nKet qua chi tiet: ${outPath}`)
}

app.whenReady().then(async () => {
  let exitCode = 0
  try { await main() } catch (error) { console.error(error); exitCode = 1 }
  finally {
    await terminateLabelRecognizer()
    if (legacyWorker) await (await legacyWorker).terminate().catch(() => undefined)
    terminatePaddleOcr(); app.exit(exitCode)
  }
})
