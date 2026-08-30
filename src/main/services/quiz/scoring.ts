import type { QuestionOption } from '../../../shared/types/question'
import type { AttemptAnswerInput } from '../../../shared/types/quiz'

export interface ScoredAnswer {
  quizQuestionId: string
  selectedOptionId: string | null
  correctOptionId: string
  isCorrect: boolean
}

export interface AttemptResult {
  perAnswer: ScoredAnswer[]
  correctCount: number
  totalCount: number
  score: number // thang 10, 1 chu so thap phan
}

// Tim option dung dau tien; '' neu cau hoi khong co option nao danh dau dung
// (du lieu hong) - khi do khong the cham dung cho cau nay.
function findCorrectOptionId(options: QuestionOption[]): string {
  return options.find((o) => o.isCorrect)?.id ?? ''
}

/**
 * Cham diem 1 luot lam bai. Thuan tuy, khong dung DB.
 *
 * - `snapshot`: map quizQuestionId -> option cua cau (lay tu quiz_questions,
 *   khong bao gio doc lai question_bank de lich su on dinh).
 * - Cau chua tra loi / khong co trong `answers` -> tinh la sai.
 * - `totalCount` = tong so cau trong snapshot.
 * - `score` = correctCount / totalCount * 10, lam tron 1 chu so thap phan.
 */
export function computeAttemptResult(
  snapshot: Map<string, { options: QuestionOption[] }>,
  answers: AttemptAnswerInput[]
): AttemptResult {
  const answerByQuestion = new Map<string, string | null>()
  for (const a of answers) answerByQuestion.set(a.quizQuestionId, a.selectedOptionId)

  const perAnswer: ScoredAnswer[] = []
  let correctCount = 0

  for (const [quizQuestionId, snap] of snapshot) {
    const correctOptionId = findCorrectOptionId(snap.options)
    const selectedOptionId = answerByQuestion.get(quizQuestionId) ?? null
    const isCorrect =
      correctOptionId !== '' &&
      selectedOptionId !== null &&
      selectedOptionId === correctOptionId
    if (isCorrect) correctCount += 1
    perAnswer.push({ quizQuestionId, selectedOptionId, correctOptionId, isCorrect })
  }

  const totalCount = snapshot.size
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) / 10 : 0

  return { perAnswer, correctCount, totalCount, score }
}
