import { createCanvas, loadImage } from '@napi-rs/canvas'
import { analyzePageLabels, type PageAnalysis, type PageAnalysisOptions } from './pageAnalysis'
import { findLabelPanel, getLeaderMask, type RgbaImage } from './leaderLine'
import type { GroupFragment } from './labelGrouping'
import type { VectorShapes } from './vectorShapes'

// Ve anh chu thich cho go loi thi giac (dung chung boi practiceVisualDebug va cac script do).
// Khung XANH LA = co duong dan va khong nghi rac; VANG = nghi rac nhung co duong dan; DO = khong co
// duong dan. Duong ke + cham tron = duong dan + dau cuoi. Khung xanh nhat = hop (panel) cua nhan.
// Net xanh duong dut = vung anh chinh.

export interface DebugRenderOptions {
  mask?: boolean
  raw?: boolean
  panels?: boolean
  crop?: [number, number, number, number]
  scale?: number
  analysis?: PageAnalysisOptions
  /** Doi tuong vector cua trang (bo/null = trang khong co vector). */
  vector?: VectorShapes | null
}

export interface DebugRenderResult {
  png: Buffer
  analysis: PageAnalysis
  summary: string
  detail: Array<Record<string, unknown>>
}

export async function renderPageDebug(
  pagePng: Buffer, fragments: GroupFragment[], pageNumber: number, opts: DebugRenderOptions = {}
): Promise<DebugRenderResult> {
  const image = await loadImage(pagePng)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const raw = ctx.getImageData(0, 0, image.width, image.height)
  const rgba: RgbaImage = { data: raw.data, width: image.width, height: image.height }

  const extra: string[] = []
  if (opts.panels) {
    for (const f of fragments) {
      const panel = findLabelPanel(rgba, f.box, opts.analysis?.leader)
      extra.push(`   frag "${f.text}" box ${JSON.stringify(f.box)} -> boxed=${panel.boxed} bordered=${panel.bordered} rect=${JSON.stringify(panel.rect)} fill=${JSON.stringify(panel.fill)}`)
    }
  }
  const t0 = Date.now()
  const analysis = analyzePageLabels(rgba, fragments, { ...opts.analysis, vector: opts.vector ?? opts.analysis?.vector })
  const seconds = (Date.now() - t0) / 1000

  if (opts.mask) {
    const mask = getLeaderMask(rgba, opts.analysis?.leader)
    const out = ctx.getImageData(0, 0, image.width, image.height)
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) { out.data[i * 4] = 255; out.data[i * 4 + 1] = 0; out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = 255 }
    }
    ctx.putImageData(out, 0, 0)
  }

  const lw = Math.max(2, Math.round(image.width / 700))
  const fontPx = Math.max(12, Math.round(image.width / 90))
  ctx.font = `bold ${fontPx}px Arial`
  ctx.textBaseline = 'bottom'
  if (analysis.contentRect && !opts.raw) {
    const c = analysis.contentRect
    ctx.setLineDash([12, 8]); ctx.strokeStyle = '#00aaff'; ctx.lineWidth = lw
    ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0)
    ctx.setLineDash([])
  }
  let withLeader = 0; let suspect = 0
  for (const label of analysis.labels) {
    const { box, leader, verdict } = label
    if (leader.hasLeader) withLeader++
    if (verdict.suspect) suspect++
    if (opts.raw) continue
    const color = !leader.hasLeader ? '#ff2020' : verdict.suspect ? '#ffc400' : '#00d040'
    const p = leader.panel.rect
    ctx.strokeStyle = 'rgba(0,200,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0)
    ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
    if (leader.hasLeader && leader.attach && leader.endpoint) {
      ctx.beginPath(); ctx.moveTo(leader.attach.x, leader.attach.y)
      for (const pt of leader.branches[0]?.path ?? [leader.endpoint]) ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, lw - 1); ctx.stroke()
      ctx.beginPath(); ctx.arc(leader.endpoint.x, leader.endpoint.y, lw * 3, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
    }
    const caption = `${leader.score.toFixed(2)} ${verdict.codes.join(',')}`.trim()
    const tw = ctx.measureText(caption).width
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(box.x0, box.y0 - fontPx - 2, tw + 6, fontPx + 2)
    ctx.fillStyle = color; ctx.fillText(caption, box.x0 + 3, box.y0 - 1)
  }

  // Xuat anh: thu nho neu qua lon de cong cu doc anh khong mat chi tiet.
  const [cx0, cy0, cx1, cy1] = opts.crop ?? [0, 0, image.width, image.height]
  const scale = opts.scale && opts.scale > 0 ? opts.scale : opts.crop ? 1 : Math.min(1, 1700 / Math.max(image.width, image.height))
  const outCanvas = createCanvas(Math.round((cx1 - cx0) * scale), Math.round((cy1 - cy0) * scale))
  outCanvas.getContext('2d').drawImage(canvas, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, outCanvas.width, outCanvas.height)

  const lines = analysis.labels.map((l) =>
    `   [${l.leader.hasLeader ? 'L' : '-'}${l.verdict.suspect ? 'S' : ' '}] ${l.origin === 'free' ? 'free' : l.origin === 'panel-vector' ? 'P-vec' : 'P-img'}/${l.leaderSource} ${l.leader.score.toFixed(2)} c${(l.confidence ?? 0).toFixed(2)} ink${l.inkRatio.toFixed(2)} "${l.text}" ${l.verdict.codes.join(',')}`)
  const summary = `tr.${pageNumber}: ${analysis.labels.length} nhan, ${withLeader} co duong dan, ${suspect} nghi rac | frag ${fragments.length} | phan tich ${seconds}s\n${[...extra, ...lines].join('\n')}`
  const detail = analysis.labels.map((l) => ({
    text: l.text, box: l.box, confidence: l.confidence, panel: l.leader.panel, origin: l.origin, leaderSource: l.leaderSource, members: l.members,
    leader: { score: l.leader.score, has: l.leader.hasLeader, kind: l.leader.kind, seedInfo: l.leader.seedInfo },
    candidates: l.leader.candidates.map((c) => ({
      score: +c.score.toFixed(2), attach: c.attach, end: c.endpoint, extent: Math.round(c.extent),
      support: +c.supportFrac.toFixed(2), color: +c.colorConsistency.toFixed(2), thick: c.thickness
    })),
    suspect: l.verdict.suspect, codes: l.verdict.codes
  }))
  return { png: outCanvas.toBuffer('image/png'), analysis, summary, detail }
}
