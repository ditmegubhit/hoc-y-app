// Quy tac "nhap tu dong" sau khi quet: vung nao du tin cay thi tu thanh cau hoi
// (status 'confirmed', reviewed 0), con lai de 'pending'. Thuan tuy.
// Logic text hop le / tach dap an giong anatomyQuiz.repo.ts (ban cu).

export const AUTO_CONFIRM_MIN_CONFIDENCE = 0.8

export function splitSuggestedAnswer(raw: string): { answerText: string; alternates: string[] } {
  const values = raw.split('/').map((part) => part.trim()).filter(Boolean)
  return { answerText: values[0] ?? raw.trim(), alternates: values.slice(1) }
}

export function isUsableAutomaticLabel(raw: string): boolean {
  const text = raw.trim()
  if ((text.match(/[\p{L}]/gu) ?? []).length < 2) return false
  // Ma nhom/buoi thuc hanh, khong phai cau truc giai phau.
  if (/^gp\s*\d+[\s._-]*[ivx]*$/iu.test(text)) return false
  return true
}

export interface DetectedRegion {
  rawText: string
  labelBox: { x0: number; y0: number; x1: number; y1: number }
  refWidth: number
  refHeight: number
  confidence: number | null
  leaderScore?: number | null
  suspect?: boolean
  /** Ly do nghi rac (chuoi hien thi) - luu de giao dien giai thich vi sao vung bi danh dau. */
  suspectReasons?: string[]
}

export interface AutoDraftDecision {
  status: 'confirmed' | 'pending'
  answerText: string | null
  alternates: string[]
}

export function decideAutoDraft(region: DetectedRegion): AutoDraftDecision {
  const ok =
    region.confidence !== null &&
    region.confidence >= AUTO_CONFIRM_MIN_CONFIDENCE &&
    !region.suspect &&
    isUsableAutomaticLabel(region.rawText)
  if (!ok) return { status: 'pending', answerText: null, alternates: [] }
  const suggested = splitSuggestedAnswer(region.rawText)
  if (suggested.answerText.trim() === '') return { status: 'pending', answerText: null, alternates: [] }
  return { status: 'confirmed', answerText: suggested.answerText, alternates: suggested.alternates }
}

/** Ti le dien tich giao / dien tich nho hon, theo toa do chuan hoa [0..1]. */
export function normalizedOverlapRatio(
  a: { box: DetectedRegion['labelBox']; refWidth: number; refHeight: number },
  b: { box: DetectedRegion['labelBox']; refWidth: number; refHeight: number }
): number {
  const na = { x0: a.box.x0 / a.refWidth, x1: a.box.x1 / a.refWidth, y0: a.box.y0 / a.refHeight, y1: a.box.y1 / a.refHeight }
  const nb = { x0: b.box.x0 / b.refWidth, x1: b.box.x1 / b.refWidth, y0: b.box.y0 / b.refHeight, y1: b.box.y1 / b.refHeight }
  const area = Math.max(0, Math.min(na.x1, nb.x1) - Math.max(na.x0, nb.x0)) *
    Math.max(0, Math.min(na.y1, nb.y1) - Math.max(na.y0, nb.y0))
  const smaller = Math.min((na.x1 - na.x0) * (na.y1 - na.y0), (nb.x1 - nb.x0) * (nb.y1 - nb.y0))
  return smaller > 0 ? area / smaller : 0
}
