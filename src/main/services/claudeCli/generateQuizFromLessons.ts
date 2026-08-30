import { z } from 'zod'
import { runClaudeHeadless } from './claudeCliClient'
import {
  buildQuizFromLessonPrompt,
  quizFromLessonJsonSchema
} from './promptTemplates/quizFromLesson.prompt'
import { collectLessonContentPieces, type ContentPiece } from './lessonContent'
import { refineGeneratedQuestions } from './refineQuizQuestions'
import { dedupeQuestions } from '../quiz/dedup'
import type { DraftQuestion } from '../../../shared/types/question'
import type { GenerateQuizFromLessonResult } from '../../../shared/types/claudeCli'

const structuredOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).min(2),
      explanation: z.string().optional()
    })
  )
})

// Loi tao cau hoi chung cho ca 2 duong (1 bai hoc / nhieu bai hoc).
// `existingQuestionTexts`: cac cau da co trong ngan hang (theo pham vi) - dua vao
// prompt de AI tranh, va loc lai output cho chac.
export async function generateQuizFromContent(params: {
  subjectTitle: string
  contentPieces: ContentPiece[]
  numQuestions: number
  existingQuestionTexts?: string[]
}): Promise<GenerateQuizFromLessonResult> {
  if (params.contentPieces.length === 0) {
    return {
      ok: false,
      errorMessage: 'Chưa có ghi chú hoặc file đính kèm nào có nội dung để tạo câu hỏi.'
    }
  }

  const { prompt, truncated } = buildQuizFromLessonPrompt({
    subjectTitle: params.subjectTitle,
    contentPieces: params.contentPieces,
    numQuestions: params.numQuestions,
    existingQuestions: params.existingQuestionTexts
  })

  const result = await runClaudeHeadless({
    prompt,
    jsonSchema: quizFromLessonJsonSchema,
    timeoutMs: 180_000
  })

  if (!result.ok) {
    return { ok: false, errorMessage: result.errorMessage }
  }

  const parsed = structuredOutputSchema.safeParse(result.structuredOutput)
  if (!parsed.success) {
    return { ok: false, errorMessage: 'Claude trả về dữ liệu không đúng định dạng mong đợi.' }
  }

  const rawQuestions: DraftQuestion[] = parsed.data.questions.map((q) => ({
    questionText: q.question,
    options: q.options.map((opt, idx) => ({
      id: String.fromCharCode(97 + idx),
      text: opt.text,
      isCorrect: opt.isCorrect
    })),
    explanation: q.explanation ?? null
  }))

  // Luot 2: ra soat & sua chat luong (chinh xac kien thuc, phuong an nhieu, can
  // bang A/B/C/D, vi tri dap an dung...). That bai thi giu nguyen ban dau.
  const refined = await refineGeneratedQuestions({
    subjectTitle: params.subjectTitle,
    contentPieces: params.contentPieces,
    questions: rawQuestions,
    existingQuestionTexts: params.existingQuestionTexts
  })

  const { kept, removed } = dedupeQuestions(refined, params.existingQuestionTexts ?? [])

  if (kept.length === 0) {
    return {
      ok: false,
      duplicatesRemoved: removed,
      errorMessage:
        'Các câu AI vừa tạo đều trùng với ngân hàng câu hỏi hiện có. Thử lại (lần sau thường khác), hoặc bổ sung thêm ghi chú/tài liệu.'
    }
  }

  return { ok: true, questions: kept, truncated, duplicatesRemoved: removed }
}

export async function generateQuizFromLessons(params: {
  lessonIds: string[]
  numQuestions: number
  subjectTitle: string
  existingQuestionTexts?: string[]
}): Promise<GenerateQuizFromLessonResult> {
  const { pieces } = collectLessonContentPieces(params.lessonIds)
  if (pieces.length === 0) {
    return {
      ok: false,
      errorMessage: 'Các bài học đã chọn chưa có nội dung để tạo câu hỏi.'
    }
  }

  return generateQuizFromContent({
    subjectTitle: params.subjectTitle,
    contentPieces: pieces,
    numQuestions: params.numQuestions,
    existingQuestionTexts: params.existingQuestionTexts
  })
}
