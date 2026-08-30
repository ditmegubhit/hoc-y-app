import type { DraftQuestion } from '../../../shared/types/question'

/**
 * Chuan hoa text cau hoi de so sanh trung: bo dau cau cuoi, gom khoang trang,
 * thuong hoa. Giu nguyen dau tieng Viet (khong strip) de tranh gop nham 2 cau
 * khac nghia.
 */
export function normalizeQuestionText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!,;:]+$/u, '')
}

export interface DedupeResult {
  kept: DraftQuestion[]
  removed: number
}

/**
 * Bo cac cau trung voi `existingTexts` (cau da co trong ngan hang) va trung
 * nhau trong chinh batch.
 */
export function dedupeQuestions(
  questions: DraftQuestion[],
  existingTexts: string[]
): DedupeResult {
  const seen = new Set(existingTexts.map(normalizeQuestionText))
  const kept: DraftQuestion[] = []
  let removed = 0
  for (const q of questions) {
    const key = normalizeQuestionText(q.questionText)
    if (key === '' || seen.has(key)) {
      removed += 1
      continue
    }
    seen.add(key)
    kept.push(q)
  }
  return { kept, removed }
}
