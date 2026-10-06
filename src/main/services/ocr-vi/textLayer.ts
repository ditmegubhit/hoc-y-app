import { scoreVietnameseText, type TextVietnameseScore } from './vietnameseSyllable'

// Danh gia text layer cua PDF (thuan, khong phu thuoc Electron/pdfjs).
// Phat hien tu phep do tren 2 PDF mau:
//  - Text layer PowerPoint xuat PDF thuong DUNG chu nhung tach tung "run" theo font
//    (vd "tm th" + "ượ" + "ng th" + "ậ" + "n trai"): ghep theo vi tri lien ke (khong chen
//    khoang trang) thi duoc dung "tm thượng thận trái". Neu ghep bang dau cach thi ra
//    "th ượ ng th ậ n" (loi cua bo word_positions cu).
//  - Text layer do OCR nhung (PDF scan/anh) thuong co phong chu BIEN DANG (transform a != d,
//    vd 105.9 x 10.3) va noi dung rac ("AM fines", "hocu") -> khong tin.

export interface TextLayerItem {
  str: string
  /** transform cua pdfjs: [a, b, c, d, e, f]; (e, f) = goc co so (baseline) he toa do PDF (y len). */
  transform: number[]
  width: number
  height: number
}

export interface TextLayerLine {
  text: string
  /** Hop (point PDF, y huong LEN): x0<x1, y0<y1. */
  box: { x0: number; y0: number; x1: number; y1: number }
  fontSize: number
  /** Lech ti le co chu x/y lon nhat trong dong (0 = deu); font bi keo gian thi > 0.12. */
  skew: number
  /** Chenh co chu lon nhat giua cac run trong dong (ti le). */
  sizeSpread: number
  score: TextVietnameseScore
  trusted: boolean
  /** Ly do khong tin (rong neu tin). */
  reasons: string[]
}

const MIN_FONT = 3
const MAX_SKEW = 0.12
const MAX_SIZE_SPREAD = 0.2

interface Run { str: string; x0: number; x1: number; baseline: number; size: number; skew: number }

function toRuns(items: TextLayerItem[]): Run[] {
  const runs: Run[] = []
  for (const item of items) {
    if (item.str.trim() === '' || item.width <= 0) continue
    const [a, b, , d, e, f] = item.transform
    if (![a, b, d, e, f].every(Number.isFinite)) continue
    const size = Math.abs(d)
    if (size <= 0) continue
    const skew = Math.abs(Math.abs(a) / size - 1)
    runs.push({ str: item.str, x0: e, x1: e + item.width, baseline: f, size, skew })
  }
  return runs
}

/** Ghep cac run thanh dong chu: cung baseline (<=0.5 co chu), noi lien tiep theo x.
 * Khoang cach giua 2 run < 0.2 co chu -> ghep THANG (am tiet Viet bi tach theo font);
 * lon hon -> chen 1 dau cach (tru khi run da co san dau cach). */
export function mergeTextItemsIntoLines(items: TextLayerItem[]): TextLayerLine[] {
  const runs = toRuns(items).sort((p, q) => q.baseline - p.baseline || p.x0 - q.x0)
  const groups: Run[][] = []
  for (const run of runs) {
    const group = groups.find((g) => {
      const last = g[g.length - 1]
      return Math.abs(last.baseline - run.baseline) <= Math.min(last.size, run.size) * 0.5
    })
    if (group) group.push(run); else groups.push([run])
  }
  const lines: TextLayerLine[] = []
  for (const group of groups) {
    group.sort((p, q) => p.x0 - q.x0)
    // Tach thanh nhieu dong khi co khoang trong lon (2 nhan cung hang nhung o xa nhau).
    const segments: Run[][] = []
    let current: Run[] = []
    for (const run of group) {
      const last = current[current.length - 1]
      if (last && run.x0 - last.x1 > Math.max(last.size, run.size) * 1.5 && last.str.trim() !== '' && run.str.trim() !== '') {
        segments.push(current); current = []
      }
      current.push(run)
    }
    if (current.length) segments.push(current)
    for (const segment of segments) {
      let text = ''
      let prev: Run | null = null
      for (const run of segment) {
        if (prev) {
          const gap = run.x0 - prev.x1
          const joined = gap < Math.min(prev.size, run.size) * 0.2
          if (!joined && !/\s$/u.test(text) && !/^\s/u.test(run.str)) text += ' '
        }
        text += run.str
        prev = run
      }
      const clean = text.normalize('NFC').replace(/\s+/gu, ' ').trim()
      const solid = segment.filter((r) => r.str.trim() !== '')
      if (clean === '' || solid.length === 0) continue
      const sizes = solid.map((r) => r.size)
      const fontSize = Math.max(...sizes)
      const minSize = Math.min(...sizes)
      const x0 = Math.min(...solid.map((r) => r.x0))
      const x1 = Math.max(...solid.map((r) => r.x1))
      const baseline = solid[0].baseline
      const line: TextLayerLine = {
        text: clean, fontSize,
        box: { x0, x1, y0: baseline - fontSize * 0.22, y1: baseline + fontSize * 0.8 },
        skew: Math.max(...solid.map((r) => r.skew)),
        sizeSpread: fontSize > 0 ? (fontSize - minSize) / fontSize : 0,
        score: scoreVietnameseText(clean), trusted: false, reasons: []
      }
      const reasons: string[] = []
      if (line.fontSize < MIN_FONT) reasons.push('chu qua nho')
      if (line.skew > MAX_SKEW) reasons.push('font bi keo gian (text layer do OCR)')
      if (line.sizeSpread > MAX_SIZE_SPREAD) reasons.push('co chu giua cac run lech nhau')
      if (line.score.tokens === 0) reasons.push('khong co chu')
      else if (line.score.fragmented) reasons.push('am tiet bi tach')
      else if (line.score.ratio < 0.75) reasons.push('nhieu tu khong phai am tiet Viet')
      else if (line.score.tokens <= 2 && line.score.abbr < line.score.tokens && !/[^ -~]/u.test(clean) && clean.length >= 3) reasons.push('ngan va khong dau (nghi OCR nhung)')
      line.reasons = reasons
      line.trusted = reasons.length === 0
      lines.push(line)
    }
  }
  return lines.sort((p, q) => q.box.y1 - p.box.y1 || p.box.x0 - q.box.x0)
}

export interface TextLayerAssessment {
  lines: TextLayerLine[]
  trustedLines: number
  totalLines: number
  trustedRatio: number
  /** Ca trang dang tin: co it nhat 1 dong va >=85% dong dang tin (hoac khong co dong rac). */
  trustworthy: boolean
}

export function assessTextLayer(items: TextLayerItem[]): TextLayerAssessment {
  const lines = mergeTextItemsIntoLines(items)
  const trustedLines = lines.filter((l) => l.trusted).length
  const trustedRatio = lines.length === 0 ? 0 : trustedLines / lines.length
  return { lines, trustedLines, totalLines: lines.length, trustedRatio, trustworthy: lines.length > 0 && trustedRatio >= 0.85 }
}

/** Co nen TIN text layer cua trang nay (de bo qua OCR) khong?
 * Dung ket qua theo tung dong (`assessTextLayer(items).lines[i].trusted`) neu can OCR chi cac dong con lai. */
export function isTextLayerTrustworthy(items: TextLayerItem[]): boolean {
  return assessTextLayer(items).trustworthy
}
