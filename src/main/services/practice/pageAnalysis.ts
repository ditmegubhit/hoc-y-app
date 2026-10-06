import type { Rect } from '../../../shared/types/anatomyQuiz'
import { regroupLabelFragments, type GroupFragment, type GroupingOptions } from './labelGrouping'
import { scoreLeaderLine, type LeaderOptions, type LeaderResult, type RgbaImage } from './leaderLine'
import {
  classifyJunk, findContentRect,
  type ContentRectOptions, type JunkThresholds, type JunkVerdict
} from './junkFilter'
import {
  groupFragmentsIntoPanels, imagePanelCandidates, isLeaderLikeLine, matchVectorLeader, vectorLeaderResult, vectorPanelCandidates,
  type PanelCandidate, type PanelGroupOptions, type VectorLeaderOptions
} from './panelRegions'
import type { VectorShapes } from './vectorShapes'

// Ghep cac buoc thuan: gom/tach cum theo duong dan -> cham duong dan -> loc rac.
// Khong phu thuoc Electron/OCR: nhan manh chu (fragments) da co san.
//
// Thu tu: (0) gom chu theo HINH KHOI (hop chu nhat vector; trang khong co hop vector -> tim hop bang anh):
// moi hop chua >=1 manh -> 1 vung (panelRegions). (1) manh con lai (khong thuoc hop) -> duong cu
// gom/tach theo duong dan. (2) cham duong dan: hop vector + trang co net vector -> khop net vector
// (chinh xac); nguoc lai cham bang anh. (3) loc rac.

export interface AnalyzedLabel {
  box: Rect
  text: string
  confidence: number | null
  /** Chi so cac manh goc (trong mang fragments dau vao). */
  members: number[]
  /** 'panel-vector'/'panel-image' = vung la 1 hop chu nhat that (gom het chu trong hop); 'free' = duong gom cu. */
  origin: 'panel-vector' | 'panel-image' | 'free'
  /** Nguon cham duong dan. */
  leaderSource: 'vector' | 'image'
  /** Hop chu nhat chua vung (neu origin la panel). */
  panelBox?: Rect
  leader: LeaderResult
  verdict: JunkVerdict
  inkRatio: number
}

export interface PageAnalysisOptions {
  leader?: Partial<LeaderOptions>
  grouping?: Partial<GroupingOptions>
  junk?: Partial<JunkThresholds>
  content?: Partial<ContentRectOptions>
  /** Doi tuong vector cua trang (null/bo = khong co -> tim hop bang anh). */
  vector?: VectorShapes | null
  panels?: Partial<PanelGroupOptions>
  vectorLeader?: Partial<VectorLeaderOptions>
  /** Tat gom theo hinh khoi (de so sanh voi duong cu). */
  disablePanels?: boolean
}

export interface PageAnalysis {
  labels: AnalyzedLabel[]
  contentRect: Rect | null
  /** Nguon hop: 'vector' | 'image' | 'none' (cho cong cu dump). */
  panelSource: 'vector' | 'image' | 'none'
  panels: PanelCandidate[]
}

/** Ti le pixel "muc mau" do/cam/vang bao hoa trong o chu - dau hieu but mau viet tay. */
export function inkColorRatio(image: RgbaImage, box: Rect): number {
  const x0 = Math.max(0, Math.floor(box.x0)); const x1 = Math.min(image.width, Math.ceil(box.x1))
  const y0 = Math.max(0, Math.floor(box.y0)); const y1 = Math.min(image.height, Math.ceil(box.y1))
  let total = 0; let ink = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * image.width + x) * 4
      const r = image.data[i]; const g = image.data[i + 1]; const b = image.data[i + 2]
      total++
      const max = Math.max(r, g, b); const min = Math.min(r, g, b)
      if (max < 140 || (max - min) / max < 0.6) continue
      // Do/cam/vang: kenh do (gan) cao nhat, kenh xanh duong thap.
      if (r >= max * 0.75 && b < r * 0.55) ink++
    }
  }
  return total === 0 ? 0 : ink / total
}

const median = (v: number[]): number => { const a = v.slice().sort((x, y) => x - y); return a.length === 0 ? 0 : a[Math.floor(a.length / 2)] }

export function analyzePageLabels(
  image: RgbaImage, fragments: GroupFragment[], opts: PageAnalysisOptions = {}
): PageAnalysis {
  const contentRect = findContentRect(image, opts.content)
  const geometry = { width: image.width, height: image.height, contentRect }
  const rgba: RgbaImage = image

  // --- (0) Gom theo hinh khoi ---
  let panels: PanelCandidate[] = []
  let panelSource: PageAnalysis['panelSource'] = 'none'
  if (!opts.disablePanels && fragments.length > 0) {
    panels = vectorPanelCandidates(opts.vector?.rects ?? [], rgba, opts.panels)
    if (panels.length > 0) panelSource = 'vector'
    else {
      // Trang khong co hop vector (anh chup/scan): tim hop bang anh.
      panels = imagePanelCandidates(rgba, fragments, opts.leader)
      if (panels.length > 0) panelSource = 'image'
    }
  }
  const grouping = panels.length > 0
    ? groupFragmentsIntoPanels(fragments, panels, image.width, image.height,
      // Hop tim bang anh chi dung de GOM nhieu manh (>=2); chu 1 manh giu duong cu, khong doi hanh vi trang tot.
      { ...(panelSource === 'image' ? { minMembers: 2 } : {}), ...opts.panels })
    : { groups: [], free: fragments.map((_, i) => i) }

  // Duong dan vector chi la nguon chinh khi trang co net vector du dai/thang (net but viet tay khong tinh).
  const vectorLines = opts.vector?.lines ?? []
  const vectorAuthoritative = panelSource === 'vector' && vectorLines.some((l) => isLeaderLikeLine(l, opts.vectorLeader))
  const allPanelBoxes = grouping.groups.map((g) => g.panel.box)

  const labels: AnalyzedLabel[] = []
  for (const g of grouping.groups) {
    const others = fragments.filter((_, i) => !g.members.includes(i)).map((f) => f.box)
    const h = median(g.members.map((m) => fragments[m].box.y1 - fragments[m].box.y0))
    let leader: LeaderResult
    let leaderSource: 'vector' | 'image' = 'image'
    if (vectorAuthoritative) {
      leaderSource = 'vector'
      const mine = g.panel.box
      const match = matchVectorLeader(mine, h, vectorLines, allPanelBoxes.filter((b) => b !== mine), opts.vectorLeader)
      leader = vectorLeaderResult(g, match)
    } else {
      leader = scoreLeaderLine(image, g.textBox, { ...opts.leader, avoidBoxes: others })
    }
    const inkRatio = inkColorRatio(image, g.box)
    const verdict = classifyJunk({
      text: g.text, box: g.box, confidence: g.confidence, hasLeader: leader.hasLeader,
      leaderEndpoint: leader.endpoint ?? null, boxed: true, inkRatio
    }, geometry, opts.junk)
    labels.push({
      box: g.box, text: g.text, confidence: g.confidence, members: g.members,
      origin: g.panel.source === 'vector' ? 'panel-vector' : 'panel-image', leaderSource, panelBox: g.panel.box,
      leader, verdict, inkRatio
    })
  }

  // --- (1)+(2) Manh con lai: duong cu ---
  const freeFrags = grouping.free.map((i) => fragments[i])
  if (freeFrags.length > 0) {
    const extraAvoid = grouping.groups.flatMap((g) => g.members.map((m) => fragments[m].box))
    const grouped = regroupLabelFragments(image, freeFrags, { ...opts.grouping, leader: opts.leader, extraAvoidBoxes: extraAvoid })
    for (const g of grouped) {
      const members = g.members.map((m) => grouping.free[m])
      const avoidBoxes = fragments.filter((_, i) => !members.includes(i)).map((f) => f.box)
      const leader = scoreLeaderLine(image, g.box, { ...opts.leader, avoidBoxes })
      const inkRatio = inkColorRatio(image, g.box)
      const verdict = classifyJunk({
        text: g.text, box: g.box, confidence: g.confidence, hasLeader: leader.hasLeader,
        leaderEndpoint: leader.endpoint ?? null, boxed: leader.panel.boxed, inkRatio
      }, geometry, opts.junk)
      labels.push({ box: g.box, text: g.text, confidence: g.confidence, members, origin: 'free', leaderSource: 'image', leader, verdict, inkRatio })
    }
  }
  labels.sort((p, q) => p.box.y0 - q.box.y0 || p.box.x0 - q.box.x0)
  return { labels, contentRect, panelSource, panels }
}
