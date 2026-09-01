import { generateQuizFromContent } from './generateQuizFromLessons'
import { collectLessonContentPieces } from './lessonContent'
import * as lessonsRepo from '../../db/repositories/lessons.repo'
import * as questionBankRepo from '../../db/repositories/questionBank.repo'
import type { AiProvider } from '../../../shared/types/ai'
import type {
  GenerateQuizFromLessonResult,
  QuizGenProgress
} from '../../../shared/types/claudeCli'

export async function generateQuizFromLesson(params: {
  lessonId: string
  numQuestions: number
  provider?: AiProvider
  refineProvider?: AiProvider
  onProgress?: (p: QuizGenProgress) => void
}): Promise<GenerateQuizFromLessonResult> {
  const lesson = lessonsRepo.getLesson(params.lessonId)
  if (!lesson) return { ok: false, errorMessage: 'Không tìm thấy bài học.' }

  const { pieces } = collectLessonContentPieces([params.lessonId])
  if (pieces.length === 0) {
    return {
      ok: false,
      errorMessage: 'Bài học chưa có ghi chú hoặc file đính kèm nào có nội dung để tạo câu hỏi.'
    }
  }

  const existingQuestionTexts = questionBankRepo
    .listQuestionsByLesson(params.lessonId)
    .map((q) => q.questionText)

  return generateQuizFromContent({
    subjectTitle: `bài học "${lesson.title}"`,
    contentPieces: pieces,
    numQuestions: params.numQuestions,
    existingQuestionTexts,
    provider: params.provider,
    refineProvider: params.refineProvider,
    scope: { lessonIds: [params.lessonId] },
    onProgress: params.onProgress
  })
}
