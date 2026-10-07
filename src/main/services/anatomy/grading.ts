import { normalizeForAnswerMatch } from '../../../shared/text/normalizeVietnamese'

export interface AnatomyQuestionAnswer {
  answerText: string
  acceptedAlternates: string[]
}

export interface AnatomyAnswerResult {
  isCorrect: boolean
  normalizedSubmitted: string
}

/** Tu mo dau cum bo nghia ("phan xuong", "doan bung") co the dung truoc hoac sau danh tu chinh. */
const PHRASE_MARKERS = new Set(['phần', 'đoạn'])

/**
 * Dua cum "phan/doan + 1 tu" o dau chuoi ve cuoi: "phan xuong ta trang" ->
 * "ta trang phan xuong". Chi xu ly cum nam sat dau hoac cuoi, phan con lai giu nguyen.
 */
function canonicalPhraseOrder(normalized: string): string {
  const words = normalized.split(' ')
  if (words.length >= 3 && PHRASE_MARKERS.has(words[0])) {
    return [...words.slice(2), words[0], words[1]].join(' ')
  }
  return normalized
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
  const isCorrect =
    candidates.includes(normalizedSubmitted) ||
    candidates.map(canonicalPhraseOrder).includes(canonicalPhraseOrder(normalizedSubmitted))

  return { isCorrect, normalizedSubmitted }
}
