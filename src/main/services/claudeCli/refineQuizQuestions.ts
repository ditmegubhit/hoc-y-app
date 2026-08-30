import { z } from 'zod'
import { runClaudeHeadless } from './claudeCliClient'
import { quizFromLessonJsonSchema } from './promptTemplates/quizFromLesson.prompt'
import { buildRefinePrompt, buildReviewPrompt } from './promptTemplates/quizQuality.prompt'
import type { ContentPiece } from './lessonContent'
import type { DraftQuestion, QuestionOption } from '../../../shared/types/question'

const outSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).min(2),
      explanation: z.string().optional()
    })
  )
})

type PlainQuestion = {
  questionText: string
  options: QuestionOption[]
  explanation: string | null
}

function toDraft(q: z.infer<typeof outSchema>['questions'][number]): DraftQuestion {
  return {
    questionText: q.question,
    // Refiner co the doi thu tu option -> gan lai id a/b/c/d theo vi tri moi
    options: q.options.map((opt, idx) => ({
      id: String.fromCharCode(97 + idx),
      text: opt.text,
      isCorrect: opt.isCorrect
    })),
    explanation: q.explanation?.trim() ? q.explanation.trim() : null
  }
}

function hasExactlyOneCorrect(q: DraftQuestion): boolean {
  return q.options.filter((o) => o.isCorrect).length === 1
}

/**
 * Luot "ra soat & sua" cho cau VUA SINH. Khong bao gio nem loi - that bai thi
 * tra lai `questions` nguyen ban (khong lam mat cau da sinh).
 */
export async function refineGeneratedQuestions(params: {
  subjectTitle: string
  contentPieces: ContentPiece[]
  questions: PlainQuestion[]
  existingQuestionTexts?: string[]
}): Promise<DraftQuestion[]> {
  if (params.questions.length === 0) return []

  try {
    const result = await runClaudeHeadless({
      prompt: buildRefinePrompt({
        subjectTitle: params.subjectTitle,
        contentPieces: params.contentPieces,
        questions: params.questions,
        existingQuestions: params.existingQuestionTexts
      }),
      jsonSchema: quizFromLessonJsonSchema,
      timeoutMs: 180_000
    })
    if (!result.ok) return params.questions
    const parsed = outSchema.safeParse(result.structuredOutput)
    if (!parsed.success || parsed.data.questions.length === 0) return params.questions

    const refined = parsed.data.questions.map(toDraft).filter(hasExactlyOneCorrect)
    return refined.length > 0 ? refined : params.questions
  } catch {
    return params.questions
  }
}

export interface ReviewExistingResult {
  ok: boolean
  improved?: PlainQuestion[] // dung so luong + thu tu voi dau vao
  errorMessage?: string
}

/**
 * Luot "Ra soat & cai tien" cho cau DA LUU. PHAI khop so luong + thu tu de map
 * lai theo id goc.
 */
export async function reviewExistingQuestions(params: {
  contentPieces: ContentPiece[]
  questions: PlainQuestion[]
}): Promise<ReviewExistingResult> {
  if (params.questions.length === 0) return { ok: true, improved: [] }

  const result = await runClaudeHeadless({
    prompt: buildReviewPrompt({
      contentPieces: params.contentPieces,
      questions: params.questions
    }),
    jsonSchema: quizFromLessonJsonSchema,
    timeoutMs: 240_000
  })
  if (!result.ok) {
    return { ok: false, errorMessage: result.errorMessage ?? 'Không gọi được Claude.' }
  }
  const parsed = outSchema.safeParse(result.structuredOutput)
  if (!parsed.success) {
    return { ok: false, errorMessage: 'Claude trả về dữ liệu không đúng định dạng.' }
  }
  if (parsed.data.questions.length !== params.questions.length) {
    return {
      ok: false,
      errorMessage: `AI trả về ${parsed.data.questions.length} câu (cần đúng ${params.questions.length}). Thử lại, hoặc rà soát ít câu hơn một lần.`
    }
  }

  const improved = parsed.data.questions.map(toDraft)
  if (!improved.every(hasExactlyOneCorrect)) {
    return { ok: false, errorMessage: 'AI trả về câu không có đúng một đáp án đúng. Thử lại.' }
  }
  return { ok: true, improved }
}
