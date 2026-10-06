import type { Rect } from '../../../shared/types/anatomyQuiz'

// Nhan dang "duong dan" (leader line): net manh mau noi tu hop/chu nhan ra cau truc.
// Ham thuan, chi dung pixel RGBA - khong phu thuoc Electron/OCR nen test duoc bang anh tong hop.
//
// Y tuong:
//  1. Tim "panel" cua nhan: hop trang (co/khong vien den) bao quanh o chu do OCR tra ve.
//  2. Dung mat na "pixel net manh": pixel co mau net (bao hoa cao hoac sang trung tinh) VA khac
//     ca hai phia (cach d pixel theo phap tuyen) -> chi net mang moi qua, khong qua mang/cung.
//  3. Hat giong = pixel mat na nam trong vanh ngay ngoai panel; lan theo lien thong (cho phep
//     dut 1-2 pixel) khong di vao panel; do do dai/do manh/do thang cua thanh phan.

export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export interface LeaderOptions {
  /** O chu cua cac nhan KHAC: hop trang khong duoc no lan vao (tranh gop hai hop ke sat nhau). */
  avoidBoxes?: Rect[]
  /** Do dai toi thieu (tu rim panel toi dau xa nhat) tinh theo chieu cao chu. */
  minLengthFactor: number
  /** Do dai toi thieu tuyet doi (pixel) de tranh nhan nho qua. */
  minLengthPx: number
  /** Khoang cach vanh hat giong ngoai panel: max(minPx, factor * chieu cao chu). */
  seedGapFactor: number
  seedGapMinPx: number
  /** Panel duoc phep no ra toi da factor * chieu cao chu moi phia. */
  panelMaxGrowFactor: number
  /** Dung sai mau (khoang cach RGB) khi do mau nen dong deu cua hop. */
  panelColorTolerance: number
  /** Do tuong phan toi thieu giua mep hop va ben ngoai (RGB) de coi la hop that. */
  panelEdgeContrast: number
  /** Ti le pixel trong o chu thuoc 1 mau nen toi thieu de coi la hop co nen dong mau. */
  panelMinFillShare: number
  /** Do day vien den toi da tinh ca vao panel (pixel). */
  borderMaxPx: number
  /** Khoang lay mau hai ben net de do do tuong phan (pixel). */
  ridgeOffsets: number[]
  /** Nguong khoang cach mau RGB giua net va hai ben. */
  ridgeThreshold: number
  /** Hai ben net phai giong nhau: khoang cach^2 hai ben <= he so * khoang cach^2 (net-ben) nho nhat. */
  ridgeSymmetry: number
  /** Mau net: bao hoa/do sang toi thieu. */
  vividSaturation: number
  vividValue: number
  neutralMaxSaturation: number
  neutralMinValue: number
  /** Net den: do sang toi da (V) cua net toi (chu den + duong den tren nen sang). */
  darkMaxValue: number
  /** Do day trung binh toi da (pixel/net) - lon hon la mang/vet, khong phai net manh. */
  maxThickness: number
  /** Ti le buoc bam duoc tren net (khong bi dut) toi thieu. */
  minSupport: number
  /** Ti le diem tren duong di co mau dong nhat toi thieu. */
  minColorConsistency: number
  /** Do dai bam toi da (pixel). */
  maxTrackPx: number
  /** Diem toi thieu de coi la co duong dan. */
  scoreThreshold: number
}

export const DEFAULT_LEADER_OPTIONS: LeaderOptions = {
  minLengthFactor: 1.5,
  minLengthPx: 18,
  seedGapFactor: 0.45,
  seedGapMinPx: 6,
  panelMaxGrowFactor: 2.4,
  panelColorTolerance: 45,
  panelEdgeContrast: 55,
  panelMinFillShare: 0.4,
  borderMaxPx: 7,
  ridgeOffsets: [3, 5],
  ridgeThreshold: 60,
  ridgeSymmetry: 0.5,
  vividSaturation: 0.35,
  vividValue: 0.45,
  neutralMaxSaturation: 0.25,
  neutralMinValue: 0.62,
  darkMaxValue: 0.3,
  maxThickness: 8,
  minSupport: 0.8,
  minColorConsistency: 0.7,
  maxTrackPx: 700,
  scoreThreshold: 0.5
}

export type LeaderKind = 'straight' | 'curved'

export interface LeaderBranch {
  /** Diem noi duong dan voi panel (tam hat giong). */
  attach: { x: number; y: number }
  /** Diem xa nhat cua duong dan (dau mui ten/tip). */
  endpoint: { x: number; y: number }
  /** Do xa toi da tu rim panel (pixel). */
  extent: number
  kind: LeaderKind
  thickness: number
  score: number
  pixelCount: number
  /** Ti le buoc bam duoc va ti le diem dong mau (de go loi). */
  supportFrac: number
  colorConsistency: number
  /** Cac diem duong di tu attach toi endpoint. */
  path: Array<{ x: number; y: number }>
}

export interface LabelPanel {
  /** Hinh chu nhat gom ca vien den (neu co). */
  rect: Rect
  /** Phan trang ben trong (khong gom vien). */
  inner: Rect
  /** Co hop trang bao quanh chu (>=3 phia no ra duoc). */
  boxed: boolean
  /** Co vien toi bao quanh. */
  bordered: boolean
  /** Mau nen cua hop (neu nhan dien duoc). */
  fill?: [number, number, number]
}

export interface LeaderResult {
  score: number
  hasLeader: boolean
  endpoint?: { x: number; y: number }
  attach?: { x: number; y: number }
  kind?: LeaderKind
  panel: LabelPanel
  /** Cac nhanh dat nguong. */
  branches: LeaderBranch[]
  /** Moi ung vien (ke ca khong dat) - chi de go loi. */
  candidates: LeaderBranch[]
  /** So hat giong / cum hat giong (go loi). */
  seedInfo?: { seeds: number; clusters: number; forbidden: Rect }
}

// ---------------------------------------------------------------------------
// Mat na pixel net manh (tinh 1 lan cho moi anh, luu theo data buffer).
// ---------------------------------------------------------------------------

interface LineMask {
  mask: Uint8Array
  stamp: Int32Array
  stampCounter: number
  optionsKey: string
}

const maskCache = new WeakMap<object, LineMask>()

function optionsKey(o: LeaderOptions): string {
  return [o.ridgeOffsets.join(','), o.ridgeThreshold, o.ridgeSymmetry, o.vividSaturation, o.vividValue,
    o.neutralMaxSaturation, o.neutralMinValue, o.darkMaxValue].join('|')
}

function buildLineMask(image: RgbaImage, o: LeaderOptions): LineMask {
  const { data, width, height } = image
  const mask = new Uint8Array(width * height)
  const t2 = o.ridgeThreshold * o.ridgeThreshold
  // 4 huong phap tuyen: (0,1) (1,0) (1,1) (1,-1) - nhan he so d.
  const dirs: Array<[number, number]> = [[0, 1], [1, 0], [0.7071, 0.7071], [0.7071, -0.7071]]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2]
      const max = r > g ? (r > b ? r : b) : (g > b ? g : b)
      const min = r < g ? (r < b ? r : b) : (g < b ? g : b)
      const v = max / 255
      const s = max === 0 ? 0 : (max - min) / max
      const vivid = s >= o.vividSaturation && v >= o.vividValue
      const neutral = s <= o.neutralMaxSaturation && v >= o.neutralMinValue
      const dark = v <= o.darkMaxValue
      if (!vivid && !neutral && !dark) continue
      let hit = false
      for (const d of o.ridgeOffsets) {
        for (const [dx, dy] of dirs) {
          const ox = Math.round(dx * d); const oy = Math.round(dy * d)
          const x1 = x + ox; const y1 = y + oy; const x2 = x - ox; const y2 = y - oy
          if (x1 < 0 || y1 < 0 || x1 >= width || y1 >= height || x2 < 0 || y2 < 0 || x2 >= width || y2 >= height) continue
          const j1 = (y1 * width + x1) * 4; const j2 = (y2 * width + x2) * 4
          const d1 = (r - data[j1]) ** 2 + (g - data[j1 + 1]) ** 2 + (b - data[j1 + 2]) ** 2
          if (d1 < t2) continue
          const d2 = (r - data[j2]) ** 2 + (g - data[j2 + 1]) ** 2 + (b - data[j2 + 2]) ** 2
          if (d2 < t2) continue
          // Net that: hai ben GIONG NHAU hon la giong net (khac voi mep chuyen tiep giua hai nen).
          const dSides = (data[j1] - data[j2]) ** 2 + (data[j1 + 1] - data[j2 + 1]) ** 2 + (data[j1 + 2] - data[j2 + 2]) ** 2
          if (dSides > o.ridgeSymmetry * Math.min(d1, d2)) continue
          hit = true; break
        }
        if (hit) break
      }
      if (hit) mask[y * width + x] = 1
    }
  }
  return { mask, stamp: new Int32Array(width * height), stampCounter: 0, optionsKey: optionsKey(o) }
}

function getLineMask(image: RgbaImage, o: LeaderOptions): LineMask {
  const cached = maskCache.get(image.data)
  if (cached && cached.optionsKey === optionsKey(o)) return cached
  const built = buildLineMask(image, o)
  maskCache.set(image.data, built)
  return built
}

/** Xuat mat na net manh (de ve debug). 1 = pixel net. */
export function getLeaderMask(image: RgbaImage, opts?: Partial<LeaderOptions>): Uint8Array {
  return getLineMask(image, { ...DEFAULT_LEADER_OPTIONS, ...opts }).mask
}

// ---------------------------------------------------------------------------
// Panel (hop trang) cua nhan.
// ---------------------------------------------------------------------------

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

/** Pixel gan mau nen cua hop (khoang cach RGB < tol). */
function nearColor(ref: [number, number, number], tol: number): (data: ArrayLike<number>, i: number) => boolean {
  const t2 = tol * tol
  return (data, i) => (data[i] - ref[0]) ** 2 + (data[i + 1] - ref[1]) ** 2 + (data[i + 2] - ref[2]) ** 2 <= t2
}

/** Mau nen cua hop = trung vi RGB cac pixel BEN TRONG o chu; null neu noi dung khong dong deu (>= minShare gan mau do). */
export function interiorFill(image: RgbaImage, box: Rect, tol: number, minShare: number): [number, number, number] | null {
  const { width, height, data } = image
  const x0 = Math.max(0, Math.floor(box.x0)); const x1 = Math.min(width, Math.ceil(box.x1))
  const y0 = Math.max(0, Math.floor(box.y0)); const y1 = Math.min(height, Math.ceil(box.y1))
  const rs: number[] = []; const gs: number[] = []; const bs: number[] = []
  // Lay mau thua cho nhanh (toi da ~4000 diem).
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)))
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2])
    }
  }
  if (rs.length < 8) return null
  const med = (a: number[]): number => a.slice().sort((p, q) => p - q)[a.length >> 1]
  // Trung vi tung kenh co the nam giua chu va nen; thu them mode xap xi qua luoi 16 muc/kenh.
  const bins = new Map<number, number>()
  for (let i = 0; i < rs.length; i++) {
    const key = ((rs[i] >> 4) << 8) | ((gs[i] >> 4) << 4) | (bs[i] >> 4)
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  let bestKey = 0; let bestCount = 0
  for (const [key, count] of bins) if (count > bestCount) { bestCount = count; bestKey = key }
  const seed: [number, number, number] = [((bestKey >> 8) << 4) + 8, (((bestKey >> 4) & 15) << 4) + 8, ((bestKey & 15) << 4) + 8]
  const t2 = tol * tol
  const members: number[] = []
  for (let i = 0; i < rs.length; i++) {
    if ((rs[i] - seed[0]) ** 2 + (gs[i] - seed[1]) ** 2 + (bs[i] - seed[2]) ** 2 <= t2) members.push(i)
  }
  if (members.length / rs.length < minShare) return null
  const ref: [number, number, number] = [med(members.map((i) => rs[i])), med(members.map((i) => gs[i])), med(members.map((i) => bs[i]))]
  return ref
}

/** Do tuong phan trung binh giua mau nen hop `ref` va dai cach `gap` px ben ngoai mep. */
export function edgeContrast(
  image: RgbaImage, side: 'l' | 'r' | 't' | 'b', x0: number, y0: number, x1: number, y1: number, gap: number,
  ref: [number, number, number]
): number {
  const { width, height, data } = image
  let sum = 0; let n = 0
  const sample = (xo: number, yo: number): void => {
    if (xo < 0 || yo < 0 || xo >= width || yo >= height) return
    const b = (yo * width + xo) * 4
    sum += Math.hypot(ref[0] - data[b], ref[1] - data[b + 1], ref[2] - data[b + 2]); n++
  }
  if (side === 't' || side === 'b') {
    const yo = side === 't' ? y0 - gap : y1 + gap
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) sample(x, yo)
  } else {
    const xo = side === 'l' ? x0 - gap : x1 + gap
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) sample(xo, y)
  }
  return n === 0 ? 0 : sum / n
}

function isDark(data: ArrayLike<number>, i: number): boolean {
  return Math.max(data[i], data[i + 1], data[i + 2]) < 100
}

/** Phan so pixel thoa `pred` doc theo 1 doan ngang/doc. */
function stripFraction(
  image: RgbaImage, fixed: number, from: number, to: number, horizontal: boolean,
  pred: (data: ArrayLike<number>, i: number) => boolean
): number {
  const { width, height, data } = image
  if (horizontal) {
    if (fixed < 0 || fixed >= height) return 0
  } else if (fixed < 0 || fixed >= width) return 0
  const a = Math.max(0, from); const b = Math.min(horizontal ? width - 1 : height - 1, to)
  if (b < a) return 0
  let count = 0
  for (let k = a; k <= b; k++) {
    const idx = horizontal ? (fixed * width + k) * 4 : (k * width + fixed) * 4
    if (pred(data, idx)) count++
  }
  return count / (b - a + 1)
}

/**
 * Tim hop (panel) cua nhan: vung nen dong mau (trang, xam, cam...) chua o chu, co the co vien den.
 * Hop duoc nhan ra khi noi dung o chu chu yeu la 1 mau nen VA mep hop tuong phan ro voi ben ngoai.
 * Chu tren anh khong co hop -> boxed=false, rect = chinh o chu.
 */
export function findLabelPanel(image: RgbaImage, box: Rect, opts?: Partial<LeaderOptions>): LabelPanel {
  const o = { ...DEFAULT_LEADER_OPTIONS, ...opts }
  const { width, height } = image
  const h = Math.max(1, box.y1 - box.y0)
  const maxGrow = Math.max(4, Math.round(h * o.panelMaxGrowFactor))
  // Chu thuong can trai/trai trong hop rong: cho no ngang xa hon theo chieu cao chu.
  const maxGrowX = Math.max(maxGrow, Math.round(h * o.panelMaxGrowFactor * 3))
  const unboxed: LabelPanel = { rect: { ...box }, inner: { ...box }, boxed: false, bordered: false }
  const ref = interiorFill(image, box, o.panelColorTolerance, o.panelMinFillShare)
  if (!ref) return unboxed
  // Hop that co nen sang hoac mau (khong phai vung toi cua anh).
  const fillMax = Math.max(ref[0], ref[1], ref[2]); const fillMin = Math.min(ref[0], ref[1], ref[2])
  const fillSat = fillMax === 0 ? 0 : (fillMax - fillMin) / fillMax
  if (fillMax / 255 < 0.6 && !(fillSat >= 0.35 && fillMax / 255 >= 0.45)) return unboxed
  const near = nearColor(ref, o.panelColorTolerance)

  let x0 = clampInt(box.x0, 0, width - 1); let x1 = clampInt(box.x1 - 1, 0, width - 1)
  let y0 = clampInt(box.y0, 0, height - 1); let y1 = clampInt(box.y1 - 1, 0, height - 1)
  const grown = { l: 0, r: 0, t: 0, b: 0 }
  const need = 0.85
  // Vat can = o chu nhan khac (bo qua o gan nhu trung voi o chu nay: do hai lan cung 1 chu).
  const ownArea = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0))
  const obstacles = (o.avoidBoxes ?? []).filter((r) => {
    const ix = Math.max(0, Math.min(r.x1, box.x1) - Math.max(r.x0, box.x0))
    const iy = Math.max(0, Math.min(r.y1, box.y1) - Math.max(r.y0, box.y0))
    const small = Math.max(1, Math.min(ownArea, (r.x1 - r.x0) * (r.y1 - r.y0)))
    return (ix * iy) / small < 0.3
  })
  const blocked = (sx0: number, sy0: number, sx1: number, sy1: number): boolean =>
    obstacles.some((r) => r.x0 < sx1 && r.x1 > sx0 && r.y0 < sy1 && r.y1 > sy0)
  // No tung pixel cho moi phia khi dai moi gan nhu toan mau nen.
  for (let iter = 0; iter < maxGrowX; iter++) {
    let any = false
    if (grown.t < maxGrow && y0 > 0 && !blocked(x0, y0 - 1, x1 + 1, y0) && stripFraction(image, y0 - 1, x0, x1, true, near) >= need) { y0--; grown.t++; any = true }
    if (grown.b < maxGrow && y1 < height - 1 && !blocked(x0, y1 + 1, x1 + 1, y1 + 2) && stripFraction(image, y1 + 1, x0, x1, true, near) >= need) { y1++; grown.b++; any = true }
    if (grown.l < maxGrowX && x0 > 0 && !blocked(x0 - 1, y0, x0, y1 + 1) && stripFraction(image, x0 - 1, y0, y1, false, near) >= need) { x0--; grown.l++; any = true }
    if (grown.r < maxGrowX && x1 < width - 1 && !blocked(x1 + 1, y0, x1 + 2, y1 + 1) && stripFraction(image, x1 + 1, y0, y1, false, near) >= need) { x1++; grown.r++; any = true }
    if (!any) break
  }
  const inner: Rect = { x0, y0, x1: x1 + 1, y1: y1 + 1 }

  // Mep ro: moi phia phai tuong phan voi dai cach 3px ben ngoai, va khong chay tran toi gioi han no.
  const gap = 4
  // Mep ro neu tuong phan voi nen ben ngoai HOAC co vien den manh sat mep.
  const darkBorderAt = (side: 'l' | 'r' | 't' | 'b'): boolean => {
    for (let k = 1; k <= o.borderMaxPx; k++) {
      const f = side === 't' ? stripFraction(image, y0 - k, x0, x1, true, isDark)
        : side === 'b' ? stripFraction(image, y1 + k, x0, x1, true, isDark)
        : side === 'l' ? stripFraction(image, x0 - k, y0, y1, false, isDark)
        : stripFraction(image, x1 + k, y0, y1, false, isDark)
      if (f >= 0.7) return true
    }
    return false
  }
  const sharp = (side: 'l' | 'r' | 't' | 'b', g: number): boolean => {
    const cap = side === 'l' || side === 'r' ? maxGrowX : maxGrow
    return g < cap && (edgeContrast(image, side, x0, y0, x1, y1, gap, ref) >= o.panelEdgeContrast || darkBorderAt(side))
  }
  const sharpSides = [sharp('l', grown.l), sharp('r', grown.r), sharp('t', grown.t), sharp('b', grown.b)].filter(Boolean).length
  const boxed = sharpSides >= 3
  if (!boxed) return unboxed

  // Vien den: sau mep hop, thu cac dai toi lien tiep (toi da borderMaxPx).
  const border = { l: 0, r: 0, t: 0, b: 0 }
  const darkNeed = 0.7
  for (let k = 1; k <= o.borderMaxPx; k++) {
    if (border.t === k - 1 && stripFraction(image, y0 - k, x0, x1, true, isDark) >= darkNeed) border.t = k
    if (border.b === k - 1 && stripFraction(image, y1 + k, x0, x1, true, isDark) >= darkNeed) border.b = k
    if (border.l === k - 1 && stripFraction(image, x0 - k, y0, y1, false, isDark) >= darkNeed) border.l = k
    if (border.r === k - 1 && stripFraction(image, x1 + k, y0, y1, false, isDark) >= darkNeed) border.r = k
  }
  const bordered = [border.l, border.r, border.t, border.b].filter((g) => g >= 1).length >= 3
  const rect: Rect = bordered
    ? { x0: x0 - border.l, y0: y0 - border.t, x1: x1 + 1 + border.r, y1: y1 + 1 + border.b }
    : inner
  return { rect, inner, boxed, bordered, fill: ref }
}

// ---------------------------------------------------------------------------
// Tim duong dan: bam theo net (line tracking) tu diem noi voi panel.
// ---------------------------------------------------------------------------

function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1)
  const dy = Math.max(r.y0 - py, 0, py - r.y1)
  return Math.hypot(dx, dy)
}

function expand(r: Rect, m: number): Rect {
  return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }
}

interface Seed { x: number; y: number }

function clusterSeeds(seeds: Seed[], radius: number): Seed[][] {
  const clusters: Seed[][] = []
  for (const s of seeds) {
    let placed = false
    for (const c of clusters) {
      if (c.some((p) => Math.abs(p.x - s.x) <= radius && Math.abs(p.y - s.y) <= radius)) { c.push(s); placed = true; break }
    }
    if (!placed) clusters.push([s])
  }
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (clusters[i].some((p) => clusters[j].some((q) => Math.abs(p.x - q.x) <= radius && Math.abs(p.y - q.y) <= radius))) {
          clusters[i] = clusters[i].concat(clusters[j]); clusters.splice(j, 1); merged = true; break outer
        }
      }
    }
  }
  return clusters
}

interface TrackContext {
  /** Nguong sang toi da (0..255) cua pixel "den". */
  darkMax: number
  /** Luoi 4px: o co nhan khac (chu cua nhan ke ben) - net o day khong tinh. */
  blockedGrid: Uint8Array
  gridWidth: number
  data: ArrayLike<number>
  lm: LineMask
  width: number
  height: number
  forbidden: Rect
}

/** Pixel nam trong vung cam cua nhan nay hoac trong o chu cua nhan khac? */
function isBlocked(ctx: TrackContext, x: number, y: number): boolean {
  const f = ctx.forbidden
  if (x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1) return true
  return ctx.blockedGrid[(y >> 2) * ctx.gridWidth + (x >> 2)] !== 0
}

/** Co pixel net trong o 3x3 quanh (x,y) (ngoai vung cam)? */
function hit(ctx: TrackContext, x: number, y: number): boolean {
  const xi = Math.round(x); const yi = Math.round(y)
  const { width, height, lm } = ctx
  for (let dy = -1; dy <= 1; dy++) {
    const py = yi + dy
    if (py < 0 || py >= height) continue
    for (let dx = -1; dx <= 1; dx++) {
      const px = xi + dx
      if (px < 0 || px >= width) continue
      if (lm.mask[py * width + px] !== 0 && !isBlocked(ctx, px, py)) return true
    }
  }
  return false
}

interface Track {
  path: Array<{ x: number; y: number }>
  supportedSteps: number
  totalSteps: number
}

const STEP = 3
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((k) => (k * 3.5 * Math.PI) / 180)

/** Bam net tu `start` theo huong `theta`, cho phep cong nhe va dut vai pixel. */
function followLine(ctx: TrackContext, start: Seed, theta0: number, maxSteps: number): Track {
  let px = start.x; let py = start.y; let theta = theta0
  const path = [{ x: px, y: py }]
  let supportedSteps = 0; let gaps = 0; let trailingGaps = 0
  const gapMax = 4
  let steps = 0
  for (; steps < maxSteps; steps++) {
    let bestTurn = 0; let bestVal = -Infinity; let bestSupport = 0
    for (const turn of TURNS) {
      const ang = theta + turn
      const cx = Math.cos(ang); const cy = Math.sin(ang)
      let support = 0
      for (let k = 1; k <= 4; k++) if (hit(ctx, px + k * STEP * cx, py + k * STEP * cy)) support++
      const val = support - Math.abs(turn) * 2
      if (val > bestVal) { bestVal = val; bestTurn = turn; bestSupport = support }
    }
    if (bestSupport >= 2) {
      theta += bestTurn
      px += STEP * Math.cos(theta); py += STEP * Math.sin(theta)
      // Can tam lai vao net (tru vung cam) de khong troi khi net day.
      let sx = 0; let sy = 0; let n = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(px) + dx; const y = Math.round(py) + dy
          if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) continue
          if (ctx.lm.mask[y * ctx.width + x] !== 0 && !isBlocked(ctx, x, y)) { sx += x; sy += y; n++ }
        }
      }
      if (n > 0) { px += (sx / n - px) * 0.4; py += (sy / n - py) * 0.4 }
      supportedSteps++; gaps = 0; trailingGaps = 0
    } else {
      gaps++; trailingGaps++
      if (gaps > gapMax) break
      px += STEP * Math.cos(theta); py += STEP * Math.sin(theta)
    }
    if (px < 0 || py < 0 || px >= ctx.width || py >= ctx.height) break
    path.push({ x: px, y: py })
  }
  const keep = Math.max(1, path.length - trailingGaps)
  return { path: path.slice(0, keep), supportedSteps, totalSteps: Math.max(1, keep - 1) }
}

/** Huong ban dau: tia ngan co nhieu pixel net nhat, huong ra xa panel. */
function initialDirections(ctx: TrackContext, start: Seed, panelRect: Rect, h: number): Array<{ ang: number; score: number }> {
  const len = Math.min(28, Math.max(14, Math.round(h * 0.6)))
  const d0 = distToRect(start.x, start.y, panelRect)
  const scored: Array<{ ang: number; score: number }> = []
  for (let a = 0; a < 120; a++) {
    const ang = (a * 2 * Math.PI) / 120
    const cx = Math.cos(ang); const cy = Math.sin(ang)
    if (distToRect(start.x + len * cx, start.y + len * cy, panelRect) < d0 + len * 0.5) continue
    let hits = 0
    for (let k = 2; k <= len; k++) if (hit(ctx, start.x + k * cx, start.y + k * cy)) hits++
    scored.push({ ang, score: hits / (len - 1) })
  }
  scored.sort((p, q) => q.score - p.score)
  const chosen: Array<{ ang: number; score: number }> = []
  for (const c of scored) {
    if (c.score < 0.45 || chosen.length >= 3) break
    if (chosen.every((d) => Math.abs(Math.atan2(Math.sin(d.ang - c.ang), Math.cos(d.ang - c.ang))) > (30 * Math.PI) / 180)) chosen.push(c)
  }
  return chosen
}

/** Do day trung vi cua net doc theo duong di (pixel). */
function medianThickness(ctx: TrackContext, path: Array<{ x: number; y: number }>): number {
  const widths: number[] = []
  for (let i = 2; i < path.length - 2; i += 2) {
    const next = path[Math.min(i + 2, path.length - 1)]
    const dx = next.x - path[i - 2].x
    const dy = next.y - path[i - 2].y
    const n = Math.hypot(dx, dy)
    if (n < 1e-6) continue
    const nx = -dy / n; const ny = dx / n
    // Dem pixel net lien tiep quanh tam theo phap tuyen (cho phep dut 1 pixel).
    let w = 0
    for (const sign of [1, -1]) {
      let miss = 0
      for (let k = sign === 1 ? 0 : 1; k <= 9; k++) {
        const x = path[i].x + sign * k * nx; const y = path[i].y + sign * k * ny
        if (hit(ctx, x, y)) { w++; miss = 0 } else if (++miss > 1) break
      }
    }
    widths.push(w)
  }
  if (widths.length === 0) return 0
  widths.sort((a, b) => a - b)
  return widths[widths.length >> 1]
}

/** Mau trung vi doc duong di va ti le diem co mau gan mau do (net that dong mau). */
function pathColor(ctx: TrackContext, path: Array<{ x: number; y: number }>): { color: [number, number, number]; consistency: number } {
  const samples: Array<[number, number, number]> = []
  for (let i = 0; i < path.length; i++) {
    const cx = Math.round(path[i].x); const cy = Math.round(path[i].y)
    let best = -1; let bestD = Infinity
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx; const y = cy + dy
        if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) continue
        if (isBlocked(ctx, x, y) || ctx.lm.mask[y * ctx.width + x] === 0) continue
        const d = Math.abs(dx) + Math.abs(dy)
        if (d < bestD) { bestD = d; best = (y * ctx.width + x) * 4 }
      }
    }
    if (best >= 0) samples.push([ctx.data[best], ctx.data[best + 1], ctx.data[best + 2]])
  }
  if (samples.length === 0) return { color: [0, 0, 0], consistency: 0 }
  // Net den (chu den, duong den): quanh duong di co thi quang sang nen chon theo da so lop "toi" trong o 3x3.
  let darkPoints = 0; let probed = 0
  for (const pt of path) {
    const cx = Math.round(pt.x); const cy = Math.round(pt.y)
    let dark = 0; let other = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx; const y = cy + dy
        if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) continue
        if (isBlocked(ctx, x, y) || ctx.lm.mask[y * ctx.width + x] === 0) continue
        const i = (y * ctx.width + x) * 4
        if (Math.max(ctx.data[i], ctx.data[i + 1], ctx.data[i + 2]) <= ctx.darkMax) dark++; else other++
      }
    }
    if (dark + other === 0) continue
    probed++
    if (dark > other) darkPoints++
  }
  if (probed > 0 && darkPoints / probed >= 0.7) return { color: [20, 20, 20], consistency: darkPoints / probed }
  const med = (k: 0 | 1 | 2): number => samples.map((c) => c[k]).sort((a, b) => a - b)[samples.length >> 1]
  const color: [number, number, number] = [med(0), med(1), med(2)]
  // So sanh theo SAC DO (ti le kenh) de net mau nhat/dam hon tren cac nen khac nhau van dong nhat;
  // net trung tinh (trang/xam) so theo do sang.
  const chroma = (c: [number, number, number]): [number, number, number] => {
    const sum = Math.max(1, c[0] + c[1] + c[2])
    const mx = Math.max(c[0], c[1], c[2]); const mn = Math.min(c[0], c[1], c[2])
    return [c[0] / sum, c[1] / sum, mx === 0 ? 0 : (mx - mn) / mx]
  }
  const mc = chroma(color)
  const neutral = mc[2] < 0.22
  const mb = (color[0] + color[1] + color[2]) / 3
  const near = samples.filter((c) => {
    const cc = chroma(c)
    if (neutral) return cc[2] < 0.35 && Math.abs((c[0] + c[1] + c[2]) / 3 - mb) <= 60
    return Math.hypot(cc[0] - mc[0], cc[1] - mc[1]) <= 0.12
  }).length
  return { color, consistency: near / samples.length }
}

function buildBranch(
  ctx: TrackContext, track: Track, start: Seed, panel: LabelPanel, textHeight: number, o: LeaderOptions
): LeaderBranch {
  const panelRect = panel.rect
  const end = track.path[track.path.length - 1]
  const extent = distToRect(end.x, end.y, panelRect)
  const supportFrac = Math.min(1, track.supportedSteps / track.totalSteps)
  const thickness = medianThickness(ctx, track.path)
  // Do cong: do lech lon nhat cua duong di khoi doan thang.
  const vx = end.x - start.x; const vy = end.y - start.y
  const len = Math.max(1e-6, Math.hypot(vx, vy))
  let maxDev = 0
  for (const p of track.path) maxDev = Math.max(maxDev, Math.abs((p.x - start.x) * vy - (p.y - start.y) * vx) / len)
  const bend = maxDev / len
  const kind: LeaderKind = bend <= 0.1 ? 'straight' : 'curved'

  const minLen = Math.max(o.minLengthPx, o.minLengthFactor * textHeight)
  const lenScore = Math.min(1, extent / (minLen * 2))
  const thinScore = Math.min(1, Math.max(0, (o.maxThickness * 1.5 - thickness) / (o.maxThickness * 1.5 - 2)))
  const pc = pathColor(ctx, track.path)
  // Duong dan thuong cung mau voi hop (hop mau + net cung mau): tin hieu manh chong nhieu.
  const fill = panel.fill
  const sameAsFill = !!fill && panel.boxed && Math.hypot(pc.color[0] - fill[0], pc.color[1] - fill[1], pc.color[2] - fill[2]) <= 70
  const soft = Math.min(1, 0.4 * lenScore + 0.25 * supportFrac + 0.15 * thinScore + 0.2 * pc.consistency + (sameAsFill ? 0.15 : 0))
  const pass = extent >= minLen && supportFrac >= o.minSupport && thickness <= o.maxThickness &&
    (pc.consistency >= o.minColorConsistency || (sameAsFill && pc.consistency >= o.minColorConsistency * 0.7))
  const score = pass ? 0.5 + 0.5 * soft : 0.49 * soft
  return {
    attach: { x: start.x, y: start.y }, endpoint: { x: end.x, y: end.y }, extent, kind, thickness, score,
    pixelCount: track.supportedSteps, path: track.path, supportFrac, colorConsistency: pc.consistency
  }
}

/** Cham diem duong dan cua 1 nhan. labelBox = o chu (toa do pixel cua anh). */
export function scoreLeaderLine(image: RgbaImage, labelBox: Rect, opts?: Partial<LeaderOptions>): LeaderResult {
  const o: LeaderOptions = { ...DEFAULT_LEADER_OPTIONS, ...opts }
  const { width, height } = image
  const h = Math.max(1, labelBox.y1 - labelBox.y0)
  let panel = findLabelPanel(image, labelBox, o)
  // Hop vat ly: o chu cua nhan KE BEN nam trong cung 1 nen hop (khoang giua la nen hop) thi vien/nen hop
  // do khong duoc coi la duong dan. Hop cua nhan ke ben duoc gop vao vung cam.
  if (o.avoidBoxes && o.avoidBoxes.length > 0 && panel.boxed && panel.fill) {
    const u = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })
    const fill = panel.fill
    let zone = panel
    for (let pass = 0; pass < 2; pass++) {
      for (const r of o.avoidBoxes) {
        if (!gapIsPanelFill(image, labelBox, r, fill, o.panelColorTolerance)) continue
        const other = findLabelPanel(image, r, { ...o, avoidBoxes: undefined })
        if (!other.boxed || !other.fill) continue
        if (Math.hypot(other.fill[0] - fill[0], other.fill[1] - fill[1], other.fill[2] - fill[2]) > 30) continue
        zone = { ...zone, rect: u(zone.rect, other.rect), inner: u(zone.inner, other.inner) }
      }
    }
    panel = zone
  }
  const lm = getLineMask(image, o)

  // Vung cam (trong panel + le) va vanh hat giong.
  const margin = Math.max(3, Math.round(h * 0.15))
  const forbiddenF = expand(panel.rect, margin)
  const forbidden: Rect = {
    x0: Math.floor(forbiddenF.x0), y0: Math.floor(forbiddenF.y0), x1: Math.ceil(forbiddenF.x1), y1: Math.ceil(forbiddenF.y1)
  }
  // Net cung mau hop khong hien trong mat na o ngay sat hop (hai ben mau mau giong net) -> cong them do lech lay mau.
  const gap = Math.max(o.seedGapMinPx, Math.round(h * o.seedGapFactor)) + Math.max(...o.ridgeOffsets)
  const ring = expand(forbiddenF, gap)
  const rx0 = clampInt(ring.x0, 0, width - 1); const rx1 = clampInt(ring.x1, 0, width - 1)
  const ry0 = clampInt(ring.y0, 0, height - 1); const ry1 = clampInt(ring.y1, 0, height - 1)
  const gridWidth = (width >> 2) + 1
  const blockedGrid = new Uint8Array(gridWidth * ((height >> 2) + 1))
  for (const r of o.avoidBoxes ?? []) {
    // Bo qua o gan nhu trung voi o chu nay (cung 1 chu do hai lan).
    const ix = Math.max(0, Math.min(r.x1, labelBox.x1) - Math.max(r.x0, labelBox.x0))
    const iy = Math.max(0, Math.min(r.y1, labelBox.y1) - Math.max(r.y0, labelBox.y0))
    const small = Math.max(1, Math.min((labelBox.x1 - labelBox.x0) * (labelBox.y1 - labelBox.y0), (r.x1 - r.x0) * (r.y1 - r.y0)))
    if ((ix * iy) / small >= 0.3) continue
    const gx0 = Math.max(0, Math.floor(r.x0 - 2)) >> 2; const gx1 = Math.min(width - 1, Math.ceil(r.x1 + 2)) >> 2
    const gy0 = Math.max(0, Math.floor(r.y0 - 2)) >> 2; const gy1 = Math.min(height - 1, Math.ceil(r.y1 + 2)) >> 2
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) blockedGrid[gy * gridWidth + gx] = 1
  }
  const ctx: TrackContext = { darkMax: o.darkMaxValue * 255, blockedGrid, gridWidth, data: image.data, lm, width, height, forbidden }
  const seeds: Seed[] = []
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      if (lm.mask[y * width + x] === 0 || isBlocked(ctx, x, y)) continue
      seeds.push({ x, y })
    }
  }
  const empty: LeaderResult = { score: 0, hasLeader: false, panel, branches: [], candidates: [], seedInfo: { seeds: seeds.length, clusters: 0, forbidden } }
  if (seeds.length === 0) return empty

  const clusters = clusterSeeds(seeds, Math.max(3, Math.round(h * 0.3)))
  empty.seedInfo = { seeds: seeds.length, clusters: clusters.length, forbidden }
  const branches: LeaderBranch[] = []
  for (const cluster of clusters) {
    // Thu nhieu hat giong trong cum (da sap theo khoang cach toi panel): hat gan panel nhat co the la
    // nhieu vien hop, nen chon (hat, huong) co tia ngan trung nhieu pixel net nhat.
    const sorted = cluster.slice().sort((a, b) => distToRect(a.x, a.y, panel.rect) - distToRect(b.x, b.y, panel.rect))
    const stride = Math.max(1, Math.floor(sorted.length / 10))
    const options: Array<{ start: Seed; ang: number; score: number }> = []
    for (let i = 0; i < sorted.length; i += stride) {
      for (const d of initialDirections(ctx, sorted[i], panel.rect, h)) options.push({ start: sorted[i], ang: d.ang, score: d.score })
    }
    options.sort((a, b) => b.score - a.score)
    let best: LeaderBranch | null = null
    for (const opt of options.slice(0, 3)) {
      const track = followLine(ctx, opt.start, opt.ang, Math.ceil(o.maxTrackPx / STEP))
      const branch = buildBranch(ctx, track, opt.start, panel, h, o)
      if (!best || branch.score > best.score) best = branch
    }
    if (best) branches.push(best)
  }
  if (branches.length === 0) return empty
  branches.sort((a, b) => b.score - a.score)
  const best = branches[0]
  return {
    score: best.score,
    hasLeader: best.score >= o.scoreThreshold,
    endpoint: best.endpoint, attach: best.attach, kind: best.kind,
    panel, branches: branches.filter((b) => b.score >= o.scoreThreshold), candidates: branches
  }
}

// ---------------------------------------------------------------------------
// Hai manh chu co chung 1 duong dan khong.
// ---------------------------------------------------------------------------

export interface SharedLeaderResult {
  /** Chung 1 duong dan hoac chung 1 hop -> nen gom thanh 1 nhan. */
  shared: boolean
  /** Moi manh co duong dan RIENG (khac nhau) -> khong duoc gom. */
  distinct: boolean
  samePanel: boolean
  a: LeaderResult
  b: LeaderResult
}

function rectOverlapRatio(a: Rect, b: Rect): number {
  const inter = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0))
  return small > 0 ? inter / small : 0
}

/** Vung giua hai o chu (neu gan nhau) co phai la nen hop lien tuc cung mau `ref` khong. */
function gapIsPanelFill(image: RgbaImage, a: Rect, b: Rect, ref: [number, number, number], tol: number): boolean {
  const hMin = Math.min(a.y1 - a.y0, b.y1 - b.y0)
  const dx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
  const dy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)
  if (dx <= 0 && dy <= 0) return true
  let x0: number; let x1: number; let y0: number; let y1: number
  if (dy > 0 && dx <= 0) {
    if (dy > hMin) return false
    x0 = Math.max(a.x0, b.x0); x1 = Math.min(a.x1, b.x1)
    y0 = Math.min(a.y1, b.y1); y1 = Math.max(a.y0, b.y0)
  } else if (dx > 0 && dy <= 0) {
    if (dx > hMin * 1.2) return false
    x0 = Math.min(a.x1, b.x1); x1 = Math.max(a.x0, b.x0)
    y0 = Math.max(a.y0, b.y0); y1 = Math.min(a.y1, b.y1)
  } else return false
  const near = nearColor(ref, tol)
  let total = 0; let ok = 0
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(image.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(image.width, Math.ceil(x1)); x++) {
      total++
      if (near(image.data, (y * image.width + x) * 4)) ok++
    }
  }
  return total > 0 && ok / total >= 0.85
}

/** Ti le diem cua duong ngan hon nam trong `tol` pixel cua duong kia. */
function pathOverlap(p: Array<{ x: number; y: number }>, q: Array<{ x: number; y: number }>, tol: number): number {
  const [short, long] = p.length <= q.length ? [p, q] : [q, p]
  if (short.length === 0) return 0
  const t2 = tol * tol
  let near = 0
  for (const a of short) {
    if (long.some((b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= t2)) near++
  }
  return near / short.length
}

export function sharedLeader(
  image: RgbaImage, boxA: Rect, boxB: Rect, opts?: Partial<LeaderOptions>,
  known?: { a?: LeaderResult; b?: LeaderResult; panelA?: LabelPanel; panelB?: LabelPanel }
): SharedLeaderResult {
  const o: LeaderOptions = { ...DEFAULT_LEADER_OPTIONS, ...opts }
  const a = known?.a ?? scoreLeaderLine(image, boxA, o)
  const b = known?.b ?? scoreLeaderLine(image, boxB, o)
  const hMin = Math.min(boxA.y1 - boxA.y0, boxB.y1 - boxB.y0)
  // Hop VAT LY (khong vat can) de biet hai manh co cung nam trong 1 hop khong.
  const free: Partial<LeaderOptions> = { ...o, avoidBoxes: undefined }
  const pa = known?.panelA ?? findLabelPanel(image, boxA, free)
  const pb = known?.panelB ?? findLabelPanel(image, boxB, free)
  const fillClose = !!pa.fill && !!pb.fill &&
    Math.hypot(pa.fill[0] - pb.fill[0], pa.fill[1] - pb.fill[1], pa.fill[2] - pb.fill[2]) <= 30
  const samePanel = pa.boxed && pb.boxed && fillClose && !!pa.fill &&
    (rectOverlapRatio(pa.inner, pb.inner) >= 0.6 || gapIsPanelFill(image, boxA, boxB, pa.fill, o.panelColorTolerance))
  if (a.hasLeader && b.hasLeader) {
    // Cung 1 duong dan neu diem gan panel cua hai ben trung nhau; khac nhau -> hai nhan rieng.
    // Chi so nhanh GAN o chu cua minh nhat (nhanh cua nhan ke ben cung nam trong vanh hat giong).
    const nearest = (r: LeaderResult, box: Rect): LeaderBranch =>
      r.branches.reduce((best, br) => (distToRect(br.attach.x, br.attach.y, box) < distToRect(best.attach.x, best.attach.y, box) ? br : best))
    const na = nearest(a, boxA); const nb = nearest(b, boxB)
    // Hai manh cung 1 duong dan: diem noi gan nhau, hoac hai duong di cung bam tren 1 net (chong lan nhieu).
    const close = Math.hypot(na.attach.x - nb.attach.x, na.attach.y - nb.attach.y) < hMin * 0.6 ||
      pathOverlap(na.path, nb.path, 4) >= 0.5
    return { shared: close, distinct: !close, samePanel, a, b }
  }
  // Chi mot ben (hoac khong ben nao) co duong dan: cung hop thi la mot nhan.
  return { shared: samePanel, distinct: false, samePanel, a, b }
}
