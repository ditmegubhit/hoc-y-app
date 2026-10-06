import { anatomyWordKeys, isKnownTerm, labelKey, normalizeLabel } from '../anatomy/vietnameseLabels'

// Lop loc "lien quan giai phau": cum chu (chu/so ghep lai) khong lien quan giai phau thi LOAI BO han
// (khong tao vung). Chi ap dung cho vung moi quet - vung user da duyet/ve tay khong di qua day.
// Than trong: chi loai khi co BANG CHUNG ro rang (khong co tu giai phau nao VA khong co duong dan,
// hoac la so/ngay/email/cau van xuoi). Tu la nhung co duong dan tro vao hinh thi GIU (co the la thuat ngu
// chua co trong tu dien).

export type RelevanceReason =
  | 'numeric-no-leader' | 'page-or-figure-code' | 'contact-or-date' | 'prose' | 'no-anatomy-no-leader' | 'no-anatomy-suspect'

export const RELEVANCE_REASON_TEXT: Record<RelevanceReason, string> = {
  'numeric-no-leader': 'Chỉ là số/ký hiệu, không có đường dẫn',
  'page-or-figure-code': 'Mã trang/hình/slide',
  'contact-or-date': 'Email, đường link, số điện thoại hoặc ngày tháng',
  prose: 'Câu văn xuôi, không có thuật ngữ giải phẫu',
  'no-anatomy-no-leader': 'Không có thuật ngữ giải phẫu và không có đường dẫn',
  'no-anatomy-suspect': 'Nghi rác và không đủ thuật ngữ giải phẫu'
}

export interface RelevanceInput {
  text: string
  /** Diem duong dan 0..1 (null/undefined = chua biet -> coi nhu khong co). */
  leaderScore?: number | null
  /** Do tin cay OCR 0..1 (null/undefined = chua biet). Dung o che do chat. */
  confidence?: number | null
}

export interface RelevanceVerdict {
  relevant: boolean
  reason?: RelevanceReason
}

export interface RelevanceOptions {
  additionalTerms?: readonly string[]
  /** Diem duong dan toi thieu de coi la "co duong dan". */
  leaderMin?: number
  /** Che do CHAT cho vung da bi nghi rac: chi giu khi la thuat ngu giai phau day du/dot song, hoac co >= 2 tu thuoc tu vung
   * (khong cuu bang duong dan, khong cuu bang ti le 1 tu). */
  strict?: boolean
}

// Tu chuc nang/vi tri: co mat trong nhieu thuat ngu nhung KHONG du de coi la giai phau.
const GENERIC_WORD_KEYS = new Set([
  'cua', 'va', 'o', 'tren', 'duoi', 'trong', 'ngoai', 'truoc', 'sau', 'phai', 'trai', 'ben', 'giua', 'cac',
  'mot', 'la', 'voi', 'cho', 'tu', 'den', 'phan', 'nhu', 'khi', 'se', 'duoc', 'bi', 'do', 'nay', 'khong',
  'thi', 'tai', 'theo', 'hay', 'hoac', 'neu', 'nhung', 'cung', 'rat', 'den', 't', 'p'
])
// Tu chuc nang dung de nhan ra cau van xuoi (khong tinh tu vi tri nhu "tren/duoi" vi hay nam trong nhan).
const PROSE_WORD_KEYS = new Set([
  'va', 'la', 'cua', 'duoc', 'bi', 'nhu', 'khi', 'se', 'cac', 'nhung', 'voi', 'cho', 'nay', 'thi', 'neu', 'hoac', 'rat', 'cung'
])

const VERTEBRA = /^[CTLS]\s?\d{1,2}$/iu
const EMAIL_OR_URL = /(@|https?:\/\/|www\.|\.(com|vn|edu|org|net)\b)/iu
const DATE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/u
const PHONE = /\d[\d\s.-]{7,}\d/u
const PAGE_CODE = /^(h[iì]nh|fig(ure)?|trang|page|slide|b[aả]ng|table|gp|m\d{1,2})\s*[.:_-]?\s*\d+[a-z]?$/iu

const wordsOf = (text: string): string[] => normalizeLabel(text).split(/[\s/,;()\-–_]+/u).filter(Boolean)

// Viet tat giai phau (ĐM/TM/DC/TK) coi nhu tu giai phau; khop voi quy tac mo rong trong normalizeVietnamese/vietnameseLabels.
const ABBREVIATION_KEYS = new Set(['dm', 'tm', 'dc', 'tk'])

/** Cum chu co tin hieu giai phau: la thuat ngu bien/dot song, hoac >= 1/2 so tu "co nghia" (khong tinh tu chuc nang,
 * vi tri, so) thuoc tu vung giai phau (hoac >= 2 tu thuoc tu vung). Mot tu trung don le (vd "thuy" trong ten nguoi,
 * "hinh" trong "Hinh 12") KHONG du. */
function hasAnatomySignal(text: string, vocabulary: Set<string>, additionalTerms: readonly string[], strict = false): boolean {
  if (isKnownTerm(text, additionalTerms)) return true
  if (VERTEBRA.test(text.trim())) return true
  const keys = wordsOf(text).map(labelKey).filter((k) => k.length >= 2 && /[a-z]/u.test(k) && !GENERIC_WORD_KEYS.has(k))
  if (keys.length === 0) return false
  const hits = keys.filter((k) => vocabulary.has(k) || ABBREVIATION_KEYS.has(k)).length
  if (strict) {
    // Chat: chi dem tu >= 3 chu cai (tu ngan nhu ho/chi/da/ha de trung ngau nhien), can >= 2 tu khop va >= 60% so tu.
    const strongHits = keys.filter((k) => k.length >= 3 && (vocabulary.has(k) || ABBREVIATION_KEYS.has(k))).length
    return strongHits >= 2 && strongHits / keys.length >= 0.6
  }
  return hits >= 2 || hits / keys.length >= 0.5
}

export function assessAnatomyRelevance(input: RelevanceInput, options: RelevanceOptions = {}): RelevanceVerdict {
  const text = normalizeLabel(input.text)
  const additionalTerms = options.additionalTerms ?? []
  const leaderMin = options.leaderMin ?? 0.5
  const hasLeader = (input.leaderScore ?? 0) >= leaderMin
  const vocabulary = anatomyWordKeys(additionalTerms)

  // Ma trang/hinh, email, ngay, so dien thoai: loai truoc (khong de 1 tu trung tu vung cuu chung).
  if (PAGE_CODE.test(text)) return { relevant: false, reason: 'page-or-figure-code' }
  if (EMAIL_OR_URL.test(text) || DATE.test(text) || PHONE.test(text)) return { relevant: false, reason: 'contact-or-date' }

  if (options.strict) {
    const conf = input.confidence ?? null
    const strongLeader = (input.leaderScore ?? 0) >= 0.9
    // Nhan co duong dan manh va OCR doc chac -> giu (vd nhan dai bi coi nham la ghi chu).
    if (strongLeader && conf !== null && conf >= 0.9 && (text.match(/\p{L}/gu) ?? []).length >= 4) return { relevant: true }
    // Vung nghi rac ma OCR doc kem (< 0.6) va khong phai thuat ngu bien -> loai.
    if (conf !== null && conf < 0.6 && !isKnownTerm(text, additionalTerms)) return { relevant: false, reason: 'no-anatomy-suspect' }
  }
  if (hasAnatomySignal(text, vocabulary, additionalTerms, options.strict)) return { relevant: true }

  const letters = (text.match(/\p{L}/gu) ?? []).length
  const digits = (text.match(/\p{N}/gu) ?? []).length

  const words = wordsOf(text)
  const proseHits = words.filter((w) => PROSE_WORD_KEYS.has(labelKey(w))).length
  if (words.length >= 5 && proseHits >= 2) return { relevant: false, reason: 'prose' }

  if (letters < 2 && !hasLeader) return { relevant: false, reason: 'numeric-no-leader' }
  if (digits > letters && !hasLeader) return { relevant: false, reason: 'numeric-no-leader' }

  // Co duong dan tro vao hinh thi GIU (nhan co the doc hong/chua co trong tu dien) - loai se lam lo chu khi thi.
  // Khong co duong dan va khong co tu giai phau -> loai.
  if (options.strict) return { relevant: false, reason: 'no-anatomy-suspect' }
  if (!hasLeader) return { relevant: false, reason: 'no-anatomy-no-leader' }
  return { relevant: true }
}
