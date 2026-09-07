import { z } from 'zod'
import { runAiJson } from '../ai/aiClient'
import { buildFixExamplesBlock } from '../ai/fewShotExamples'
import { quizFromLessonJsonSchema } from './promptTemplates/quizFromLesson.prompt'
import { buildRefinePrompt, buildReviewPrompt } from './promptTemplates/quizQuality.prompt'
import type { ContentPiece } from './lessonContent'
import type { AiProvider } from '../../../shared/types/ai'
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

// Chia lo cho luot rasoat sau khi sinh: nhoi ca chuc cau + toan bo nguon vao 1
// loi goi Claude de vuot timeout (giong luot sinh). Lo nho ~8 cau: moi loi goi
// nhanh, nguon on dinh nen dung lai prompt-cache. Lo hong -> giu nguyen lo do.
const REFINE_CHUNK_BY_PROVIDER: Record<AiProvider, number> = { claude: 8, ollama: 99 }

async function refineOneBatch(params: {
  subjectTitle: string
  contentPieces: ContentPiece[]
  questions: PlainQuestion[]
  existingQuestionTexts?: string[]
  provider: AiProvider
  fixExamplesBlock: string | null
}): Promise<DraftQuestion[] | null> {
  try {
    const result = await runAiJson({
      provider: params.provider,
      prompt: buildRefinePrompt({
        subjectTitle: params.subjectTitle,
        contentPieces: params.contentPieces,
        questions: params.questions,
        existingQuestions: params.existingQuestionTexts,
        provider: params.provider,
        fixExamplesBlock: params.fixExamplesBlock
      }),
      jsonSchema: quizFromLessonJsonSchema,
      timeoutMs: params.provider === 'ollama' ? 600_000 : 240_000
    })
    if (!result.ok) return null
    const parsed = outSchema.safeParse(result.structuredOutput)
    if (!parsed.success || parsed.data.questions.length === 0) return null

    const refined = parsed.data.questions.map(toDraft).filter(hasExactlyOneCorrect)
    return refined.length > 0 ? refined : null
  } catch {
    return null
  }
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
  provider?: AiProvider
  scope?: { lessonIds?: string[]; topicId?: string | null }
  // Bao tien do sau moi lo da ra soat xong (de UI hien phan tram).
  onChunk?: (done: number, total: number) => void
}): Promise<DraftQuestion[]> {
  if (params.questions.length === 0) return []

  const provider: AiProvider = params.provider ?? 'claude'
  // Cap "chua dat -> da sua" chi day vao prompt Ollama (Claude tu biet cach sua,
  // them vao chi ton token). Khoi nay giup 7B hoc kieu chinh.
  const fixExamplesBlock =
    provider === 'ollama'
      ? buildFixExamplesBlock({
          lessonIds: params.scope?.lessonIds,
          topicId: params.scope?.topicId ?? null,
          limit: 2
        })
      : null

  const groups = chunk(params.questions, REFINE_CHUNK_BY_PROVIDER[provider])
  const out: DraftQuestion[] = []
  let anyOk = false
  for (let i = 0; i < groups.length; i++) {
    const refined = await refineOneBatch({
      subjectTitle: params.subjectTitle,
      contentPieces: params.contentPieces,
      questions: groups[i],
      existingQuestionTexts: params.existingQuestionTexts,
      provider,
      fixExamplesBlock
    })
    if (refined) {
      anyOk = true
      out.push(...refined)
    } else {
      out.push(...groups[i]) // lo nay hong -> giu nguyen cau da sinh
    }
    params.onChunk?.(i + 1, groups.length)
  }
  return anyOk ? out : params.questions
}

export interface ReviewExistingResult {
  ok: boolean
  improved?: PlainQuestion[] // dung so luong + thu tu voi dau vao
  errorMessage?: string
}

// Ra soat theo lo nho: 1 loi goi AI xu ly ca chuc cau + toan bo nguon vua cham
// (co the qua thoi gian cho) vua de sai so luong. Chia lo giup moi loi goi nho,
// nhanh, de khop; lo nao hong thi giu nguyen cac cau trong lo do.
const REVIEW_CHUNK_BY_PROVIDER: Record<AiProvider, number> = {
  claude: 6,
  ollama: 3
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function reviewOneChunk(
  questions: PlainQuestion[],
  contentPieces: ContentPiece[],
  provider: AiProvider
): Promise<{ improved: PlainQuestion[] } | { error: string }> {
  try {
    const result = await runAiJson({
      provider,
      prompt: buildReviewPrompt({ contentPieces, questions, provider }),
      jsonSchema: quizFromLessonJsonSchema,
      timeoutMs: provider === 'ollama' ? 300_000 : 240_000
    })
    if (!result.ok) return { error: result.errorMessage ?? 'Không gọi được AI.' }

    const parsed = outSchema.safeParse(result.structuredOutput)
    if (!parsed.success) return { error: 'AI trả về dữ liệu không đúng định dạng.' }
    if (parsed.data.questions.length !== questions.length) {
      return { error: 'AI trả về sai số câu.' }
    }
    const improved = parsed.data.questions.map(toDraft)
    if (!improved.every(hasExactlyOneCorrect)) {
      return { error: 'AI trả về câu không có đúng một đáp án đúng.' }
    }
    return { improved }
  } catch {
    return { error: 'Lỗi khi gọi AI.' }
  }
}

/**
 * Luot "Ra soat & cai tien" cho cau DA LUU. PHAI khop so luong + thu tu de map
 * lai theo id goc. Chia lo; lo hong -> giu nguyen cau lo do (khong lam hong ca me).
 */
export async function reviewExistingQuestions(params: {
  contentPieces: ContentPiece[]
  questions: PlainQuestion[]
  provider?: AiProvider
}): Promise<ReviewExistingResult> {
  if (params.questions.length === 0) return { ok: true, improved: [] }

  const provider: AiProvider = params.provider ?? 'claude'
  const groups = chunk(params.questions, REVIEW_CHUNK_BY_PROVIDER[provider])

  const improved: PlainQuestion[] = []
  let okCount = 0
  let lastError = ''

  for (const group of groups) {
    const res = await reviewOneChunk(group, params.contentPieces, provider)
    if ('improved' in res) {
      improved.push(...res.improved)
      okCount += 1
    } else {
      improved.push(...group) // giu nguyen lo nay
      lastError = res.error
    }
  }

  if (okCount === 0) {
    return {
      ok: false,
      errorMessage: `Rà soát thất bại: ${lastError || 'không gọi được AI'}. Thử lại nhé.`
    }
  }
  return { ok: true, improved }
}
