import * as questionBankRepo from '../../db/repositories/questionBank.repo'
import * as lessonsRepo from '../../db/repositories/lessons.repo'
import { collectLessonContentPieces } from './lessonContent'
import { reviewExistingQuestions } from './refineQuizQuestions'
import type { AiProvider } from '../../../shared/types/ai'
import type {
  Question,
  QuestionDraftContent,
  ReviewedQuestion
} from '../../../shared/types/question'

function toContent(q: Question | QuestionDraftContent): QuestionDraftContent {
  return { questionText: q.questionText, options: q.options, explanation: q.explanation }
}

function norm(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isChanged(a: QuestionDraftContent, b: QuestionDraftContent): boolean {
  if (norm(a.questionText) !== norm(b.questionText)) return true
  if (norm(a.explanation ?? '') !== norm(b.explanation ?? '')) return true
  if (a.options.length !== b.options.length) return true
  for (let i = 0; i < a.options.length; i++) {
    if (norm(a.options[i].text) !== norm(b.options[i].text)) return true
    if (a.options[i].isCorrect !== b.options[i].isCorrect) return true
  }
  return false
}

export interface ReviewQuestionsResult {
  ok: boolean
  reviewed?: ReviewedQuestion[]
  errorMessage?: string
}

export async function reviewQuestionBankEntries(
  questionIds: string[],
  provider: AiProvider = 'claude'
): Promise<ReviewQuestionsResult> {
  const questions = questionIds
    .map((id) => questionBankRepo.getQuestion(id))
    .filter((q): q is Question => q !== null)

  if (questions.length === 0) {
    return { ok: false, errorMessage: 'Không tìm thấy câu hỏi nào để rà soát.' }
  }

  // Gom bai hoc lien quan de lam nguon doi chieu kien thuc
  const lessonIds = new Set<string>()
  for (const q of questions) {
    if (q.lessonId) lessonIds.add(q.lessonId)
    else if (q.topicId) {
      for (const lid of lessonsRepo.listLessonIdsUnderTopic(q.topicId)) lessonIds.add(lid)
    }
  }
  const { pieces } = collectLessonContentPieces([...lessonIds])

  const res = await reviewExistingQuestions({
    contentPieces: pieces,
    questions: questions.map(toContent),
    provider
  })
  if (!res.ok || !res.improved) {
    return { ok: false, errorMessage: res.errorMessage ?? 'Rà soát thất bại.' }
  }

  const reviewed: ReviewedQuestion[] = questions.map((q, i) => {
    const original = toContent(q)
    const improved = res.improved![i]
    return { id: q.id, original, improved, changed: isChanged(original, improved) }
  })

  return { ok: true, reviewed }
}
