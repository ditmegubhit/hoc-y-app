import type { Rect } from '../../../shared/types/anatomyQuiz'

// Bo loc rac cho nhan do tu dong: chi GAN CO `suspect` + ly do, KHONG xoa vung.
// Ham thuan; moi tieu chi co nguong cau hinh duoc (JunkThresholds).

export type JunkCode =
  | 'no-leader'
  | 'edge'
  | 'outside-image'
  | 'long-note'
  | 'handwriting'
  | 'page-code'
  | 'too-small'
  | 'too-short'
  | 'repeated'

/** Chuoi hien thi cho nguoi dung (co dau). */
export const JUNK_REASON_TEXT: Record<JunkCode, string> = {
  'no-leader': 'Không có đường dẫn',
  edge: 'Sát mép trên/dưới trang',
  'outside-image': 'Nằm ngoài vùng ảnh chính',
  'long-note': 'Đoạn dài/ghi chú',
  handwriting: 'Có vẻ là chữ viết tay màu',
  'page-code': 'Mã bài/số trang',
  'too-small': 'Chữ quá nhỏ',
  'too-short': 'Chữ quá ngắn',
  repeated: 'Lặp ở nhiều trang (tiêu đề/chân trang)'
}

export interface JunkThresholds {
  /** Khoang cach tu tam nhan toi mep tren/duoi, theo ti le chieu cao trang. */
  edgeMarginRatio: number
  /** Ti le dien tich nhan nam trong vung anh chinh, duoi muc nay la "ngoai anh". */
  minInsideContentRatio: number
  /** Ghi chu dai: so tu/chu cai toi da; co dau ':' thi so tu toi thieu de tinh la ghi chu. */
  maxWords: number
  maxLetters: number
  colonNoteMinWords: number
  /** Nhan co >= so dau cau cuoi cau (. ; !) nay la nhieu cau. */
  maxSentenceMarks: number
  /** Chieu cao chu toi thieu: ti le chieu cao trang va pixel tuyet doi. */
  minTextHeightRatio: number
  minTextHeightPx: number
  /** So chu cai toi thieu, ti le chu cai/ky tu toi thieu. */
  minLetters: number
  minLetterRatio: number
  /** Chu viet tay: ti le pixel muc mau tren o chu toi thieu va do tin cay OCR duoi muc nay. */
  handwritingInkRatio: number
  handwritingMaxConfidence: number
}

export const DEFAULT_JUNK_THRESHOLDS: JunkThresholds = {
  edgeMarginRatio: 0.05,
  minInsideContentRatio: 0.35,
  maxWords: 10,
  maxLetters: 50,
  colonNoteMinWords: 4,
  maxSentenceMarks: 2,
  minTextHeightRatio: 0.0025,
  minTextHeightPx: 8,
  minLetters: 2,
  minLetterRatio: 0.5,
  handwritingInkRatio: 0.06,
  handwritingMaxConfidence: 0.7
}

export interface JunkPageGeometry {
  width: number
  height: number
  /** Vung anh chinh (neu nhan dien duoc), toa do pixel. */
  contentRect: Rect | null
}

export interface JunkInput {
  text: string
  box: Rect
  confidence: number | null
  hasLeader: boolean
  /** Dau mut duong dan (neu co) - dung de xac nhan nhan tro vao vung anh. */
  leaderEndpoint?: { x: number; y: number } | null
  /** Chu nam trong hop trang. */
  boxed?: boolean
  /** Ti le pixel "muc mau" (do/vang bao hoa) tren o chu - dau hieu chu viet tay mau. */
  inkRatio?: number
}

export interface JunkVerdict {
  suspect: boolean
  /** Chuoi hien thi (co dau), cung thu tu voi `codes`. */
  reasons: string[]
  codes: JunkCode[]
}

const lettersOf = (text: string): number => (text.match(/\p{L}/gu) ?? []).length
const wordsOf = (text: string): number => text.trim().split(/\s+/u).filter(Boolean).length

const PAGE_CODE_PATTERNS: RegExp[] = [
  /^(gp|tb|bai|bài|buoi|buổi|phan|phần)?\s*\.?\s*\d{1,3}[\s._-]*[ivx]{0,3}$/iu,
  /^(trang|tr|page|p)\.?\s*\d{1,4}$/iu,
  /^\d{1,4}\s*[/\\]\s*\d{1,4}$/u,
  /^gp\s*\d+/iu
]

export function isPageCodeText(text: string): boolean {
  const t = text.trim()
  if (t === '') return false
  return PAGE_CODE_PATTERNS.some((re) => re.test(t))
}

export function isLongNote(text: string, t: JunkThresholds = DEFAULT_JUNK_THRESHOLDS): boolean {
  const words = wordsOf(text)
  if (words > t.maxWords || lettersOf(text) > t.maxLetters) return true
  const marks = (text.match(/[.;!?](\s|$)/gu) ?? []).length
  if (marks >= t.maxSentenceMarks) return true
  if (/[:：]/u.test(text) && words >= t.colonNoteMinWords) return true
  return false
}

function insideFraction(box: Rect, content: Rect): number {
  const w = Math.max(0, Math.min(box.x1, content.x1) - Math.max(box.x0, content.x0))
  const h = Math.max(0, Math.min(box.y1, content.y1) - Math.max(box.y0, content.y0))
  const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0))
  return (w * h) / area
}

export function classifyJunk(
  input: JunkInput, page: JunkPageGeometry, thresholds?: Partial<JunkThresholds>
): JunkVerdict {
  const t: JunkThresholds = { ...DEFAULT_JUNK_THRESHOLDS, ...thresholds }
  const codes: JunkCode[] = []
  const text = input.text.trim()
  const boxH = input.box.y1 - input.box.y0
  const centerY = (input.box.y0 + input.box.y1) / 2

  if (!input.hasLeader) codes.push('no-leader')

  // Sat mep tren/duoi: chi nghi khi khong co duong dan xac nhan.
  const nearEdge = centerY < page.height * t.edgeMarginRatio || centerY > page.height * (1 - t.edgeMarginRatio)
  if (nearEdge && !input.hasLeader) codes.push('edge')

  // Ngoai vung anh chinh: duong dan cham vao anh thi van hop le (hop trang co the tran ra le).
  if (page.contentRect) {
    const c = page.contentRect
    const inside = insideFraction(input.box, c)
    const slackX = (c.x1 - c.x0) * 0.02; const slackY = (c.y1 - c.y0) * 0.02
    const ep = input.leaderEndpoint
    const endpointInside = !!ep && input.hasLeader &&
      ep.x >= c.x0 - slackX && ep.x <= c.x1 + slackX && ep.y >= c.y0 - slackY && ep.y <= c.y1 + slackY
    if (inside < t.minInsideContentRatio && !endpointInside) codes.push('outside-image')
  }

  if (text !== '' && isLongNote(text, t)) codes.push('long-note')
  if (!input.boxed && (input.inkRatio ?? 0) >= t.handwritingInkRatio &&
      ((input.confidence ?? 0) < t.handwritingMaxConfidence || !input.hasLeader)) codes.push('handwriting')
  if (text !== '' && isPageCodeText(text)) codes.push('page-code')

  if (boxH < Math.max(t.minTextHeightPx, page.height * t.minTextHeightRatio)) codes.push('too-small')
  const letters = lettersOf(text)
  if (letters < t.minLetters || (text.length > 0 && letters / text.length < t.minLetterRatio)) codes.push('too-short')

  return { suspect: codes.length > 0, codes, reasons: codes.map((c) => JUNK_REASON_TEXT[c]) }
}

// ---------------------------------------------------------------------------
// Chu lap lai o vi tri gan giong tren nhieu trang (tieu de/chan trang/logo).
// ---------------------------------------------------------------------------

export interface RepeatThresholds {
  /** So trang khac nhau toi thieu thay cung chu o cung vi tri thi danh dau lap. */
  minPages: number
  /** Dung sai vi tri (ti le kich thuoc trang) cua tam o chu. */
  positionTolerance: number
}

export const DEFAULT_REPEAT_THRESHOLDS: RepeatThresholds = { minPages: 3, positionTolerance: 0.03 }

export function normalizeRepeatKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface RepeatSample {
  pageNumber: number
  text: string
  box: Rect
  pageWidth: number
  pageHeight: number
}

interface RepeatEntry { key: string; cx: number; cy: number; pages: Set<number> }

/** Theo doi chu lap qua cac trang; co the dung tung trang (tang dan) hoac mot lan nhieu trang. */
export class RepeatTracker {
  private entries: RepeatEntry[] = []
  constructor(private readonly thresholds: RepeatThresholds = DEFAULT_REPEAT_THRESHOLDS) {}

  private find(key: string, cx: number, cy: number): RepeatEntry | undefined {
    return this.entries.find((e) => e.key === key &&
      Math.abs(e.cx - cx) <= this.thresholds.positionTolerance && Math.abs(e.cy - cy) <= this.thresholds.positionTolerance)
  }

  private locate(s: RepeatSample): { key: string; cx: number; cy: number } {
    return {
      key: normalizeRepeatKey(s.text),
      cx: (s.box.x0 + s.box.x1) / 2 / s.pageWidth,
      cy: (s.box.y0 + s.box.y1) / 2 / s.pageHeight
    }
  }

  /** Ghi nhan 1 mau; tra ve true neu da du so trang de coi la lap (tinh ca trang hien tai). */
  add(sample: RepeatSample): boolean {
    const { key, cx, cy } = this.locate(sample)
    if (key.length === 0) return false
    let entry = this.find(key, cx, cy)
    if (!entry) { entry = { key, cx, cy, pages: new Set() }; this.entries.push(entry) }
    entry.pages.add(sample.pageNumber)
    return entry.pages.size >= this.thresholds.minPages
  }

  isRepeated(sample: RepeatSample): boolean {
    const { key, cx, cy } = this.locate(sample)
    const entry = key.length === 0 ? undefined : this.find(key, cx, cy)
    return !!entry && entry.pages.size >= this.thresholds.minPages
  }
}

/** Danh sach vung nhieu trang -> tap chi so (theo thu tu dua vao) la chu lap. */
export function markRepeatedAcrossPages(
  samples: RepeatSample[], thresholds: Partial<RepeatThresholds> = {}
): Set<number> {
  const tracker = new RepeatTracker({ ...DEFAULT_REPEAT_THRESHOLDS, ...thresholds })
  for (const s of samples) tracker.add(s)
  const result = new Set<number>()
  samples.forEach((s, i) => { if (tracker.isRepeated(s)) result.add(i) })
  return result
}

// ---------------------------------------------------------------------------
// Vung anh chinh: hop chu nhat bao phan "co noi dung" (khong phai nen trang).
// ---------------------------------------------------------------------------

export interface ContentRectOptions {
  /** Pixel coi la noi dung neu khong gan trang va khac nen. */
  whiteThreshold: number
  /** Ti le noi dung toi thieu tren 1 hang/cot de tinh la thuoc anh. */
  minRowFraction: number
  /** Vung phai chiem it nhat ti le nay cua trang moi chieu, neu khong coi la khong co anh. */
  minSizeRatio: number
}

export const DEFAULT_CONTENT_OPTIONS: ContentRectOptions = { whiteThreshold: 235, minRowFraction: 0.15, minSizeRatio: 0.3 }

/** Bao cua moi doan du dai (>= minLen, cho phep dut <= gap) co gia tri >= nguong: tu doan dau toi doan cuoi
 * (trang co nhieu anh xep chong van duoc coi la 1 vung noi dung). */
function runsSpan(values: number[], threshold: number, gap: number, minLen: number): [number, number] | null {
  let first = -1; let lastEnd = -1
  let start = -1; let last = -1
  for (let i = 0; i <= values.length; i++) {
    const on = i < values.length && values[i] >= threshold
    if (on) {
      if (start < 0) start = i
      last = i
    } else if (start >= 0 && (i >= values.length || i - last > gap)) {
      if (last - start + 1 >= minLen) {
        if (first < 0) first = start
        lastEnd = last
      }
      start = -1
    }
  }
  return first < 0 ? null : [first, lastEnd]
}

export function findContentRect(
  image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  opts?: Partial<ContentRectOptions>
): Rect | null {
  const o = { ...DEFAULT_CONTENT_OPTIONS, ...opts }
  const { data, width, height } = image
  const rows = new Array<number>(height).fill(0)
  // Lay mau thua de nhanh: moi 2 pixel. Buoc 1: ti le hang co noi dung -> doan hang dai nhat.
  const isInk = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4
    return data[i] < o.whiteThreshold || data[i + 1] < o.whiteThreshold || data[i + 2] < o.whiteThreshold
  }
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) if (isInk(x, y)) rows[y]++
  }
  const rowFrac = rows.map((c) => c / Math.max(1, width / 2))
  for (let y = 1; y < height; y += 2) rowFrac[y] = rowFrac[y - 1]
  const ry = runsSpan(rowFrac, o.minRowFraction, 6, Math.round(height * 0.02))
  if (!ry) return null
  // Buoc 2: ti le cot co noi dung CHI TRONG doan hang do (anh ngang chiem it chieu cao trang van tim dung).
  const cols = new Array<number>(width).fill(0)
  for (let y = ry[0] - (ry[0] % 2); y <= ry[1]; y += 2) {
    for (let x = 0; x < width; x += 2) if (isInk(x, y)) cols[x]++
  }
  const colFrac = cols.map((c) => c / Math.max(1, (ry[1] - ry[0] + 1) / 2))
  for (let x = 1; x < width; x += 2) colFrac[x] = colFrac[x - 1]
  const rx = runsSpan(colFrac, o.minRowFraction, 6, Math.round(width * 0.02))
  if (!rx) return null
  // Noi them 3% moi phia: anh nen trang (mo hinh chup tren nen trang) co mep khong ro.
  const padX = Math.round(width * 0.03); const padY = Math.round(height * 0.03)
  const rect: Rect = {
    x0: Math.max(0, rx[0] - padX), x1: Math.min(width, rx[1] + 1 + padX),
    y0: Math.max(0, ry[0] - padY), y1: Math.min(height, ry[1] + 1 + padY)
  }
  if (rect.x1 - rect.x0 < width * o.minSizeRatio || rect.y1 - rect.y0 < height * o.minSizeRatio) return null
  return rect
}
