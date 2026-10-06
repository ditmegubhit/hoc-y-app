import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import type { Rect } from '../../../shared/types/anatomyQuiz'
import { RENDER_SCALE } from '../textExtraction/pdfRender'

// Lay DOI TUONG VECTOR (hop chu nhat, net duong dan, dau mui ten) tu danh sach lenh ve cua pdfjs.
// PDF xuat tu PowerPoint luu hop/duong dan dang vector voi toa do + mau chinh xac -> chinh xac hon
// hang nghin lan so voi doan hinh tren anh. Trang scan/anh chup khong co vector -> rects/lines rong.
//
// Cau truc lenh pdfjs-dist 6.x (da doc ma nguon pdf.worker.mjs, KHONG doan):
//  - getOperatorList() tra { fnArray, argsArray }. Duong ve duoc gop thanh MOT lenh constructPath
//    voi args = [paintOp, [Float32Array path], Float32Array minMax]:
//      paintOp = OPS.stroke | fill | eoFill | fillStroke | eoFillStroke | close* | endPath (endPath = clip/no-op).
//      path = day phang: DrawOPS.moveTo(0) x y | lineTo(1) x y | curveTo(2) x1 y1 x2 y2 x y |
//             quadraticCurveTo(3) x1 y1 x y | closePath(4). Lenh `re` da duoc bung thanh m/l/l/l/z.
//    DrawOPS KHONG duoc export tu pdf.mjs -> khai bao lai o day.
//  - Mau: setFillRGBColor/setStrokeRGBColor args = ["#rrggbb"] (chuoi hex); gray/cmyk/N duoc xu ly them.
//  - Trinh toi uu cua pdfjs co the gop save+transform(tinh tien/1:1)+constructPath+restore thanh 1 lenh,
//    luc do toa do da duoc bake san vao path (khong con transform) -> van dung CTM binh thuong.
//  - Anh: paintImageXObject (ve trong don vi vuong [0,1]^2 qua CTM). Toa do ra: nhan voi viewport.transform
//    (y huong xuong) = he toa do pixel anh render RENDER_SCALE.

export interface VectorRect {
  box: Rect
  /** Mau nen "#rrggbb" (neu to). */
  fill?: string
  /** Mau vien "#rrggbb" (neu co net vien nhin thay duoc). */
  stroke?: string
  /** Do day vien theo pixel anh. */
  lineWidth: number
}

export interface VectorLine {
  /** Cac diem (pixel anh), thu tu theo net ve. */
  points: Array<[number, number]>
  color: string
  /** Do day (pixel anh). */
  width: number
  hasArrowHead: boolean
  /** Do dai duong (tong cac doan). */
  length: number
  /** 'stroke' = net ve bang stroke; 'fill' = duong day dang da giac tho tren nen (PowerPoint hay xuat the). */
  source: 'stroke' | 'fill'
}

export interface VectorShapes {
  width: number
  height: number
  rects: VectorRect[]
  lines: VectorLine[]
  /** Hop bao cua cac anh raster duoc ve tren trang. */
  images: Rect[]
  stats: { constructPaths: number; images: number; rawRects: number; thinPolygons: number; arrowHeads: number }
}

export interface VectorOptions {
  /** Hop phu >= ti le nay cua dien tich trang -> coi la nen trang, bo. */
  maxPageAreaRatio: number
  /** Hop co canh ngan hon (pixel) nay -> khong phai hop chu. */
  minBoxSidePx: number
  /** Canh ngan hon nay (pixel) -> coi la net ke/duong, khong phai hop. */
  thinSidePx: number
  /** Nua da giac mong: do day <= max(thinPolygonMinPx, ti le * do dai). */
  thinPolygonMinPx: number
  thinPolygonRatio: number
  /** Do dai toi thieu (pixel) cua mot duong. */
  minLinePx: number
  /** Dau mui ten: kich thuoc toi da (pixel) va khoang cach toi dau net. */
  arrowHeadMaxPx: number
  arrowHeadAttachPx: number
  /** Do mo toi thieu de coi la nhin thay duoc. */
  minAlpha: number
}

export const DEFAULT_VECTOR_OPTIONS: VectorOptions = {
  maxPageAreaRatio: 0.6,
  minBoxSidePx: 8,
  thinSidePx: 3.5,
  thinPolygonMinPx: 5,
  thinPolygonRatio: 0.12,
  minLinePx: 6,
  arrowHeadMaxPx: 48,
  arrowHeadAttachPx: 9,
  minAlpha: 0.2
}

// --- Hang so pdfjs (OPS cua pdfjs-dist 6.x; doi chieu qua ten khi co bang OPS thuc) ---
export const DRAW_OPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const

/** Bang tra OPS (ten -> so) do pdfjs cap; chi can cac ten duoi day. */
export type OpsTable = Record<string, number>

export interface OperatorListLike {
  fnArray: ArrayLike<number>
  argsArray: ArrayLike<unknown>
}

type Matrix = [number, number, number, number, number, number]

/** m1 o m2: ap m2 truoc roi m1 (dung nhu ctx.transform: CTM moi = CTM * M). */
function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const scaleOf = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

interface GState {
  ctm: Matrix
  fill: string | null
  stroke: string | null
  fillAlpha: number
  strokeAlpha: number
  lineWidth: number
}

const hex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** args mau -> "#rrggbb" hoac null (pattern/khong ro). */
function colorFromArgs(kind: 'rgb' | 'gray' | 'cmyk' | 'other', args: unknown): string | null {
  const a = args as unknown[]
  if (!Array.isArray(a)) return null
  if (kind === 'rgb') {
    if (typeof a[0] === 'string' && /^#[0-9a-fA-F]{6}$/.test(a[0])) return a[0].toLowerCase()
    if (a.length >= 3 && a.every((v) => typeof v === 'number')) {
      const n = a as number[]
      const k = n.every((v) => v <= 1) ? 255 : 1
      return `#${hex2(n[0] * k)}${hex2(n[1] * k)}${hex2(n[2] * k)}`
    }
    return null
  }
  if (kind === 'gray') {
    if (typeof a[0] === 'string' && /^#[0-9a-fA-F]{6}$/.test(a[0])) return a[0].toLowerCase()
    if (typeof a[0] === 'number') { const g = hex2(a[0] <= 1 ? a[0] * 255 : a[0]); return `#${g}${g}${g}` }
    return null
  }
  if (kind === 'cmyk') {
    if (typeof a[0] === 'string' && /^#[0-9a-fA-F]{6}$/.test(a[0])) return a[0].toLowerCase()
    if (a.length >= 4 && a.every((v) => typeof v === 'number')) {
      const [c, m, y, k] = a as number[]
      return `#${hex2(255 * (1 - c) * (1 - k))}${hex2(255 * (1 - m) * (1 - k))}${hex2(255 * (1 - y) * (1 - k))}`
    }
    return null
  }
  return null
}

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

export function hexDistance(a: string, b: string): number {
  const p = hexToRgb(a); const q = hexToRgb(b)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

// --- Duong -> cac duong con da lam phang (pixel anh) ---
interface SubPath { pts: Array<[number, number]>; closed: boolean }

function bezier(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], n: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 1; i <= n; i++) {
    const t = i / n; const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ])
  }
  return out
}

function parsePath(buf: ArrayLike<number>, m: Matrix): SubPath[] {
  const subs: SubPath[] = []
  let cur: SubPath | null = null
  let start: [number, number] = [0, 0]
  const last = (): [number, number] => (cur && cur.pts.length > 0 ? cur.pts[cur.pts.length - 1] : start)
  const ensure = (): SubPath => {
    if (!cur) { cur = { pts: [start], closed: false }; subs.push(cur) }
    return cur
  }
  for (let k = 0; k < buf.length;) {
    const op = buf[k++]
    if (op === DRAW_OPS.moveTo) {
      const p = apply(m, buf[k], buf[k + 1]); k += 2
      start = p; cur = { pts: [p], closed: false }; subs.push(cur)
    } else if (op === DRAW_OPS.lineTo) {
      const p = apply(m, buf[k], buf[k + 1]); k += 2
      ensure().pts.push(p)
    } else if (op === DRAW_OPS.curveTo) {
      const p0 = last()
      const p1 = apply(m, buf[k], buf[k + 1]); const p2 = apply(m, buf[k + 2], buf[k + 3]); const p3 = apply(m, buf[k + 4], buf[k + 5]); k += 6
      ensure().pts.push(...bezier(p0, p1, p2, p3, 8))
    } else if (op === DRAW_OPS.quadraticCurveTo) {
      const p0 = last()
      const q = apply(m, buf[k], buf[k + 1]); const p3 = apply(m, buf[k + 2], buf[k + 3]); k += 4
      const p1: [number, number] = [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])]
      const p2: [number, number] = [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])]
      ensure().pts.push(...bezier(p0, p1, p2, p3, 8))
    } else if (op === DRAW_OPS.closePath) {
      if (cur) { (cur as SubPath).closed = true; start = (cur as SubPath).pts[0]; cur = null }
    } else break // lenh la: dung de khong lech con tro
  }
  return subs
}

function bboxOf(pts: Array<[number, number]>): Rect {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return { x0, y0, x1, y1 }
}

/** Neu duong con la hinh chu nhat truc-song-song (4 dinh, co/khong lap dinh dau) -> hop bao, nguoc lai null. */
export function asAxisRect(pts: Array<[number, number]>, tol = 0.75): Rect | null {
  let p = pts
  if (p.length === 5 && Math.hypot(p[0][0] - p[4][0], p[0][1] - p[4][1]) <= tol) p = p.slice(0, 4)
  if (p.length !== 4) return null
  const dirs: string[] = []
  for (let i = 0; i < 4; i++) {
    const a = p[i]; const b = p[(i + 1) % 4]
    const flatY = Math.abs(a[1] - b[1]) <= tol; const flatX = Math.abs(a[0] - b[0]) <= tol
    if (flatY === flatX) return null // cheo hoac suy bien
    dirs.push(flatY ? 'h' : 'v')
  }
  // Canh lien tiep phai doi huong (ngang-doc-ngang-doc).
  for (let i = 0; i < 4; i++) if (dirs[i] === dirs[(i + 1) % 4]) return null
  return bboxOf(p)
}

function polyLength(pts: Array<[number, number]>): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

/** Phan tich da giac dac: tru mong (duong) / nho gon (dau mui ten) / khac. */
function analyzeSolid(pts: Array<[number, number]>, o: VectorOptions):
  | { kind: 'line'; a: [number, number]; b: [number, number]; thickness: number }
  | { kind: 'blob'; pts: Array<[number, number]>; size: number }
  | null {
  if (pts.length < 3) return null
  const n = pts.length
  let cx = 0; let cy = 0
  for (const [x, y] of pts) { cx += x; cy += y }
  cx /= n; cy /= n
  let sxx = 0; let syy = 0; let sxy = 0
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy) }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(ang); const uy = Math.sin(ang)
  let umin = Infinity; let umax = -Infinity; let vmin = Infinity; let vmax = -Infinity
  for (const [x, y] of pts) {
    const u = (x - cx) * ux + (y - cy) * uy; const v = -(x - cx) * uy + (y - cy) * ux
    if (u < umin) umin = u; if (u > umax) umax = u; if (v < vmin) vmin = v; if (v > vmax) vmax = v
  }
  const L = umax - umin; const T = vmax - vmin
  const vm = (vmin + vmax) / 2
  if (L >= o.minLinePx * 2 && T <= Math.max(o.thinPolygonMinPx, o.thinPolygonRatio * L)) {
    const at = (u: number): [number, number] => [cx + u * ux - vm * uy, cy + u * uy + vm * ux]
    return { kind: 'line', a: at(umin), b: at(umax), thickness: T }
  }
  if (Math.max(L, T) <= o.arrowHeadMaxPx) return { kind: 'blob', pts, size: Math.max(L, T) }
  return null
}

/** Khoang cach tu diem toi da giac (0 neu nam trong): dung cho "dau mui ten cham dau net". */
function distPointToPolygon(p: [number, number], poly: Array<[number, number]>): number {
  let inside = false
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
    const dx = xj - xi; const dy = yj - yi
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - xi) * dx + (p[1] - yi) * dy) / len2))
    best = Math.min(best, Math.hypot(p[0] - (xi + t * dx), p[1] - (yi + t * dy)))
  }
  return inside ? 0 : best
}

/** Noi cac duong co dau mut trung nhau (<= tol pixel) va cung mau -> 1 duong gap khuc. */
function chainLines(lines: VectorLine[], tol: number): VectorLine[] {
  const pool = lines.slice()
  const out: VectorLine[] = []
  while (pool.length > 0) {
    let cur = pool.pop() as VectorLine
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const o = pool[i]
        if (hexDistance(cur.color, o.color) > 40) continue
        const a0 = cur.points[0]; const a1 = cur.points[cur.points.length - 1]
        const b0 = o.points[0]; const b1 = o.points[o.points.length - 1]
        const d = (p: [number, number], q: [number, number]): number => Math.hypot(p[0] - q[0], p[1] - q[1])
        let pts: Array<[number, number]> | null = null
        if (d(a1, b0) <= tol) pts = [...cur.points, ...o.points.slice(1)]
        else if (d(a1, b1) <= tol) pts = [...cur.points, ...o.points.slice(0, -1).reverse()]
        else if (d(a0, b1) <= tol) pts = [...o.points, ...cur.points.slice(1)]
        else if (d(a0, b0) <= tol) pts = [...o.points.slice().reverse(), ...cur.points.slice(1)]
        if (!pts) continue
        cur = { points: pts, color: cur.color, width: Math.max(cur.width, o.width), hasArrowHead: cur.hasArrowHead || o.hasArrowHead, length: polyLength(pts), source: cur.source }
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    out.push(cur)
  }
  return out
}

/** Phan tich danh sach lenh ve -> doi tuong vector (thuan, test duoc khong can pdfjs). */
export function buildVectorShapes(
  list: OperatorListLike, ops: OpsTable, viewTransform: number[], pageWidth: number, pageHeight: number,
  opts: Partial<VectorOptions> = {}
): VectorShapes {
  const o: VectorOptions = { ...DEFAULT_VECTOR_OPTIONS, ...opts }
  const OP = ops
  const initial = (viewTransform.length === 6 ? viewTransform : [1, 0, 0, 1, 0, 0]) as Matrix
  let st: GState = { ctm: initial, fill: '#000000', stroke: '#000000', fillAlpha: 1, strokeAlpha: 1, lineWidth: 1 }
  const stack: GState[] = []
  const rects: VectorRect[] = []
  const rawLines: VectorLine[] = []
  const heads: Array<{ pts: Array<[number, number]>; color: string; size: number }> = []
  const images: Rect[] = []
  const stats = { constructPaths: 0, images: 0, rawRects: 0, thinPolygons: 0, arrowHeads: 0 }
  const same = (a: Rect, b: Rect, tol: number): boolean =>
    Math.abs(a.x0 - b.x0) <= tol && Math.abs(a.y0 - b.y0) <= tol && Math.abs(a.x1 - b.x1) <= tol && Math.abs(a.y1 - b.y1) <= tol

  const pushRect = (box: Rect, fill: string | undefined, stroke: string | undefined, lw: number): void => {
    stats.rawRects++
    const hit = rects.find((r) => same(r.box, box, 1.6))
    if (hit) {
      if (fill && !hit.fill) hit.fill = fill
      if (stroke && !hit.stroke) { hit.stroke = stroke; hit.lineWidth = Math.max(hit.lineWidth, lw) }
      return
    }
    rects.push({ box, fill, stroke, lineWidth: stroke ? lw : 0 })
  }

  const paintImage = (m: Matrix): void => {
    const pts = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 1, 1), apply(m, 0, 1)]
    images.push(bboxOf(pts))
    stats.images++
  }

  const handlePath = (paintOp: number, buf: ArrayLike<number>): void => {
    const doFill = paintOp === OP.fill || paintOp === OP.eoFill || paintOp === OP.fillStroke || paintOp === OP.eoFillStroke ||
      paintOp === OP.closeFillStroke || paintOp === OP.closeEOFillStroke || paintOp === OP.rawFillPath
    const doStroke = paintOp === OP.stroke || paintOp === OP.closeStroke || paintOp === OP.fillStroke || paintOp === OP.eoFillStroke ||
      paintOp === OP.closeFillStroke || paintOp === OP.closeEOFillStroke
    if (!doFill && !doStroke) return
    stats.constructPaths++
    const lwPx = st.lineWidth * scaleOf(st.ctm)
    const fillColor = doFill && st.fill && st.fillAlpha >= o.minAlpha ? st.fill : undefined
    const strokeColor = doStroke && st.stroke && st.strokeAlpha >= o.minAlpha && lwPx >= 0.3 ? st.stroke : undefined
    if (!fillColor && !strokeColor) return
    const closedFlag = paintOp === OP.closeStroke || paintOp === OP.closeFillStroke || paintOp === OP.closeEOFillStroke
    for (const sub of parsePath(buf, st.ctm)) {
      if (closedFlag) sub.closed = true
      const pts = sub.pts
      if (pts.length < 2) continue
      const rect = sub.closed || pts.length >= 4 ? asAxisRect(pts) : null
      if (rect) {
        const w = rect.x1 - rect.x0; const h = rect.y1 - rect.y0
        if (Math.min(w, h) < o.thinSidePx) {
          // Hinh chu nhat qua mong = net ke ngang/doc, khong phai hop.
          const color = fillColor ?? strokeColor
          if (color && Math.max(w, h) >= o.minLinePx) {
            const horizontal = w >= h
            const mid = horizontal ? (rect.y0 + rect.y1) / 2 : (rect.x0 + rect.x1) / 2
            const a: [number, number] = horizontal ? [rect.x0, mid] : [mid, rect.y0]
            const b: [number, number] = horizontal ? [rect.x1, mid] : [mid, rect.y1]
            rawLines.push({ points: [a, b], color, width: Math.max(1, Math.min(w, h)), hasArrowHead: false, length: Math.max(w, h), source: fillColor ? 'fill' : 'stroke' })
          }
          continue
        }
        pushRect(rect, fillColor, strokeColor, lwPx)
        continue
      }
      if (strokeColor) {
        const pp = sub.closed ? [...pts, pts[0]] : pts
        const len = polyLength(pp)
        if (len >= o.minLinePx) rawLines.push({ points: pp, color: strokeColor, width: lwPx, hasArrowHead: false, length: len, source: 'stroke' })
      }
      if (fillColor && pts.length >= 3) {
        const solid = analyzeSolid(pts, o)
        if (solid?.kind === 'line') {
          stats.thinPolygons++
          rawLines.push({ points: [solid.a, solid.b], color: fillColor, width: Math.max(1, solid.thickness), hasArrowHead: false, length: Math.hypot(solid.b[0] - solid.a[0], solid.b[1] - solid.a[1]), source: 'fill' })
        } else if (solid?.kind === 'blob') {
          heads.push({ pts: solid.pts, color: fillColor, size: solid.size })
        }
      }
    }
  }

  const n = list.fnArray.length
  for (let i = 0; i < n; i++) {
    const fn = list.fnArray[i]
    const args = list.argsArray[i] as unknown
    if (fn === OP.save) stack.push({ ...st, ctm: [...st.ctm] as Matrix })
    else if (fn === OP.restore) { const s = stack.pop(); if (s) st = s }
    else if (fn === OP.transform) { const m = args as number[]; if (Array.isArray(m) && m.length >= 6) st.ctm = mul(st.ctm, m.slice(0, 6) as Matrix) }
    else if (fn === OP.paintFormXObjectBegin) {
      stack.push({ ...st, ctm: [...st.ctm] as Matrix })
      const m = (args as unknown[] | null)?.[0]
      if (m && (ArrayBuffer.isView(m) || Array.isArray(m))) st.ctm = mul(st.ctm, Array.from(m as ArrayLike<number>).slice(0, 6) as Matrix)
    } else if (fn === OP.paintFormXObjectEnd) { const s = stack.pop(); if (s) st = s }
    else if (fn === OP.setLineWidth) { const w = (args as number[])?.[0]; if (typeof w === 'number') st.lineWidth = w }
    else if (fn === OP.setFillRGBColor) st.fill = colorFromArgs('rgb', args)
    else if (fn === OP.setStrokeRGBColor) st.stroke = colorFromArgs('rgb', args)
    else if (fn === OP.setFillGray) st.fill = colorFromArgs('gray', args)
    else if (fn === OP.setStrokeGray) st.stroke = colorFromArgs('gray', args)
    else if (fn === OP.setFillCMYKColor) st.fill = colorFromArgs('cmyk', args)
    else if (fn === OP.setStrokeCMYKColor) st.stroke = colorFromArgs('cmyk', args)
    else if (fn === OP.setFillColorN || fn === OP.setFillColor || fn === OP.setFillColorSpace) st.fill = fn === OP.setFillColorSpace ? st.fill : colorFromArgs('rgb', args)
    else if (fn === OP.setStrokeColorN || fn === OP.setStrokeColor || fn === OP.setStrokeColorSpace) st.stroke = fn === OP.setStrokeColorSpace ? st.stroke : colorFromArgs('rgb', args)
    else if (fn === OP.setFillTransparent) st.fill = null
    else if (fn === OP.setStrokeTransparent) st.stroke = null
    else if (fn === OP.setGState) {
      for (const pair of (args as unknown[][]) ?? []) {
        if (!Array.isArray(pair)) continue
        const [key, val] = pair
        if (key === 'ca' && typeof val === 'number') st.fillAlpha = val
        else if (key === 'CA' && typeof val === 'number') st.strokeAlpha = val
        else if (key === 'LW' && typeof val === 'number') st.lineWidth = val
      }
    } else if (fn === OP.constructPath) {
      const a = args as [number, ArrayLike<number>[], unknown]
      const buf = a?.[1]?.[0]
      if (buf) handlePath(a[0], buf)
    } else if (
      fn === OP.paintImageXObject || fn === OP.paintInlineImageXObject || fn === OP.paintImageXObjectRepeat ||
      fn === OP.paintImageMaskXObject || fn === OP.paintInlineImageXObjectGroup || fn === OP.paintImageMaskXObjectGroup
    ) paintImage(st.ctm)
  }

  const pageArea = Math.max(1, pageWidth * pageHeight)
  const keptRects = rects.filter((r) => {
    const w = r.box.x1 - r.box.x0; const h = r.box.y1 - r.box.y0
    if (Math.min(w, h) < o.minBoxSidePx) return false
    if (w * h >= pageArea * o.maxPageAreaRatio) return false
    // Hop trung khit voi anh (nen anh/khung anh): khong phai hop chu.
    if (images.some((im) => same(im, r.box, 3))) return false
    return true
  })

  // Noi net, gan dau mui ten.
  const chained = chainLines(rawLines, 2.5)
  const lines = chained.filter((l) => l.length >= o.minLinePx)
  for (const l of lines) {
    const ends: Array<0 | 1> = [0, 1]
    for (const e of ends) {
      const p = e === 0 ? l.points[0] : l.points[l.points.length - 1]
      const far = e === 0 ? l.points[l.points.length - 1] : l.points[0]
      let best: { pts: Array<[number, number]>; size: number } | null = null
      let bestD = Infinity
      for (const h of heads) {
        const d = distPointToPolygon(p, h.pts)
        if (d <= o.arrowHeadAttachPx && d < bestD && h.size <= Math.max(o.arrowHeadMaxPx, l.length * 0.5)) { best = h; bestD = d }
      }
      if (!best) continue
      l.hasArrowHead = true
      // Mui ten that = dinh cua dau mui ten xa dau kia nhat; chi keo dai neu xa hon dau net.
      let tip = p; let tipD = Math.hypot(p[0] - far[0], p[1] - far[1])
      for (const q of best.pts) {
        const d = Math.hypot(q[0] - far[0], q[1] - far[1])
        if (d > tipD) { tipD = d; tip = q }
      }
      if (tip !== p) { if (e === 0) l.points = [tip, ...l.points]; else l.points = [...l.points, tip]; l.length = polyLength(l.points) }
      stats.arrowHeads++
    }
  }
  return { width: pageWidth, height: pageHeight, rects: keptRects, lines, images, stats }
}

/** Dung chung doc/trang da mo (pdfjs): lay doi tuong vector o he toa do anh render `scale`. */
export async function extractVectorShapesFromPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any, ops: OpsTable, scale: number, opts?: Partial<VectorOptions>
): Promise<VectorShapes> {
  const viewport = page.getViewport({ scale })
  const list = await page.getOperatorList()
  return buildVectorShapes(list, ops, viewport.transform, Math.ceil(viewport.width), Math.ceil(viewport.height), opts)
}

/** Mo PDF, lay doi tuong vector cua 1 trang (so trang tu 1). Tra null neu khong doc duoc. */
export async function extractVectorShapes(
  pdfPath: string, pageNumber: number, scale: number = RENDER_SCALE, opts?: Partial<VectorOptions>
): Promise<VectorShapes | null> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(pdfPath))
  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
  const standardFontDataUrl = pathToFileURL(join(dirname(pdfjsPkgPath), 'standard_fonts') + '/').href
  const loadingTask = pdfjsLib.getDocument({ data, standardFontDataUrl })
  try {
    const doc = await loadingTask.promise
    const page = await doc.getPage(pageNumber)
    try {
      return await extractVectorShapesFromPage(page, pdfjsLib.OPS as unknown as OpsTable, scale, opts)
    } finally {
      page.cleanup()
    }
  } catch {
    return null
  } finally {
    await loadingTask.destroy()
  }
}
