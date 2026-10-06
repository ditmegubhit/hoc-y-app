import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { getDb } from './db'
import { detectLabelClustersForPage } from './services/anatomy/detectPage'
import { terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'
import { normalizeForAnswerMatch } from '../shared/text/normalizeVietnamese'
import type { LabelCluster } from './services/anatomy/labelDetection'

// Bo do do chinh xac OCR cho Giai phau (Thi TH GP).
// Chay: npm run ocr:bench -- --label=baseline [--max-pages=30] [--out=duong-dan.json]
// Dap an chuan (GT) = vung nguoi dung DICH THAN sua trong ban sao luu DB.
// Chi DOC pdf goc; moi thu ghi nam trong tmp/ocr-bench.

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

const argValue = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const label = argValue('label') ?? 'baseline'
const maxPages = Math.max(1, Number(argValue('max-pages') ?? 30) || 30)
const benchDir = resolve('tmp/ocr-bench')
const outPath = resolve(argValue('out') ?? join(benchDir, `results-${label}.json`))
const dataDir = join(benchDir, 'app-data')
const BACKUP_DB = resolve('..', 'hoc-y-app-backup-2026-10-06', 'hoc-y-app.sqlite3')

mkdirSync(dataDir, { recursive: true })
if (!existsSync(join(dataDir, 'hoc-y-app.sqlite3'))) {
  if (!existsSync(BACKUP_DB)) throw new Error(`Khong thay ban sao luu DB: ${BACKUP_DB}`)
  copyFileSync(BACKUP_DB, join(dataDir, 'hoc-y-app.sqlite3'))
}
app.setPath('userData', dataDir)

interface Box { x0: number; y0: number; x1: number; y1: number }

interface GroundTruth {
  candidateId: string
  attachmentId: string
  fileName: string
  storedPath: string
  pageNumber: number
  box: Box
  refWidth: number
  refHeight: number
  answerText: string
  alternates: string[]
  kinds: string[] // a = vung ve tay, b = co dap an chap nhan them, c = sua dap an
}

interface GtResult {
  id: string
  file: string
  page: number
  answer: string
  alternates: string[]
  kinds: string[]
  matched: boolean
  readText: string | null
  readSource: string | null
  readConfidence: number | null
  exact: boolean
  cer: number | null // CER tot nhat so voi (dap an | alternates), chi khi co cum khop
  cerPrimary: number | null // CER so voi answerText
  splitClusters: number // so cum chong >=0.3 dien tich cum len GT box
  split: boolean
  overlapTexts: string[]
}

interface PageResult { file: string; page: number; seconds: number; clusters: number; gtCount: number }

const area = (b: Box): number => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
function intersection(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
}

function levenshtein(a: string, b: string): number {
  const x = [...a]; const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]
}

function cerOf(read: string, ref: string): number {
  const r = normalizeForAnswerMatch(ref)
  const t = normalizeForAnswerMatch(read)
  if (r.length === 0) return t.length === 0 ? 0 : 1
  return levenshtein(t, r) / r.length
}

const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length

function loadGroundTruth(): GroundTruth[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT c.id AS candidate_id, c.attachment_id, c.page_number, c.raw_text, c.label_box_json, c.ref_width, c.ref_height,
           q.answer_text, q.accepted_alternates_json, a.file_name, a.stored_path
    FROM anatomy_questions q
    JOIN anatomy_label_candidates c ON c.id = q.candidate_id
    JOIN attachments a ON a.id = c.attachment_id
    WHERE a.file_type = 'pdf'
    ORDER BY c.attachment_id, c.page_number, c.id`).all() as Array<{
    candidate_id: string; attachment_id: string; page_number: number; raw_text: string; label_box_json: string
    ref_width: number; ref_height: number; answer_text: string; accepted_alternates_json: string
    file_name: string; stored_path: string
  }>
  const byCandidate = new Map<string, GroundTruth>()
  for (const r of rows) {
    const alternates = (JSON.parse(r.accepted_alternates_json || '[]') as unknown[]).filter((x): x is string => typeof x === 'string')
    const kinds: string[] = []
    if (r.raw_text.trim() === '') kinds.push('a')
    if (alternates.length > 0) kinds.push('b')
    const changed = r.answer_text.trim().toLowerCase() !== r.raw_text.trim().toLowerCase()
    const junk = letterCount(r.answer_text) < 2 || /^d$/i.test(r.answer_text.trim())
    if (changed && !junk && r.raw_text.trim() !== '') kinds.push('c')
    if (kinds.length === 0) continue
    // Cau rac o nhom (a)/(b) van phai co dap an co nghia de lam GT.
    if (letterCount(r.answer_text) < 2) continue
    const existing = byCandidate.get(r.candidate_id)
    if (existing) {
      existing.alternates = [...new Set([...existing.alternates, ...alternates])]
      existing.kinds = [...new Set([...existing.kinds, ...kinds])]
      continue
    }
    byCandidate.set(r.candidate_id, {
      candidateId: r.candidate_id, attachmentId: r.attachment_id, fileName: r.file_name, storedPath: r.stored_path,
      pageNumber: r.page_number, box: JSON.parse(r.label_box_json) as Box, refWidth: r.ref_width, refHeight: r.ref_height,
      answerText: r.answer_text, alternates, kinds
    })
  }
  return [...byCandidate.values()]
}

/** Chon toi da maxPages trang co GT, chia deu giua cac file va rai deu trong moi file. */
function selectPages(gts: GroundTruth[]): Array<{ attachmentId: string; page: number }> {
  const perFile = new Map<string, number[]>()
  for (const g of gts) {
    const pages = perFile.get(g.attachmentId) ?? []
    if (!pages.includes(g.pageNumber)) pages.push(g.pageNumber)
    perFile.set(g.attachmentId, pages)
  }
  const files = [...perFile.entries()].map(([id, pages]) => ({ id, pages: pages.sort((a, b) => a - b) }))
  const quota = new Map<string, number>()
  let remaining = maxPages
  let open = files.slice()
  while (remaining > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(remaining / open.length))
    const next: typeof open = []
    for (const f of open) {
      const have = quota.get(f.id) ?? 0
      const give = Math.min(share, f.pages.length - have, remaining)
      quota.set(f.id, have + give); remaining -= give
      if (have + give < f.pages.length) next.push(f)
    }
    open = next
  }
  const picked: Array<{ attachmentId: string; page: number }> = []
  for (const f of files) {
    const n = quota.get(f.id) ?? 0
    for (let i = 0; i < n; i++) {
      picked.push({ attachmentId: f.id, page: f.pages[Math.floor(((i + 0.5) * f.pages.length) / n)] })
    }
  }
  return picked
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

async function main(): Promise<void> {
  const gts = loadGroundTruth()
  const fileName = (id: string): string => gts.find((g) => g.attachmentId === id)?.fileName ?? id
  console.log(`=== OCR bench "${label}" ===`)
  console.log(`Tong so muc GT: ${gts.length}`)
  const gtByFilePage = new Map<string, number>()
  for (const g of gts) {
    const k = `${g.fileName} (${g.attachmentId.slice(0, 8)})`
    gtByFilePage.set(k, (gtByFilePage.get(k) ?? 0) + 1)
  }
  for (const [k, n] of gtByFilePage) {
    const pages = new Set(gts.filter((g) => `${g.fileName} (${g.attachmentId.slice(0, 8)})` === k).map((g) => g.pageNumber))
    console.log(`  ${k}: ${n} muc GT tren ${pages.size} trang`)
  }
  const kindCount = (k: string): number => gts.filter((g) => g.kinds.includes(k)).length
  console.log(`  Theo nhom: (a) ve tay=${kindCount('a')}, (b) co alternates=${kindCount('b')}, (c) sua dap an=${kindCount('c')}`)

  const pages = selectPages(gts)
  console.log(`Do ${pages.length} trang (max-pages=${maxPages}): ${pages.map((p) => `${fileName(p.attachmentId).slice(0, 8)}#${p.page}`).join(', ')}`)

  const results: GtResult[] = []
  const pageResults: PageResult[] = []
  for (const [index, p] of pages.entries()) {
    const pageGts = gts.filter((g) => g.attachmentId === p.attachmentId && g.pageNumber === p.page)
    const started = Date.now()
    let clusters: LabelCluster[]
    let target: { width: number; height: number }
    try {
      const out = await detectLabelClustersForPage(pageGts[0].storedPath, p.attachmentId, p.page)
      clusters = out.clusters; target = out.target
    } catch (error) {
      console.error(`Trang ${p.page} loi:`, error)
      continue
    }
    const seconds = (Date.now() - started) / 1000
    pageResults.push({ file: fileName(p.attachmentId), page: p.page, seconds, clusters: clusters.length, gtCount: pageGts.length })

    for (const g of pageGts) {
      const sx = target.width / g.refWidth; const sy = target.height / g.refHeight
      const gb: Box = { x0: g.box.x0 * sx, y0: g.box.y0 * sy, x1: g.box.x1 * sx, y1: g.box.y1 * sy }
      const gArea = Math.max(1, area(gb))
      // Khop: giao / dien tich nho hon >= 0.5; chon cum co IoU cao nhat.
      let best: LabelCluster | null = null; let bestIou = -1
      const overlapping: LabelCluster[] = []
      for (const c of clusters) {
        const inter = intersection(gb, c.box)
        const cArea = Math.max(1, area(c.box))
        if (inter / Math.min(gArea, cArea) >= 0.5) {
          const iou = inter / (gArea + cArea - inter)
          if (iou > bestIou) { best = c; bestIou = iou }
        }
        if (inter / cArea >= 0.3) overlapping.push(c)
      }
      const refs = [g.answerText, ...g.alternates]
      const normRefs = refs.map(normalizeForAnswerMatch)
      const readText = best ? best.text : null
      const exact = best ? normRefs.includes(normalizeForAnswerMatch(best.text)) : false
      const cers = best ? refs.map((r) => cerOf(best.text, r)) : []
      results.push({
        id: g.candidateId, file: g.fileName, page: g.pageNumber, answer: g.answerText, alternates: g.alternates,
        kinds: g.kinds, matched: best != null, readText, readSource: best?.coordSpace ?? null,
        readConfidence: best?.confidence ?? null, exact,
        cer: best ? Math.min(...cers) : null, cerPrimary: best ? cers[0] : null,
        splitClusters: overlapping.length, split: overlapping.length >= 2,
        overlapTexts: overlapping.map((c) => c.text)
      })
    }
    const done = results.filter((r) => r.page === p.page && r.file === fileName(p.attachmentId))
    console.log(`[${index + 1}/${pages.length}] ${fileName(p.attachmentId).slice(0, 14)} tr.${p.page}: ${clusters.length} cum, ` +
      `${done.filter((r) => r.matched).length}/${done.length} GT khop vung, ${done.filter((r) => r.exact).length} dung chu, ${seconds.toFixed(1)}s`)
  }

  // ---- tong hop ----
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
  const summarize = (rs: GtResult[]) => {
    const matched = rs.filter((r) => r.matched)
    const cerMatched = matched.length ? sum(matched.map((r) => r.cer ?? 0)) / matched.length : 0
    const cerAll = rs.length ? sum(rs.map((r) => (r.matched ? r.cer ?? 0 : 1))) / rs.length : 0
    return {
      gt: rs.length,
      recall: rs.length ? matched.length / rs.length : 0,
      exactOverGt: rs.length ? rs.filter((r) => r.exact).length / rs.length : 0,
      exactOverMatched: matched.length ? matched.filter((r) => r.exact).length / matched.length : 0,
      cerMatched, cerAll,
      split: rs.filter((r) => r.split).length
    }
  }
  const overall = summarize(results)
  const pageCount = pageResults.length
  const avgClusters = pageCount ? sum(pageResults.map((p) => p.clusters)) / pageCount : 0
  const avgSeconds = pageCount ? sum(pageResults.map((p) => p.seconds)) / pageCount : 0
  const perFile = [...new Set(results.map((r) => r.file))].map((f) => ({ file: f, ...summarize(results.filter((r) => r.file === f)),
    pages: pageResults.filter((p) => p.file === f).length }))
  const perSource = ['pdf_point', 'image_pixel'].map((s) => {
    const rs = results.filter((r) => r.readSource === s)
    return { source: s, n: rs.length, exact: rs.filter((r) => r.exact).length }
  })
  const perKind = ['a', 'b', 'c'].map((k) => ({ kind: k, ...summarize(results.filter((r) => r.kinds.includes(k))) }))

  const summary = { label, pagesMeasured: pageCount, totalGtInDb: gts.length, overall, avgClustersPerPage: avgClusters,
    avgSecondsPerPage: avgSeconds, perFile, perSource, perKind }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ summary, pages: pageResults, items: results }, null, 2))

  console.log('\n=========== TOM TAT ===========')
  console.log(`Nhan: ${label} | ${pageCount} trang | ${overall.gt} muc GT do duoc (tong GT: ${gts.length})`)
  console.log(`Recall vung (GT co cum khop >=0.5): ${pct(overall.recall)}`)
  console.log(`Dung chu (tren tong GT): ${pct(overall.exactOverGt)} | (tren GT co cum khop): ${pct(overall.exactOverMatched)}`)
  console.log(`CER (tren GT co cum khop): ${pct(overall.cerMatched)} | CER tinh ca GT bo sot (=100%): ${pct(overall.cerAll)}`)
  console.log(`GT bi tach (>=2 cum chong): ${overall.split}/${overall.gt}`)
  console.log(`Cum trung binh moi trang: ${avgClusters.toFixed(1)} | Thoi gian: ${avgSeconds.toFixed(1)} giay/trang`)
  for (const f of perFile) {
    console.log(`  - ${f.file} (${f.pages} trang, ${f.gt} GT): recall ${pct(f.recall)}, dung chu ${pct(f.exactOverGt)}, CER ${pct(f.cerMatched)}, tach ${f.split}`)
  }
  for (const k of perKind) {
    console.log(`  - nhom (${k.kind}) ${k.gt} GT: recall ${pct(k.recall)}, dung chu ${pct(k.exactOverGt)}, CER ${pct(k.cerMatched)}, tach ${k.split}`)
  }
  for (const s of perSource) console.log(`  - cum khop tu nguon ${s.source}: ${s.n}, dung chu ${s.exact}`)
  const wrong = results.filter((r) => r.matched && !r.exact).slice(0, 25)
  console.log(`\nMau doc sai (toi da 25): "doc duoc" -> "dap an"`)
  for (const r of wrong) console.log(`  [${r.readSource}] "${r.readText}" -> "${r.answer}"${r.alternates.length ? ` (alt: ${r.alternates.join(' / ')})` : ''}  CER ${pct(r.cer ?? 0)}`)
  const missed = results.filter((r) => !r.matched).slice(0, 10)
  console.log(`\nGT bi bo sot (toi da 10):`)
  for (const r of missed) console.log(`  tr.${r.page} "${r.answer}" [${r.kinds.join('')}]`)
  console.log(`\nKet qua chi tiet: ${outPath}`)
}

app.whenReady().then(async () => {
  let exitCode = 0
  try { await main() } catch (error) { console.error(error); exitCode = 1 }
  finally { await terminateVietnameseOcr(); terminatePaddleOcr(); app.exit(exitCode) }
})
