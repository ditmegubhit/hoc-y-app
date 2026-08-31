import { z } from 'zod'
import { runAiJson, shouldAutoRefine, ollamaGenTuning } from '../ai/aiClient'
import { buildFewShotBlock } from '../ai/fewShotExamples'
import {
  buildQuizFromLessonPrompt,
  quizFromLessonJsonSchema,
  ollamaQuizJsonSchema
} from './promptTemplates/quizFromLesson.prompt'
import { buildOllamaQuizSystemPrompt } from './promptTemplates/quizQuality.prompt'
import { collectLessonContentPieces, type ContentPiece } from './lessonContent'
import { refineGeneratedQuestions } from './refineQuizQuestions'
import { dedupeQuestions } from '../quiz/dedup'
import { sanitizeQuestions } from '../ai/sanitizeQuestions'
import type { AiProvider } from '../../../shared/types/ai'
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

// Ollama tra ve dang gon: options = mang chuoi, correct = chi so.
const ollamaOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
      correct: z.number().int().min(0),
      explanation: z.string().optional()
    })
  )
})

function ollamaToDraft(data: z.infer<typeof ollamaOutputSchema>): DraftQuestion[] {
  return data.questions.map((q) => ({
    questionText: q.question,
    options: q.options.map((text, idx) => ({
      id: String.fromCharCode(97 + idx),
      text,
      isCorrect: idx === q.correct
    })),
    explanation: q.explanation ?? null
  }))
}

// Loi tao cau hoi chung cho ca 2 duong (1 bai hoc / nhieu bai hoc).
// `existingQuestionTexts`: cac cau da co trong ngan hang (theo pham vi) - dua vao
// prompt de AI tranh, va loc lai output cho chac.
export async function generateQuizFromContent(params: {
  subjectTitle: string
  contentPieces: ContentPiece[]
  numQuestions: number
  existingQuestionTexts?: string[]
  provider?: AiProvider
  scope?: { lessonIds?: string[]; topicId?: string | null }
}): Promise<GenerateQuizFromLessonResult> {
  if (params.contentPieces.length === 0) {
    return {
      ok: false,
      errorMessage: 'Chưa có ghi chú hoặc file đính kèm nào có nội dung để tạo câu hỏi.'
    }
  }

  const provider: AiProvider = params.provider ?? 'claude'
  const isOllama = provider === 'ollama'
  const tuning = isOllama ? ollamaGenTuning() : null

  const { prompt, truncated } = buildQuizFromLessonPrompt({
    subjectTitle: params.subjectTitle,
    contentPieces: params.contentPieces,
    numQuestions: params.numQuestions,
    existingQuestions: params.existingQuestionTexts,
    provider,
    maxContentChars: tuning?.maxContentChars
  })

  const systemPrompt = isOllama
    ? buildOllamaQuizSystemPrompt(
        buildFewShotBlock({
          lessonIds: params.scope?.lessonIds,
          topicId: params.scope?.topicId ?? null,
          enabled: tuning?.learn ?? false,
          existingQuestions: params.existingQuestionTexts
        })
      )
    : undefined

  const result = await runAiJson({
    provider,
    prompt,
    systemPrompt,
    jsonSchema: isOllama ? ollamaQuizJsonSchema : quizFromLessonJsonSchema,
    timeoutMs: isOllama ? 600_000 : 180_000,
    numCtx: tuning?.numCtx
  })

  if (!result.ok) {
    return { ok: false, errorMessage: result.errorMessage }
  }

  let rawQuestions: DraftQuestion[]
  if (isOllama) {
    const parsed = ollamaOutputSchema.safeParse(result.structuredOutput)
    if (!parsed.success) {
      return { ok: false, errorMessage: 'Model trên máy trả về dữ liệu không đúng định dạng.' }
    }
    rawQuestions = ollamaToDraft(parsed.data)
  } else {
    const parsed = structuredOutputSchema.safeParse(result.structuredOutput)
    if (!parsed.success) {
      return { ok: false, errorMessage: 'AI trả về dữ liệu không đúng định dạng mong đợi.' }
    }
    rawQuestions = parsed.data.questions.map((q) => ({
      questionText: q.question,
      options: q.options.map((opt, idx) => ({
        id: String.fromCharCode(97 + idx),
        text: opt.text,
        isCorrect: opt.isCorrect
      })),
      explanation: q.explanation ?? null
    }))
  }

  // Loc bo cau hong ro rang (0/>1 dap an dung, phuong an trung, ...) - hay gap
  // voi model nho.
  const { kept: sane } = sanitizeQuestions(rawQuestions)
  if (sane.length === 0) {
    return {
      ok: false,
      errorMessage:
        provider === 'ollama'
          ? 'Model trên máy tạo ra câu không hợp lệ. Thử lại, giảm số câu, hoặc dùng Claude.'
          : 'AI tạo ra câu không hợp lệ. Thử lại nhé.'
    }
  }

  // Luot 2: ra soat & sua chat luong. Voi Ollama mac dinh TAT (cham) - bat qua
  // Cai dat. That bai thi giu nguyen ban dau.
  const refined = shouldAutoRefine(provider)
    ? await refineGeneratedQuestions({
        subjectTitle: params.subjectTitle,
        contentPieces: params.contentPieces,
        questions: sane,
        existingQuestionTexts: params.existingQuestionTexts,
        provider
      })
    : sane

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
  provider?: AiProvider
  topicId?: string | null
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
    existingQuestionTexts: params.existingQuestionTexts,
    provider: params.provider,
    scope: { lessonIds: params.lessonIds, topicId: params.topicId ?? null }
  })
}
