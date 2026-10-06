import type { Rect } from '../../../shared/types/anatomyQuiz'
import { clusterLabelFragments, type LabelCluster } from '../anatomy/labelDetection'
import {
  findLabelPanel, scoreLeaderLine, sharedLeader,
  type LabelPanel, type LeaderOptions, type LeaderResult, type RgbaImage
} from './leaderLine'

// Gom/tach cum chu bang tin hieu duong dan, hau xu ly ket qua clusterLabelFragments
// (ham cu van giu nguyen):
//  - TACH: cum gop nhieu manh ma cac manh co duong dan RIENG -> tach thanh nhieu nhan.
//  - GOP: cum bi tach nhung chung 1 hop trang hoac chung 1 duong dan -> gop lai.

export interface GroupFragment {
  box: Rect
  text: string
  confidence?: number | null
}

export interface GroupedLabel {
  box: Rect
  text: string
  confidence: number | null
  /** Chi so cac manh goc (trong mang dau vao) thuoc nhan nay. */
  members: number[]
}

export interface GroupingOptions {
  /** Khoang cach doc toi da (theo chieu cao chu nho nhat) de xet gop 2 cum chung duong dan (khong hop). */
  mergeGapFactor: number
  leader?: Partial<LeaderOptions>
  /** O bo sung KHONG thuoc cac manh dang gom (vd chu/hop da gom theo hinh khoi) - hop trang khong no vao do. */
  extraAvoidBoxes?: Rect[]
}

export const DEFAULT_GROUPING_OPTIONS: GroupingOptions = { mergeGapFactor: 0.9 }

const height = (r: Rect): number => Math.max(1, r.y1 - r.y0)
const width = (r: Rect): number => Math.max(1, r.x1 - r.x0)
const centerOf = (r: Rect): { x: number; y: number } => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 })

function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

function boxGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1))
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
  return Math.hypot(dx, dy)
}

function buildLabel(frags: GroupFragment[], members: number[]): GroupedLabel {
  const ordered = members.map((m) => ({ m, f: frags[m] }))
    .sort((p, q) => p.f.box.y0 - q.f.box.y0 || p.f.box.x0 - q.f.box.x0)
  let box = ordered[0].f.box
  let weightSum = 0; let confSum = 0; let anyNull = false
  for (const { f } of ordered) {
    box = union(box, f.box)
    const w = Math.max(1, f.text.trim().length)
    if (f.confidence == null) anyNull = true
    else { confSum += f.confidence * w; weightSum += w }
  }
  return {
    box,
    text: ordered.map(({ f }) => f.text.trim()).filter(Boolean).join(' '),
    confidence: anyNull || weightSum === 0 ? null : confSum / weightSum,
    members: ordered.map(({ m }) => m)
  }
}

/** Gan moi manh vao cum co hop chua tam manh do (cum nho nhat neu nhieu). */
function assignMembers(frags: GroupFragment[], clusters: LabelCluster[]): number[][] {
  const members: number[][] = clusters.map(() => [])
  frags.forEach((f, i) => {
    const c = centerOf(f.box)
    let best = -1; let bestArea = Infinity
    clusters.forEach((cl, k) => {
      if (c.x < cl.box.x0 - 1 || c.x > cl.box.x1 + 1 || c.y < cl.box.y0 - 1 || c.y > cl.box.y1 + 1) return
      const area = width(cl.box) * height(cl.box)
      if (area < bestArea) { bestArea = area; best = k }
    })
    if (best >= 0) members[best].push(i)
  })
  return members
}

class UnionFind {
  private parent: number[]
  constructor(n: number) { this.parent = Array.from({ length: n }, (_, i) => i) }
  find(i: number): number { return this.parent[i] === i ? i : (this.parent[i] = this.find(this.parent[i])) }
  join(a: number, b: number): void { this.parent[this.find(a)] = this.find(b) }
}

export function regroupLabelFragments(
  image: RgbaImage, fragments: GroupFragment[], opts?: Partial<GroupingOptions>
): GroupedLabel[] {
  const o: GroupingOptions = { ...DEFAULT_GROUPING_OPTIONS, ...opts }
  const baseLeaderOpts = o.leader
  const cache = new Map<string, LeaderResult>()
  const panelCache = new Map<string, LabelPanel>()
  // Hop trang cua nhan khong duoc no lan vao o chu cua manh KHONG thuoc nhan do.
  const avoidFor = (members: number[]): Rect[] =>
    [...fragments.filter((_, i) => !members.includes(i)).map((f) => f.box), ...(o.extraAvoidBoxes ?? [])]
  const keyOf = (box: Rect, members: number[]): string =>
    `${box.x0}|${box.y0}|${box.x1}|${box.y1}|${members.join(',')}`
  const leaderOf = (box: Rect, members: number[]): LeaderResult => {
    const key = keyOf(box, members)
    let r = cache.get(key)
    if (!r) { r = scoreLeaderLine(image, box, { ...baseLeaderOpts, avoidBoxes: avoidFor(members) }); cache.set(key, r) }
    return r
  }
  const panelOf = (box: Rect): LabelPanel => {
    const key = keyOf(box, [])
    let p = panelCache.get(key)
    if (!p) { p = findLabelPanel(image, box, baseLeaderOpts); panelCache.set(key, p) }
    return p
  }

  const base = clusterLabelFragments(fragments.map((f): LabelCluster => ({
    box: f.box, text: f.text, coordSpace: 'image_pixel', confidence: f.confidence ?? null
  })))
  const memberLists = assignMembers(fragments, base)

  // --- 1. TACH ---
  let labels: GroupedLabel[] = []
  base.forEach((cluster, k) => {
    const members = memberLists[k]
    if (members.length === 0) {
      labels.push({ box: cluster.box, text: cluster.text, confidence: cluster.confidence ?? null, members: [] })
      return
    }
    if (members.length < 2) { labels.push(buildLabel(fragments, members)); return }
    const results = members.map((m) => leaderOf(fragments[m].box, [m]))
    const withLeader = members.map((_, i) => i).filter((i) => results[i].hasLeader)
    if (withLeader.length < 2) { labels.push(buildLabel(fragments, members)); return }
    const uf = new UnionFind(members.length)
    for (let a = 0; a < withLeader.length; a++) {
      for (let b = a + 1; b < withLeader.length; b++) {
        const ia = withLeader[a]; const ib = withLeader[b]
        const s = sharedLeader(image, fragments[members[ia]].box, fragments[members[ib]].box, baseLeaderOpts, {
          a: results[ia], b: results[ib], panelA: panelOf(fragments[members[ia]].box), panelB: panelOf(fragments[members[ib]].box)
        })
        if (s.shared) uf.join(ia, ib)
      }
    }
    const roots = new Set(withLeader.map((i) => uf.find(i)))
    if (roots.size < 2) { labels.push(buildLabel(fragments, members)); return }
    // Manh khong co duong dan: dinh vao nhom co duong dan gan nhat.
    members.forEach((m, i) => {
      if (results[i].hasLeader) return
      let best = withLeader[0]; let bestD = Infinity
      for (const j of withLeader) {
        const d = boxGap(fragments[m].box, fragments[members[j]].box)
        if (d < bestD) { bestD = d; best = j }
      }
      uf.join(i, best)
    })
    const groups = new Map<number, number[]>()
    members.forEach((m, i) => {
      const r = uf.find(i)
      groups.set(r, [...(groups.get(r) ?? []), m])
    })
    for (const g of groups.values()) labels.push(buildLabel(fragments, g))
  })

  // --- 2. GOP: cung hop trang, hoac chung duong dan (khong hop) va ke sat nhau ---
  let changed = true
  let guard = 0
  while (changed && guard++ < 50) {
    changed = false
    outer: for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]; const b = labels[j]
        const hMin = Math.min(height(a.box), height(b.box))
        // Loc nhanh: chi xet cac cap o gan nhau trong khoang vai lan chieu cao chu.
        if (boxGap(a.box, b.box) > Math.max(hMin * 4, 40)) continue
        const la = leaderOf(a.box, a.members); const lb = leaderOf(b.box, b.members)
        const pa = panelOf(a.box); const pb = panelOf(b.box)
        const s = sharedLeader(image, a.box, b.box, baseLeaderOpts, { a: la, b: lb, panelA: pa, panelB: pb })
        let merge = false
        if (s.samePanel) merge = s.shared
        else if (s.shared && !pa.boxed && !pb.boxed) {
          const xOverlap = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0)
          const aligned = Math.abs(a.box.x0 - b.box.x0) <= hMin * 0.8 || xOverlap >= Math.min(width(a.box), width(b.box)) * 0.3
          merge = aligned && boxGap(a.box, b.box) <= hMin * o.mergeGapFactor
        }
        if (!merge) continue
        const memberIds = [...a.members, ...b.members]
        labels[i] = memberIds.length > 0
          ? buildLabel(fragments, memberIds)
          : { ...a, box: union(a.box, b.box), text: `${a.text} ${b.text}` }
        labels.splice(j, 1)
        changed = true
        break outer
      }
    }
  }
  labels = labels.sort((p, q) => p.box.y0 - q.box.y0 || p.box.x0 - q.box.x0)
  return labels
}
