import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { renderPdfPageAsPng, RENDER_SCALE } from './services/textExtraction/pdfRender'
import { recognizeImageLines, terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { rereadVietnameseLines, terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'
import { renderPageDebug } from './services/practice/debugRender'
import type { GroupFragment } from './services/practice/labelGrouping'
import { extractVectorShapes, type VectorShapes } from './services/practice/vectorShapes'

// Cong cu go loi thi giac cho phat hien nhan + duong dan + loc rac cua khu Thuc hanh.
// Chay: npm run practice:debug -- --file=<pdf> --pages=1,13 --out=<thu-muc>
//   tuy chon: --mask (to mau mat na net manh), --no-reread (bo Tesseract), --refresh (bo cache OCR),
//             --panels (in hop trang/mau cua tung manh), --raw (khong ve chu thich),
//             --crop=x0,y0,x1,y1 (cat vung theo pixel anh render 2.2x), --scale=0.6 (ty le anh xuat)
//   --dump: CHI in van ban gon (khong xuat anh): hop vector (box/fill/stroke), net duong dan, cac vung cuoi
//           (box, chu, diem duong dan, nghi rac + ly do). Them --frags de in tung manh chu OCR,
//           --old de tat gom theo hinh khoi (duong cu) so sanh truoc/sau tren cung cache OCR.
// Chi DOC pdf; moi thu ghi vao thu muc --out (cache OCR + anh trang trong out/cache de chay lai nhanh).
//   Khung XANH LA = co duong dan va khong nghi rac; VANG = nghi rac nhung co duong dan; DO = khong co
//   duong dan. Chi tiet cach ve: services/practice/debugRender.ts.

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

const argValue = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

const file = argValue('file')
const pages = (argValue('pages') ?? '1').split(',').map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p > 0)
const outDir = resolve(argValue('out') ?? 'tmp/practice-debug')
if (!file) throw new Error('Thieu --file=<duong dan pdf>')
mkdirSync(join(outDir, 'cache'), { recursive: true })
app.setPath('userData', join(outDir, '.electron-data'))

async function loadFragments(pdf: string, page: number, png: Buffer): Promise<GroupFragment[]> {
  const cachePath = join(outDir, 'cache', `${basename(pdf)}.p${page}${flag('no-reread') ? '.noreread' : ''}.json`)
  if (!flag('refresh') && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8')) as GroupFragment[]
  const lines = (await recognizeImageLines(png)).filter((l) => l.score >= 0.2)
  const readable = flag('no-reread') ? lines : await rereadVietnameseLines(png, lines)
  const fragments = readable.map((l): GroupFragment => ({ box: l.box, text: l.text, confidence: l.score }))
  writeFileSync(cachePath, JSON.stringify(fragments))
  return fragments
}

const r0 = (n: number): number => Math.round(n)
const boxStr = (b: { x0: number; y0: number; x1: number; y1: number }): string => `${r0(b.x0)},${r0(b.y0)},${r0(b.x1)},${r0(b.y1)}`

/** In ban dump van ban cho 1 trang (moi dong ngan). */
function printDump(
  page: number, vector: VectorShapes | null, fragments: GroupFragment[], result: Awaited<ReturnType<typeof renderPageDebug>>
): void {
  const a = result.analysis
  const out: string[] = []
  out.push(`== tr.${page} ${vector ? `${vector.width}x${vector.height}` : 'khong-vector'} manh=${fragments.length} hop-vector=${vector?.rects.length ?? 0} net=${vector?.lines.length ?? 0} anh=${vector?.images.length ?? 0} nguon-hop=${a.panelSource} hop-hop-le=${a.panels.length}`)
  if (flag('frags')) fragments.forEach((f, i) => out.push(` F${i} ${boxStr(f.box)} c${(f.confidence ?? 0).toFixed(2)} "${f.text}"`))
  for (const r of vector?.rects ?? []) out.push(` HOP ${boxStr(r.box)} fill=${r.fill ?? '-'} vien=${r.stroke ?? '-'}${r.stroke ? ' w' + r.lineWidth.toFixed(1) : ''}`)
  const lines = vector?.lines ?? []
  const shown = lines.filter((l) => l.length >= 40).slice(0, 60)
  for (const l of shown) {
    const p0 = l.points[0]; const p1 = l.points[l.points.length - 1]
    out.push(` NET ${l.source} ${l.color} w${l.width.toFixed(1)} dai${r0(l.length)} ${r0(p0[0])},${r0(p0[1])}->${r0(p1[0])},${r0(p1[1])}${l.hasArrowHead ? ' mui-ten' : ''}`)
  }
  if (lines.length > shown.length) out.push(` (con ${lines.length - shown.length} net ngan <40px an)`)
  let withLeader = 0; let suspect = 0; let multi = 0
  a.labels.forEach((l, i) => {
    if (l.leader.hasLeader) withLeader++
    if (l.verdict.suspect) suspect++
    if (l.members.length > 1) multi++
    const ep = l.leader.endpoint ? ` ->${r0(l.leader.endpoint.x)},${r0(l.leader.endpoint.y)}` : ''
    out.push(` V${i + 1} ${l.origin === 'free' ? 'free' : l.origin === 'panel-vector' ? 'hop-vec' : 'hop-anh'}/${l.leaderSource} ${boxStr(l.box)} m${l.members.length} L${l.leader.score.toFixed(2)}${ep} c${(l.confidence ?? 0).toFixed(2)} "${l.text}"${l.verdict.suspect ? ' SUSPECT: ' + l.verdict.reasons.join('; ') : ''}`)
  })
  out.push(` TONG ${a.labels.length} vung | co-duong-dan ${withLeader} | nghi-rac ${suspect} | vung-nhieu-manh ${multi}`)
  console.log(out.join('\n'))
}

async function renderOne(pdf: string, page: number): Promise<void> {
  const png = await renderPdfPageAsPng(pdf, page, RENDER_SCALE)
  const pagePng = join(outDir, 'cache', `${basename(pdf)}.p${page}.page.png`)
  if (!existsSync(pagePng)) writeFileSync(pagePng, png)
  const t0 = Date.now()
  const fragments = await loadFragments(pdf, page, png)
  const ocrSeconds = (Date.now() - t0) / 1000
  const cropArg = (argValue('crop') ?? '').split(',').map(Number)
  const crop = cropArg.length === 4 && cropArg.every((n) => Number.isFinite(n))
    ? (cropArg as [number, number, number, number]) : undefined
  const vector = await extractVectorShapes(pdf, page, RENDER_SCALE)
  const result = await renderPageDebug(png, fragments, page, {
    vector, analysis: flag('old') ? { disablePanels: true } : undefined,
    mask: flag('mask'), raw: flag('raw'), panels: flag('panels'), crop, scale: Number(argValue('scale')) || undefined
  })
  if (flag('dump')) { printDump(page, vector, fragments, result); return }
  const stem = basename(pdf).replace(/\.pdf$/i, '').replace(/[^\w-]+/g, '_')
  const name = `${stem}_p${page}${crop ? '_crop' + crop.map(Math.round).join('-') : ''}${flag('raw') ? '_raw' : ''}${flag('mask') ? '_mask' : ''}`
  writeFileSync(join(outDir, `${name}.png`), result.png)
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(result.detail, null, 1))
  console.log(`${result.summary}\n   OCR ${ocrSeconds}s -> ${name}.png`)
}

app.whenReady().then(async () => {
  let exitCode = 0
  try {
    for (const page of pages) await renderOne(resolve(file as string), page)
  } catch (error) { console.error(error); exitCode = 1 }
  finally { await terminateVietnameseOcr(); terminatePaddleOcr(); app.exit(exitCode) }
})
