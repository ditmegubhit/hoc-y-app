import { normalizeQuestionText } from '../quiz/dedup'
import type { DraftQuestion } from '../../../shared/types/question'

// Loc bo cac cau HONG ro rang truoc khi luu - huu ich nhat cho output model nho
// (Ollama hay: 0 hoac >1 dap an dung, phuong an trung nhau, phuong an =
// cau hoi, cau qua ngan). An toan cho ca Claude (chi bo cau that su loi).

function norm(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface SanitizeResult {
  kept: DraftQuestion[]
  dropped: number
}

export function sanitizeQuestions(questions: DraftQuestion[]): SanitizeResult {
  const kept: DraftQuestion[] = []
  let dropped = 0

  for (const q of questions) {
    const questionText = q.questionText?.trim() ?? ''
    if (questionText.length < 8) {
      dropped += 1
      continue
    }

    // Chuan hoa + loc option: bo rong, bo trung (theo text chuan hoa), bo option
    // trung noi dung cau hoi.
    const qKey = normalizeQuestionText(questionText)
    const seen = new Set<string>()
    const options = (q.options ?? [])
      .map((o) => ({ ...o, text: o.text?.trim() ?? '' }))
      .filter((o) => {
        const k = norm(o.text)
        if (k === '' || k === qKey || seen.has(k)) return false
        seen.add(k)
        return true
      })

    const correctCount = options.filter((o) => o.isCorrect).length

    // Can it nhat 3 phuong an phan biet + dung 1 dap an dung. Neu con 3 option ma
    // dung 1 dap an dung thi van giu (tot hon la vut ca cau).
    if (options.length < 3 || correctCount !== 1) {
      dropped += 1
      continue
    }

    kept.push({
      questionText,
      options: options.map((o, idx) => ({
        id: String.fromCharCode(97 + idx),
        text: o.text,
        isCorrect: o.isCorrect
      })),
      explanation: q.explanation?.trim() ? q.explanation.trim() : null
    })
  }

  return { kept, dropped }
}
