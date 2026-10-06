import type { Rect } from '../../../shared/types/anatomyQuiz'
import { findLabelPanel, type LabelPanel, type LeaderBranch, type LeaderOptions, type LeaderResult, type RgbaImage } from './leaderLine'
import { hexDistance, hexToRgb, type VectorLine, type VectorRect } from './vectorShapes'
import type { GroupFragment } from './labelGrouping'

// Gom chu theo HINH KHOI (hop chu nhat that): moi hop co nen/vien khac han xung quanh chua >= 1 manh
// chu -> TAT CA manh trong hop thanh MOT vung (doc tren xuong, trai sang phai, noi bang khoang trang).
// Hop duoc lay tu VECTOR (vectorShapes.ts) hoac, neu trang khong co hop vector nao (anh chup/scan),
// tu anh (findLabelPanel). Manh chu khong nam trong hop nao -> tra ve `free` de duong cu
// (labelGrouping/leaderLine bang anh) xu ly nhu truoc.
// Duong dan: net vector co 1 dau cham/nam duoi hop va dai du -> dau kia la endpoint (matchVectorLeader).

export interface PanelCandidate {
  box: Rect
  fill?: string
  stroke?: string
  lineWidth: number
  source: 'vector' | 'image'
}

export interface PanelGroup {
  panel: PanelCandidate
  /** Chi so manh (trong mang dau vao) thuoc hop. */
  members: number[]
  /** Hop bao cua chu (cac manh) thuan tuy. */
  textBox: Rect
  /** Hop dung lam vung (mask): ca hop, hoac hop co theo chu + le neu hop qua rong so voi chu. */
  box: Rect
  text: string
  confidence: number | null
}

export interface PanelGroupOptions {
  /** Hop co dien tich > he so nay * dien tich chu bao -> khong phai the nhan, vung co theo chu. */
  maskMaxAreaRatio: number
  /** Hop chi duoc coi la nhan khi dien tich <= he so nay * dien tich chu (hop khung chua) */
  maxAreaRatio: number
  /** Hop <= ti le nay cua dien tich trang. */
  maxPageAreaRatio: number
  /** So manh toi da trong 1 hop nhan (nhieu hon: khung chua/doan van). */
  maxMembers: number
  /** So manh toi thieu de lap vung theo hop (hop tim bang anh: 2, de trang tot giu nguyen duong cu). */
  minMembers: number
  /** Ti le canh dai/canh ngan toi da. */
  maxAspect: number
  /** Manh duoc coi la trong hop neu tam trong hop (+ dung sai) hoac chong >= ti le dien tich manh. */
  minOverlap: number
  insideTolerancePx: number
  /** Do tuong phan: ti le pixel vanh ngoai gan mau nen hop phai < nguong nay (neu hop khong co vien). */
  maxRingSameShare: number
  /** Mau RGB gan nhau < nguong nay coi la cung mau. */
  colorTolerance: number
}

export const DEFAULT_PANEL_OPTIONS: PanelGroupOptions = {
  maskMaxAreaRatio: 10,
  maxAreaRatio: 16,
  maxPageAreaRatio: 0.12,
  maxMembers: 6,
  minMembers: 1,
  maxAspect: 25,
  minOverlap: 0.6,
  insideTolerancePx: 2,
  maxRingSameShare: 0.6,
  colorTolerance: 40
}

const area = (r: Rect): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)
const heightOf = (r: Rect): number => Math.max(1, r.y1 - r.y0)
const unionRect = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
}

function distToRect(px: number, py: number, r: Rect): number {
  return Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1))
}

const rgbHex = (c: [number, number, number]): string =>
  `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

// ---------------------------------------------------------------------------
// Ung vien hop
// ---------------------------------------------------------------------------

/** Ti le pixel trong vanh 3-6px NGOAI hop co mau gan `fill` (hop chim vao nen cung mau -> khong tuong phan). */
export function ringSameShare(image: RgbaImage, box: Rect, fill: string, tol: number): number {
  const [fr, fg, fb] = hexToRgb(fill)
  let total = 0; let same = 0
  const x0 = Math.floor(box.x0); const x1 = Math.ceil(box.x1); const y0 = Math.floor(box.y0); const y1 = Math.ceil(box.y1)
  const sample = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
    const i = (y * image.width + x) * 4
    total++
    if (Math.hypot(image.data[i] - fr, image.data[i + 1] - fg, image.data[i + 2] - fb) <= tol) same++
  }
  for (const off of [4, 6]) {
    for (let x = x0 - off; x <= x1 + off; x += 2) { sample(x, y0 - off); sample(x, y1 + off) }
    for (let y = y0 - off; y <= y1 + off; y += 2) { sample(x0 - off, y); sample(x1 + off, y) }
  }
  return total === 0 ? 0 : same / total
}

/**
 * Loc hop vector thanh "hop that": co nen hoac vien tuong phan voi xung quanh (khong bat buoc ca hai).
 *  - co vien nhin thay duoc va khac mau nen (hoac khong co nen) -> dat.
 *  - chi co nen: can anh de so voi vanh ngoai; khong co anh -> chap nhan (chi loai nen trang sat trang).
 */
export function vectorPanelCandidates(
  rects: VectorRect[], image?: RgbaImage | null, opts: Partial<PanelGroupOptions> = {}
): PanelCandidate[] {
  const o = { ...DEFAULT_PANEL_OPTIONS, ...opts }
  const out: PanelCandidate[] = []
  for (const r of rects) {
    const bordered = !!r.stroke && (!r.fill || hexDistance(r.stroke, r.fill) >= o.colorTolerance)
    let ok = bordered
    if (!ok && r.fill) {
      ok = image ? ringSameShare(image, r.box, r.fill, o.colorTolerance) < o.maxRingSameShare : true
    }
    if (!ok) continue
    const half = r.stroke ? r.lineWidth / 2 : 0
    out.push({
      box: { x0: r.box.x0 - half, y0: r.box.y0 - half, x1: r.box.x1 + half, y1: r.box.y1 + half },
      fill: r.fill, stroke: r.stroke, lineWidth: r.lineWidth, source: 'vector'
    })
  }
  return out
}

/** Hop tim bang anh (trang khong co vector): moi manh + cac manh ke ben tren/duoi (cung hop nhieu dong). */
export function imagePanelCandidates(
  image: RgbaImage, fragments: GroupFragment[], leaderOpts?: Partial<LeaderOptions>
): PanelCandidate[] {
  const out: PanelCandidate[] = []
  const seen: Rect[] = []
  const push = (panel: LabelPanel): void => {
    if (!panel.boxed) return
    if (seen.some((s) => {
      const inter = overlapArea(s, panel.rect)
      return inter / Math.max(1, Math.min(area(s), area(panel.rect))) >= 0.9 && inter / Math.max(1, Math.max(area(s), area(panel.rect))) >= 0.8
    })) return
    seen.push(panel.rect)
    out.push({
      box: panel.rect, fill: panel.fill ? rgbHex(panel.fill) : undefined,
      stroke: panel.bordered ? '#000000' : undefined, lineWidth: panel.bordered ? 1 : 0, source: 'image'
    })
  }
  const neighborsOf = (i: number): number[] => {
    // Chuoi manh xep chong doc (khoang cach doc <= 1.2 chieu cao, chong ngang >= 30%), toi da 5 manh.
    const group = [i]
    let box = fragments[i].box
    for (let guard = 0; guard < 4; guard++) {
      let added = false
      for (let j = 0; j < fragments.length; j++) {
        if (group.includes(j)) continue
        const b = fragments[j].box
        const h = Math.min(heightOf(box), heightOf(b))
        const gapY = Math.max(0, Math.max(box.y0, b.y0) - Math.min(box.y1, b.y1))
        const ov = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0)
        if (gapY > h * 1.2 || ov < Math.min(box.x1 - box.x0, b.x1 - b.x0) * 0.3) continue
        group.push(j); box = unionRect(box, b); added = true
        if (group.length >= 5) return group
      }
      if (!added) break
    }
    return group
  }
  const { avoidBoxes: _ignored, ...o } = leaderOpts ?? {}
  void _ignored
  for (let i = 0; i < fragments.length; i++) {
    const members = neighborsOf(i)
    if (members.length > 1) {
      let box = fragments[members[0]].box
      for (const m of members) box = unionRect(box, fragments[m].box)
      push(findLabelPanel(image, box, o))
    }
    push(findLabelPanel(image, fragments[i].box, o))
  }
  return out
}

// ---------------------------------------------------------------------------
// Gom manh chu vao hop
// ---------------------------------------------------------------------------

function fragmentInside(frag: Rect, panel: Rect, o: PanelGroupOptions): boolean {
  const cx = (frag.x0 + frag.x1) / 2; const cy = (frag.y0 + frag.y1) / 2
  const t = o.insideTolerancePx
  if (cx >= panel.x0 - t && cx <= panel.x1 + t && cy >= panel.y0 - t && cy <= panel.y1 + t) return true
  return overlapArea(frag, panel) >= o.minOverlap * Math.max(1, area(frag))
}

/** Thu tu doc: chia dong theo tam doc (sai lech <= 0.6 chieu cao chu), trong dong trai -> phai. */
export function readingOrder(frags: GroupFragment[], members: number[]): number[] {
  const sorted = members.slice().sort((a, b) =>
    (frags[a].box.y0 + frags[a].box.y1) / 2 - (frags[b].box.y0 + frags[b].box.y1) / 2)
  const lines: number[][] = []
  for (const m of sorted) {
    const cy = (frags[m].box.y0 + frags[m].box.y1) / 2
    const h = heightOf(frags[m].box)
    const line = lines.find((l) => {
      const ref = frags[l[0]].box
      return Math.abs((ref.y0 + ref.y1) / 2 - cy) <= 0.6 * Math.min(h, heightOf(ref))
    })
    if (line) line.push(m); else lines.push([m])
  }
  return lines.flatMap((l) => l.sort((a, b) => frags[a].box.x0 - frags[b].box.x0))
}

function buildGroup(frags: GroupFragment[], members: number[], panel: PanelCandidate, o: PanelGroupOptions): PanelGroup {
  const order = readingOrder(frags, members)
  let textBox = frags[order[0]].box
  let weight = 0; let confSum = 0; let anyNull = false
  for (const m of order) {
    textBox = unionRect(textBox, frags[m].box)
    const f = frags[m]
    const w = Math.max(1, f.text.trim().length)
    if (f.confidence == null) anyNull = true
    else { confSum += f.confidence * w; weight += w }
  }
  // Vung (mask): ca hop neu hop vua voi chu; hop qua rong so voi chu -> hop co theo chu + le nho (trong hop).
  const h = heightOf(textBox)
  let box = panel.box
  if (area(panel.box) > o.maskMaxAreaRatio * Math.max(1, area(textBox))) {
    const m = Math.max(4, h * 0.35)
    box = {
      x0: Math.max(panel.box.x0, textBox.x0 - m), y0: Math.max(panel.box.y0, textBox.y0 - m),
      x1: Math.min(panel.box.x1, textBox.x1 + m), y1: Math.min(panel.box.y1, textBox.y1 + m)
    }
  }
  return {
    panel, members: order, textBox, box,
    text: order.map((m) => frags[m].text.trim()).filter(Boolean).join(' '),
    confidence: anyNull || weight === 0 ? null : confSum / weight
  }
}

export interface PanelGrouping {
  groups: PanelGroup[]
  /** Chi so cac manh KHONG thuoc hop nao. */
  free: number[]
}

/**
 * Gan moi manh vao hop NHO NHAT chua no (tam nam trong hop hoac chong >= minOverlap). Hop khong hop le
 * (qua lon/qua nhieu manh/ti le canh la) bi bo va cac manh cua no thu hop lon hon ke tiep, neu khong
 * -> `free`.
 */
export function groupFragmentsIntoPanels(
  frags: GroupFragment[], panels: PanelCandidate[], pageWidth: number, pageHeight: number,
  opts: Partial<PanelGroupOptions> = {}
): PanelGrouping {
  const o = { ...DEFAULT_PANEL_OPTIONS, ...opts }
  const pageArea = Math.max(1, pageWidth * pageHeight)
  const sane = panels
    .filter((p) => {
      const w = p.box.x1 - p.box.x0; const h = p.box.y1 - p.box.y0
      return w > 0 && h > 0 && Math.max(w / h, h / w) <= o.maxAspect && w * h <= pageArea * o.maxPageAreaRatio
    })
    .sort((a, b) => area(a.box) - area(b.box))
  const banned = new Set<number>()
  let assign = new Map<number, number[]>()
  for (let pass = 0; pass < 6; pass++) {
    assign = new Map<number, number[]>()
    frags.forEach((f, i) => {
      for (let k = 0; k < sane.length; k++) {
        if (banned.has(k) || !fragmentInside(f.box, sane[k].box, o)) continue
        assign.set(k, [...(assign.get(k) ?? []), i])
        return
      }
    })
    let bannedNow = false
    for (const [k, members] of assign) {
      let textBox = frags[members[0]].box
      for (const m of members) textBox = unionRect(textBox, frags[m].box)
      const tooMany = members.length > o.maxMembers || members.length < o.minMembers
      const tooBig = area(sane[k].box) > o.maxAreaRatio * Math.max(1, area(textBox))
      if (tooMany || tooBig) { banned.add(k); bannedNow = true }
    }
    if (!bannedNow) break
  }
  const groups: PanelGroup[] = []
  const used = new Set<number>()
  for (const [k, members] of assign) {
    groups.push(buildGroup(frags, members, sane[k], o))
    members.forEach((m) => used.add(m))
  }
  groups.sort((p, q) => p.box.y0 - q.box.y0 || p.box.x0 - q.box.x0)
  return { groups, free: frags.map((_, i) => i).filter((i) => !used.has(i)) }
}

// ---------------------------------------------------------------------------
// Duong dan bang vector
// ---------------------------------------------------------------------------

export interface VectorLeaderOptions {
  minLengthFactor: number
  minLengthPx: number
  /** Dung sai cham hop: max(minTouchPx, touchFactor * chieu cao chu). */
  minTouchPx: number
  touchFactor: number
  /** Duong gap/vet nguech ngoac: tong do dai / khoang cach hai dau toi da. */
  maxWiggle: number
}

export const DEFAULT_VECTOR_LEADER_OPTIONS: VectorLeaderOptions = {
  minLengthFactor: 1.5, minLengthPx: 18, minTouchPx: 5, touchFactor: 0.4, maxWiggle: 2.2
}

/** Duong du dai va du thang de la duong dan (khong phai net but viet tay nguech ngoac). */
export function isLeaderLikeLine(line: VectorLine, opts: Partial<VectorLeaderOptions> = {}): boolean {
  const o = { ...DEFAULT_VECTOR_LEADER_OPTIONS, ...opts }
  if (line.length < o.minLengthPx) return false
  const a = line.points[0]; const b = line.points[line.points.length - 1]
  const chord = Math.hypot(a[0] - b[0], a[1] - b[1])
  // Duong khep kin/vet cuon: chord ~ 0.
  return chord >= o.minLengthPx * 0.8 && line.length / Math.max(1, chord) <= o.maxWiggle
}

export interface VectorLeaderMatch {
  branches: LeaderBranch[]
  best: LeaderBranch
}

/**
 * Tim net vector co 1 dau cham/nam duoi `box` (dung sai) va keo dai ra ngoai >= do dai toi thieu.
 * Cac hop khac (otherBoxes) chan: net co dau xa nam trong hop khac khong phai duong dan cua hop nay.
 */
export function matchVectorLeader(
  box: Rect, textHeight: number, lines: VectorLine[], otherBoxes: Rect[] = [],
  opts: Partial<VectorLeaderOptions> = {}
): VectorLeaderMatch | null {
  const o = { ...DEFAULT_VECTOR_LEADER_OPTIONS, ...opts }
  const tol = Math.max(o.minTouchPx, o.touchFactor * textHeight)
  const minLen = Math.max(o.minLengthPx, o.minLengthFactor * textHeight)
  const branches: LeaderBranch[] = []
  for (const line of lines) {
    if (!isLeaderLikeLine(line, o)) continue
    const pts = line.points
    for (const fromStart of [true, false]) {
      const near = fromStart ? pts[0] : pts[pts.length - 1]
      if (distToRect(near[0], near[1], box) > tol) continue
      const path = (fromStart ? pts : pts.slice().reverse()).map(([x, y]) => ({ x, y }))
      // Diem xa nhat tinh tu mep hop (net co the nam duoi hop mot doan roi moi ra ngoai).
      let far = path[0]; let extent = 0
      for (const p of path) {
        const d = distToRect(p.x, p.y, box)
        if (d > extent) { extent = d; far = p }
      }
      if (extent < minLen) continue
      if (otherBoxes.some((r) => distToRect(far.x, far.y, r) <= 1)) continue
      const chord = Math.hypot(far.x - path[0].x, far.y - path[0].y)
      branches.push({
        attach: { x: path[0].x, y: path[0].y }, endpoint: { x: far.x, y: far.y }, extent,
        kind: line.length / Math.max(1, chord) > 1.15 ? 'curved' : 'straight', thickness: line.width,
        score: 1, pixelCount: Math.round(line.length), supportFrac: 1, colorConsistency: 1, path
      })
    }
  }
  if (branches.length === 0) return null
  branches.sort((a, b) => b.extent - a.extent)
  return { branches, best: branches[0] }
}

/** Ket qua leader dang LeaderResult de dung chung debug/junk (score 1 = vector chinh xac). */
export function vectorLeaderResult(group: PanelGroup, match: VectorLeaderMatch | null): LeaderResult {
  const rect = group.panel.box
  const panel: LabelPanel = {
    rect, inner: rect, boxed: true, bordered: !!group.panel.stroke,
    fill: group.panel.fill ? hexToRgb(group.panel.fill) : undefined
  }
  if (!match) return { score: 0, hasLeader: false, panel, branches: [], candidates: [] }
  return {
    score: 1, hasLeader: true, endpoint: match.best.endpoint, attach: match.best.attach, kind: match.best.kind,
    panel, branches: match.branches, candidates: match.branches
  }
}
