import { normalizeForAnswerMatch } from '../../../shared/text/normalizeVietnamese'

export interface AnatomyQuestionAnswer {
  answerText: string
  acceptedAlternates: string[]
}

export interface AnatomyAnswerResult {
  isCorrect: boolean
  normalizedSubmitted: string
}

/**
 * Cham 1 cau tra loi go chu tu do cho cau hoi dinh vi hinh giai phau. Thuan
 * tuy, khong dung DB - khop "gan dung" (bo dau/hoa-thuong/khoang trang thua)
 * voi dap an dung hoac bat ky dap an chap nhan duoc nao da duoc soan san khi
 * tao cau hoi. Khong dung Levenshtein - danh sach dap an chap nhan duoc la co
 * che chinh de bat bien the cach goi ten.
 */
export function computeAnatomyAnswerResult(
  question: AnatomyQuestionAnswer,
  submittedText: string
): AnatomyAnswerResult {
  const normalizedSubmitted = normalizeForAnswerMatch(submittedText)
  if (normalizedSubmitted === '') {
    return { isCorrect: false, normalizedSubmitted }
  }

  const candidates = [question.answerText, ...question.acceptedAlternates].map(
    normalizeForAnswerMatch
  )
  const isCorrect = candidates.includes(normalizedSubmitted)

  return { isCorrect, normalizedSubmitted }
}
