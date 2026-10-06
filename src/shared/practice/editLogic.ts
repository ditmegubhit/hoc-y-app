// Logic thuan cua man "Sua dap an" khu Thuc hanh GP: hinh hoc vung che, chon vung
// (hit-test), hoan tac, doi mau HSV <-> hex, dap an khac, hang doi duyet trinh tu,
// ti le chia 1/4 - 3/4. Khong phu thuoc DOM/Electron nen test duoc bang vitest.

import type { PracticeRegion, PracticeRegionPatch, Rect } from '../types/practice'
import { normalizeHexColor } from './maskColor'
import { orderRegionsForReview, type ReviewOrderRegion } from './reviewOrder'

// ============================================================================
// Hinh hoc
// ============================================================================

/** Kich thuoc toi thieu cua mot vung che (theo toa do anh, pixel). */
export const MIN_BOX_SIZE = 6

export interface Point {
  x: number
  y: number
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function rectWidth(rect: Rect): number {
  return rect.x1 - rect.x0
}

export function rectHeight(rect: Rect): number {
  return rect.y1 - rect.y0
}

export function rectArea(rect: Rect): number {
  return Math.max(0, rectWidth(rect)) * Math.max(0, rectHeight(rect))
}

/** Hinh chu nhat tu hai diem bat ky (keo tu goc nao cung duoc). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

export function sameRect(a: Rect, b: Rect, epsilon = 0.5): boolean {
  return (
    Math.abs(a.x0 - b.x0) <= epsilon &&
    Math.abs(a.y0 - b.y0) <= epsilon &&
    Math.abs(a.x1 - b.x1) <= epsilon &&
    Math.abs(a.y1 - b.y1) <= epsilon
  )
}

/** Doi hinh chu nhat tu he (fromW x fromH) sang he (toW x toH). */
export function scaleRect(rect: Rect, fromW: number, fromH: number, toW: number, toH: number): Rect {
  const sx = fromW > 0 ? toW / fromW : 1
  const sy = fromH > 0 ? toH / fromH : 1
  return { x0: rect.x0 * sx, y0: rect.y0 * sy, x1: rect.x1 * sx, y1: rect.y1 * sy }
}

/**
 * Dua hinh chu nhat vao trong anh (0..width, 0..height), sap xep lai neu bi lat,
 * dam bao kich thuoc >= minSize (neu anh du lon).
 */
export function clampRectToImage(rect: Rect, width: number, height: number, minSize = MIN_BOX_SIZE): Rect {
  let x0 = clamp(Math.min(rect.x0, rect.x1), 0, width)
  let x1 = clamp(Math.max(rect.x0, rect.x1), 0, width)
  let y0 = clamp(Math.min(rect.y0, rect.y1), 0, height)
  let y1 = clamp(Math.max(rect.y0, rect.y1), 0, height)
  if (x1 - x0 < minSize) {
    x1 = Math.min(width, x0 + minSize)
    x0 = Math.max(0, x1 - minSize)
  }
  if (y1 - y0 < minSize) {
    y1 = Math.min(height, y0 + minSize)
    y0 = Math.max(0, y1 - minSize)
  }
  return { x0, y0, x1, y1 }
}

/** Dich chuyen nguyen khoi (giu kich thuoc), khong cho ra ngoai anh. */
export function moveRect(rect: Rect, dx: number, dy: number, width: number, height: number): Rect {
  const w = rectWidth(rect)
  const h = rectHeight(rect)
  const x0 = clamp(rect.x0 + dx, 0, Math.max(0, width - w))
  const y0 = clamp(rect.y0 + dy, 0, Math.max(0, height - h))
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

/** Doi co theo tay cam; canh dang keo khong vuot qua canh doi dien (giu minSize) va khong ra ngoai anh. */
export function resizeRectByHandle(
  rect: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
  minSize = MIN_BOX_SIZE
): Rect {
  let { x0, y0, x1, y1 } = rect
  if (handle.includes('w')) x0 = clamp(rect.x0 + dx, 0, rect.x1 - minSize)
  if (handle.includes('e')) x1 = clamp(rect.x1 + dx, rect.x0 + minSize, width)
  if (handle.includes('n')) y0 = clamp(rect.y0 + dy, 0, rect.y1 - minSize)
  if (handle.includes('s')) y1 = clamp(rect.y1 + dy, rect.y0 + minSize, height)
  return { x0, y0, x1, y1 }
}

/** Toa do tam cua 8 tay cam. */
export function handlePosition(rect: Rect, handle: ResizeHandle): Point {
  const cx = (rect.x0 + rect.x1) / 2
  const cy = (rect.y0 + rect.y1) / 2
  const x = handle.includes('w') ? rect.x0 : handle.includes('e') ? rect.x1 : cx
  const y = handle.includes('n') ? rect.y0 : handle.includes('s') ? rect.y1 : cy
  return { x, y }
}

export function pointInRect(rect: Rect, x: number, y: number, tolerance = 0): boolean {
  return x >= rect.x0 - tolerance && x <= rect.x1 + tolerance && y >= rect.y0 - tolerance && y <= rect.y1 + tolerance
}

// ============================================================================
// Chon vung (hit-test)
// ============================================================================

export interface HitItem {
  id: string
  box: Rect
}

/**
 * Cac vung chua diem (x, y), SAP XEP vung nho truoc (uu tien chon vung nho nam
 * trong vung lon). Cung dien tich thi vung o sau (ve de len tren) truoc.
 */
export function hitCandidates(items: readonly HitItem[], x: number, y: number, tolerance = 0): string[] {
  const hits: { id: string; area: number; order: number }[] = []
  items.forEach((item, order) => {
    if (pointInRect(item.box, x, y, tolerance)) hits.push({ id: item.id, area: rectArea(item.box), order })
  })
  hits.sort((a, b) => a.area - b.area || b.order - a.order)
  return hits.map((h) => h.id)
}

/**
 * Chon vung khi bam: neu vung dang chon van nam trong danh sach thi giu nguyen
 * (de keo duoc ngay), nguoc lai lay vung nho nhat. Rong -> null.
 */
export function pickHit(candidates: readonly string[], currentId: string | null): string | null {
  if (candidates.length === 0) return null
  if (currentId !== null && candidates.includes(currentId)) return currentId
  return candidates[0]
}

/** Bam lan nua (khong keo) tai cung cho: xoay vong sang vung ke trong danh sach chong len nhau. */
export function cycleHit(candidates: readonly string[], currentId: string | null): string | null {
  if (candidates.length === 0) return null
  if (currentId === null) return candidates[0]
  const index = candidates.indexOf(currentId)
  if (index < 0) return candidates[0]
  return candidates[(index + 1) % candidates.length]
}

// ============================================================================
// Ap thay doi len vung + hoan tac
// ============================================================================

const PATCH_KEYS = [
  'labelBox',
  'cropBox',
  'rawText',
  'answerText',
  'alternates',
  'status',
  'reviewed',
  'colorOverride',
  'opacityOverride'
] as const

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return false
}

/** Ban sao vung sau khi ap patch (mo phong cach may chu chuan hoa) - dung cho cap nhat lac quan. */
export function applyPatchToRegion(region: PracticeRegion, patch: PracticeRegionPatch): PracticeRegion {
  const next: PracticeRegion = { ...region }
  if (patch.labelBox !== undefined) next.labelBox = patch.labelBox
  if (patch.cropBox !== undefined) next.cropBox = patch.cropBox
  if (patch.rawText !== undefined) next.rawText = patch.rawText
  if (patch.answerText !== undefined) next.answerText = patch.answerText?.trim() ? patch.answerText.trim() : null
  if (patch.alternates !== undefined) next.alternates = patch.alternates.map((a) => a.trim()).filter(Boolean)
  if (patch.status !== undefined) next.status = patch.status
  if (patch.reviewed !== undefined) next.reviewed = patch.reviewed
  if (patch.colorOverride !== undefined) next.colorOverride = patch.colorOverride
  if (patch.opacityOverride !== undefined) next.opacityOverride = patch.opacityOverride
  return next
}

/** Patch co that su doi gia tri nao khong (de khong day thao tac rong vao ngan xep hoan tac). */
export function patchChangesRegion(region: PracticeRegion, patch: PracticeRegionPatch): boolean {
  const after = applyPatchToRegion(region, patch)
  return PATCH_KEYS.some((key) => patch[key] !== undefined && !sameValue(region[key], after[key]))
}

/** Patch dao nguoc: chi chua cac truong ma patch dung toi, voi gia tri hien tai cua vung. */
export function buildInversePatch(region: PracticeRegion, patch: PracticeRegionPatch): PracticeRegionPatch {
  const inverse: Record<string, unknown> = {}
  for (const key of PATCH_KEYS) {
    if (patch[key] !== undefined) inverse[key] = region[key]
  }
  return inverse as PracticeRegionPatch
}

export type EditAction =
  | { kind: 'update'; regionId: string; inverse: PracticeRegionPatch; label: string }
  | { kind: 'delete'; region: PracticeRegion; label: string }
  | { kind: 'create'; regionId: string; label: string }

export const UNDO_LIMIT = 100

/** Them thao tac vao ngan xep (khong sua mang cu), bo bot thao tac cu nhat khi qua gioi han. */
export function pushUndo<T>(stack: readonly T[], action: T, limit = UNDO_LIMIT): T[] {
  const next = [...stack, action]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function popUndo<T>(stack: readonly T[]): { stack: T[]; action: T | null } {
  if (stack.length === 0) return { stack: [], action: null }
  return { stack: stack.slice(0, -1), action: stack[stack.length - 1] }
}

// ============================================================================
// Mau: HSV <-> hex, vong tron mau
// ============================================================================

export interface Hsv {
  /** 0..360 */
  h: number
  /** 0..1 */
  s: number
  /** 0..1 */
  v: number
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const val = clamp(v, 0, 1)
  const c = val * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = val - c
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (n: number): string => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** '#rrggbb' (hoac #rgb) -> HSV, null neu khong phai mau hop le. */
export function hexToHsv(hex: string): Hsv | null {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null
  const n = parseInt(normalized.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** Diem tren vong tron (lech tam dx, dy, ban kinh radius) -> sac do + bao hoa. Goc 0 = huong +x, tang theo chieu kim dong ho. */
export function wheelPointToHs(dx: number, dy: number, radius: number): { h: number; s: number } {
  const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  const s = radius > 0 ? Math.min(1, Math.hypot(dx, dy) / radius) : 0
  return { h, s }
}

export function hsToWheelPoint(h: number, s: number, radius: number): { dx: number; dy: number } {
  const angle = (h * Math.PI) / 180
  const dist = clamp(s, 0, 1) * radius
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist }
}

export const MAX_RECENT_COLORS = 8

/** Dua mau vua dung len dau danh sach "gan day" (khong trung, toi da max). */
export function pushRecentColor(list: readonly string[], hex: string, max = MAX_RECENT_COLORS): string[] {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return [...list]
  return [normalized, ...list.filter((c) => c !== normalized)].slice(0, max)
}

export function parseRecentColors(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const colors: string[] = []
    for (const item of parsed) {
      const hex = typeof item === 'string' ? normalizeHexColor(item) : null
      if (hex && !colors.includes(hex)) colors.push(hex)
    }
    return colors.slice(0, MAX_RECENT_COLORS)
  } catch {
    return []
  }
}

// ============================================================================
// Dap an / dap an khac
// ============================================================================

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Tach "a; b ; ;a" -> ['a','b']: cat khoang trang, bo rong, bo trung (khong phan biet hoa thuong), bo cai trung dap an chinh. */
export function parseAlternates(text: string, answer?: string): string[] {
  const seen = new Set<string>()
  if (answer !== undefined) seen.add(squash(answer).toLowerCase())
  const result: string[] = []
  for (const piece of text.split(/[;；]/)) {
    const value = squash(piece)
    if (value === '') continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

export function formatAlternates(list: readonly string[]): string {
  return list.join('; ')
}

/** Dap an hop le de xac nhan: khong rong sau khi cat khoang trang. */
export function isConfirmableAnswer(answer: string): boolean {
  return squash(answer) !== ''
}

/** Dap an hien san cho 1 vung: dap an da luu, neu chua co thi chu nhan dang. */
export function initialAnswerOf(region: Pick<PracticeRegion, 'answerText' | 'rawText'>): string {
  return region.answerText ?? region.rawText ?? ''
}

/** Form dap an co khac gia tri dang luu khong (de hoi truoc khi thoat). */
export function isAnswerFormDirty(
  region: Pick<PracticeRegion, 'answerText' | 'rawText' | 'alternates'>,
  answer: string,
  alternatesText: string
): boolean {
  if (squash(answer) !== squash(initialAnswerOf(region))) return true
  const current = parseAlternates(alternatesText, answer)
  const saved = parseAlternates(formatAlternates(region.alternates), answer)
  return JSON.stringify(current) !== JSON.stringify(saved)
}

// ============================================================================
// Hang doi duyet trinh tu
// ============================================================================

export interface ReviewQueueOptions {
  startPage: number
  onlyUnreviewed: boolean
}

/** Chup danh sach id theo thu tu duyet (trang -> tren xuong -> trai sang phai). */
export function buildReviewQueue<T extends ReviewOrderRegion>(regions: readonly T[], options: ReviewQueueOptions): string[] {
  return orderRegionsForReview(regions, { onlyUnreviewed: options.onlyUnreviewed, startPage: options.startPage }).map(
    (r) => r.id
  )
}

/**
 * Chi so ke tiep theo huong dir (+1 / -1), bo qua vung da het ton tai (da xoa).
 * Tien: co the tra ve queue.length (het hang doi). Lui: tra -1 neu khong con vung truoc.
 */
export function stepQueueIndex(
  queue: readonly string[],
  index: number,
  dir: 1 | -1,
  isAlive: (id: string) => boolean
): number {
  let i = index + dir
  while (i >= 0 && i < queue.length && !isAlive(queue[i])) i += dir
  if (i < 0) return -1
  return Math.min(i, queue.length)
}

/** Chi so dau tien con song tu vi tri from (bao gom from), hoac queue.length neu het. */
export function firstAliveIndex(queue: readonly string[], from: number, isAlive: (id: string) => boolean): number {
  let i = Math.max(0, from)
  while (i < queue.length && !isAlive(queue[i])) i += 1
  return i
}

// ============================================================================
// Ti le chia hop thoai / file
// ============================================================================

export const DEFAULT_SPLIT_RATIO = 0.25
export const MIN_SPLIT_RATIO = 0.15
export const MAX_SPLIT_RATIO = 0.6

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO
  return clamp(ratio, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO)
}

/** Ti le tu vi tri con tro doc (clientY) trong khung cao containerHeight bat dau o containerTop. */
export function splitRatioFromPointer(pointerY: number, containerTop: number, containerHeight: number): number {
  if (!(containerHeight > 0)) return DEFAULT_SPLIT_RATIO
  return clampSplitRatio((pointerY - containerTop) / containerHeight)
}

export function parseSplitRatio(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_SPLIT_RATIO
  return clampSplitRatio(Number(raw))
}

// ============================================================================
// Trang thai hien thi cua vung
// ============================================================================

export type RegionVisualState = 'unreviewed' | 'confirmed' | 'maskOnly'

export function regionVisualState(region: Pick<PracticeRegion, 'status'>): RegionVisualState {
  if (region.status === 'confirmed') return 'confirmed'
  if (region.status === 'rejected') return 'maskOnly'
  return 'unreviewed'
}

/** Ly do nghi rac: dung truong suspectReasons neu nguon quet co cung cap, neu khong thi suy ra goi y tu so lieu co san. */
export function suspectReasonText(region: PracticeRegion): string {
  const extra = (region as PracticeRegion & { suspectReasons?: unknown }).suspectReasons
  if (Array.isArray(extra)) {
    const reasons = extra.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    if (reasons.length > 0) return reasons.join(', ')
  }
  const hints: string[] = []
  if (region.leaderScore !== null && region.leaderScore < 0.3) hints.push('không thấy đường dẫn')
  const text = squash(region.rawText ?? '')
  if (text.length > 0 && text.length <= 2) hints.push('chữ quá ngắn')
  if (text.length > 45) hints.push('chữ dài như chú thích')
  if (region.confidence !== null && region.confidence < 0.4) hints.push('đọc kém chắc')
  return hints.length > 0 ? hints.join(', ') : 'nghi là rác'
}

/** Lam tron do mo ve phan tram nguyen 0..100. */
export function opacityToPercent(opacity: number): number {
  return Math.round(clamp(Number.isFinite(opacity) ? opacity : 0, 0, 1) * 100)
}

export function percentToOpacity(percent: number): number {
  return clamp(Number.isFinite(percent) ? percent : 0, 0, 100) / 100
}

export function clampPage(page: number, total: number | null): number {
  const max = total !== null && total > 0 ? total : Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(page)) return 1
  return clamp(Math.round(page), 1, max)
}
