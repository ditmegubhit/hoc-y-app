import { z } from 'zod'
import {
  runAiJson,
  shouldAutoRefine,
  ollamaGenTuning,
  maybeOllamaEmbedder
} from '../ai/aiClient'
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
import { filterSemanticDuplicates, lexicalSimilarity, type Embedder } from '../quiz/semanticDedup'
import { sanitizeQuestions } from '../ai/sanitizeQuestions'
import { countCompleteQuestions } from '../ai/streamingJsonParser'
import * as quizLearningRepo from '../../db/repositories/quizLearning.repo'
import type { AiProvider } from '../../../shared/types/ai'
import type {
  DraftQuestion,
  QuestionDraftContent,
  LearningExampleInput
} from '../../../shared/types/question'
import type {
  GenerateQuizFromLessonResult,
  QuizGenProgress
} from '../../../shared/types/claudeCli'

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

function claudeToDraft(data: z.infer<typeof structuredOutputSchema>): DraftQuestion[] {
  return data.questions.map((q) => ({
    questionText: q.question,
    options: q.options.map((opt, idx) => ({
      id: String.fromCharCode(97 + idx),
      text: opt.text,
      isCorrect: opt.isCorrect
    })),
    explanation: q.explanation ?? null
  }))
}

export interface GenerateQuizParams {
  subjectTitle: string
  contentPieces: ContentPiece[]
  numQuestions: number
  existingQuestionTexts?: string[]
  provider?: AiProvider
  scope?: { lessonIds?: string[]; topicId?: string | null }
  // "Ollama nhap -> Claude chinh": engine chay luot ra soat & sua sau khi sinh.
  // Mac dinh = provider.
  refineProvider?: AiProvider
  onProgress?: (p: QuizGenProgress) => void
}

// Toi da so LOI GOI sinh (goc + bu) trong 1 lan bam. Ollama moi vong ~3 phut
// tren iGPU nen chan chat - vong 1 da xin du buffer roi. Claude chia lo nho (xem
// CLAUDE_BATCH) nen can nhieu vong hon cho cac de xin nhieu cau.
const MAX_ROUNDS_BY_PROVIDER: Record<AiProvider, number> = { claude: 12, ollama: 3 }

// So cau toi da xin trong MOT loi goi CLI Claude. Xin ca chuc cau/loi goi khien
// 1 loi goi keo dai qua timeout (nguon 120k ky tu + sinh 40+ cau ~3-5 phut) ->
// bi giet, mat trang. Chia lo nho: moi loi goi ~30-60s, loi giua chung van giu
// duoc cac cau da sinh. Noi dung nguon on dinh nen cac loi goi sau dung lai
// prompt-cache, khong ton nhieu token hon.
const CLAUDE_BATCH = 12

// Nguong so trung ngu nghia khi SINH (long hon mac dinh 0.72/0.88): 2 cau cung
// chu de nhung hoi diem kien thuc khac nhau khong bi coi la trung -> khai thac
// duoc nhieu goc hon tu cung mot doan tai lieu. Luot "ra soat" cuoi cung van
// dung nguong chat de bo cau that su trung.
const GEN_DEDUPE = { threshold: 0.8, embedThreshold: 0.91 }

function toContent(q: DraftQuestion): QuestionDraftContent {
  return { questionText: q.questionText, options: q.options, explanation: q.explanation }
}

function normLite(s: string | null): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function contentDiffers(a: QuestionDraftContent, b: QuestionDraftContent): boolean {
  if (normLite(a.questionText) !== normLite(b.questionText)) return true
  if (normLite(a.explanation) !== normLite(b.explanation)) return true
  if (a.options.length !== b.options.length) return true
  return a.options.some(
    (o, i) => normLite(o.text) !== normLite(b.options[i].text) || o.isCorrect !== b.options[i].isCorrect
  )
}

/**
 * Ghep "cau goc (Ollama) -> cau da sua (Claude)" bang do giong nhau tu vung, de
 * luu lam vi du few-shot cho Ollama hoc. Khong can luot ra soat giu dung thu tu
 * (cham hon) - chi can ghep gan dung.
 */
function matchFixPairs(
  before: DraftQuestion[],
  after: DraftQuestion[],
  lessonId: string | null,
  topicId: string | null
): LearningExampleInput[] {
  const pairs: LearningExampleInput[] = []
  for (const a of after) {
    let best: DraftQuestion | null = null
    let bestSim = 0
    for (const b of before) {
      const sim = lexicalSimilarity(a.questionText, b.questionText)
      if (sim > bestSim) {
        bestSim = sim
        best = b
      }
    }
    if (best && bestSim >= 0.5) {
      const b = toContent(best)
      const c = toContent(a)
      if (contentDiffers(b, c)) {
        pairs.push({ kind: 'claude_fix', before: b, after: c, lessonId, topicId })
      }
    }
  }
  return pairs
}

/**
 * Sinh 1 lo cau -> loc hong -> bo trung (chinh xac + ngu nghia) so voi `avoid`.
 * Tra ve cac cau MOI dat chuan cua vong nay.
 */
async function generateOneRound(params: {
  base: GenerateQuizParams
  ask: number
  avoid: string[]
  round: number
  windowSeed: number
  phase: QuizGenProgress['phase']
  embedder: Embedder | undefined
  target: number
  keptSoFar: number
}): Promise<{ fresh: DraftQuestion[]; rawCount: number; truncated: boolean; error?: string }> {
  const { base } = params
  const provider: AiProvider = base.provider ?? 'claude'
  const isOllama = provider === 'ollama'
  const tuning = isOllama ? ollamaGenTuning() : null

  const { prompt, truncated } = buildQuizFromLessonPrompt({
    subjectTitle: base.subjectTitle,
    contentPieces: base.contentPieces,
    numQuestions: params.ask,
    existingQuestions: params.avoid,
    provider,
    maxContentChars: tuning?.maxContentChars,
    // Xoay cua so noi dung theo vong + so cau da co -> nguon dai duoc phu het
    // qua nhieu vong va nhieu lan bam "Soan".
    round: params.round,
    windowSeed: params.windowSeed
  })

  const systemPrompt = isOllama
    ? buildOllamaQuizSystemPrompt(
        buildFewShotBlock({
          lessonIds: base.scope?.lessonIds,
          topicId: base.scope?.topicId ?? null,
          enabled: tuning?.learn ?? false,
          existingQuestions: params.avoid
        })
      )
    : undefined

  base.onProgress?.({
    phase: params.phase,
    round: params.round,
    target: params.target,
    kept: params.keptSoFar
  })

  const result = await runAiJson({
    provider,
    prompt,
    systemPrompt,
    jsonSchema: isOllama ? ollamaQuizJsonSchema : quizFromLessonJsonSchema,
    timeoutMs: isOllama ? 600_000 : 300_000,
    numCtx: tuning?.numCtx,
    onPartial: isOllama
      ? (full): void =>
          base.onProgress?.({
            phase: params.phase,
            round: params.round,
            target: params.target,
            kept: params.keptSoFar,
            streaming: countCompleteQuestions(full)
          })
      : undefined
  })

  if (!result.ok) return { fresh: [], rawCount: 0, truncated, error: result.errorMessage }

  let raw: DraftQuestion[]
  if (isOllama) {
    const parsed = ollamaOutputSchema.safeParse(result.structuredOutput)
    if (!parsed.success) {
      return {
        fresh: [],
        rawCount: 0,
        truncated,
        error: 'Model trên máy trả về dữ liệu không đúng định dạng.'
      }
    }
    raw = ollamaToDraft(parsed.data)
  } else {
    const parsed = structuredOutputSchema.safeParse(result.structuredOutput)
    if (!parsed.success) {
      return {
        fresh: [],
        rawCount: 0,
        truncated,
        error: 'AI trả về dữ liệu không đúng định dạng mong đợi.'
      }
    }
    raw = claudeToDraft(parsed.data)
  }

  const { kept: sane } = sanitizeQuestions(raw)
  const { kept: deduped } = dedupeQuestions(sane, params.avoid)
  const { kept: fresh } = await filterSemanticDuplicates(deduped, params.avoid, {
    embedder: params.embedder,
    ...GEN_DEDUPE
  })
  return { fresh, rawCount: raw.length, truncated }
}

/**
 * Loi tao cau hoi chung. Sinh theo VONG: moi vong bo cau hong/trung roi kiem
 * xem da du `numQuestions` chua; chua du thi sinh bu (dua cac cau da co +
 * cau vua nhan vao danh sach "tranh"). Dung khi du, hoac het vong, hoac 1 vong
 * khong ra them cau moi nao (nguon can).
 */
export async function generateQuizFromContent(
  params: GenerateQuizParams
): Promise<GenerateQuizFromLessonResult> {
  if (params.contentPieces.length === 0) {
    return {
      ok: false,
      errorMessage: 'Chưa có ghi chú hoặc file đính kèm nào có nội dung để tạo câu hỏi.'
    }
  }

  const provider: AiProvider = params.provider ?? 'claude'
  const refineProvider: AiProvider = params.refineProvider ?? provider
  const target = params.numQuestions
  const maxRounds = MAX_ROUNDS_BY_PROVIDER[provider]
  const existing = params.existingQuestionTexts ?? []
  const embedder = await maybeOllamaEmbedder()
  // Bai da co nhieu cau -> bat dau tu cua so noi dung sau hon (uoc ~8 cau/cua so)
  // de bam "Soan" nhieu lan phu dan het tai lieu thay vi lap lai phan dau.
  const windowSeed = Math.floor(existing.length / 8)

  const accepted: DraftQuestion[] = []
  const avoid = [...existing]
  let truncatedAny = false
  let lastError: string | undefined
  let discarded = 0
  let round = 0

  // Vong 1 xin DU them mot it de bu cho cau se bi loai (hong/trung) -> thuong
  // khong phai chay vong "sinh bu" (moi vong Ollama ~3 phut). Ollama cham nen
  // dem it thoi; Claude chia lo CLAUDE_BATCH cau/loi goi de moi loi goi nhanh.
  const perCallCap = provider === 'ollama' ? 16 : CLAUDE_BATCH
  const bufferedFirstAsk =
    provider === 'ollama'
      ? // 7B hay bi cat JSON khi sinh nhieu cau 1 luot -> tran 16.
        Math.min(target + 3, 16)
      : Math.min(target + 3, CLAUDE_BATCH)

  // So vong lien tiep khong ra cau moi nao. Chi coi nguon la "can" khi da thu
  // vai vong (moi vong xoay sang cua so noi dung khac) van khong them duoc gi.
  let emptyStreak = 0

  while (accepted.length < target && round < maxRounds) {
    round += 1
    const need = target - accepted.length
    const ask = round === 1 ? bufferedFirstAsk : Math.min(perCallCap, target, need + 2)

    const res = await generateOneRound({
      base: params,
      ask,
      avoid,
      round,
      windowSeed,
      phase: round === 1 ? 'generating' : 'topping_up',
      embedder,
      target,
      keptSoFar: accepted.length
    })
    truncatedAny ||= res.truncated
    if (res.error) {
      // Loi goi AI: vong dau -> bao loi; vong sau -> dung, giu cai da gom duoc.
      lastError = res.error
      break
    }

    discarded += Math.max(0, res.rawCount - res.fresh.length)
    for (const q of res.fresh) {
      if (accepted.length >= target) break
      accepted.push(q)
      // unshift (khong push): cau VUA sinh trong luot nay uu tien dung dau danh
      // sach "tranh" -> khi prompt cat bot (MAX_EXISTING_BY_PROVIDER), cau vua
      // sinh khong bi cat mat truoc cau cu trong ngan hang.
      avoid.unshift(q.questionText)
    }

    emptyStreak = res.fresh.length === 0 ? emptyStreak + 1 : 0
    // Dung khi: 3 vong lien tiep khong ra cau moi (nguon that su da can) - VOI
    // dieu kien noi dung khong bi cat cua so (neu bi cat, cua so sau co the con
    // nhieu -> chiu kho thu het maxRounds).
    const contentWindowed = res.truncated
    if (emptyStreak >= (contentWindowed ? 4 : 2) && round >= 3) break
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      duplicatesRemoved: discarded,
      errorMessage:
        lastError ??
        (provider === 'ollama'
          ? 'Model trên máy tạo ra câu không hợp lệ. Thử lại, giảm số câu, hoặc dùng Claude.'
          : 'AI tạo ra câu không hợp lệ. Thử lại nhé.')
    }
  }

  // Luot ra soat & sua tren tap da gom.
  let finalQuestions = accepted
  const scopeLessonId = params.scope?.lessonIds?.[0] ?? null
  const scopeTopicId = params.scope?.topicId ?? null

  const cleanAndSet = async (drafts: DraftQuestion[]): Promise<void> => {
    const { kept: rs } = sanitizeQuestions(drafts)
    const { kept: rd } = dedupeQuestions(rs, existing)
    const { kept: rf } = await filterSemanticDuplicates(rd, existing, { embedder, ...GEN_DEDUPE })
    finalQuestions = rf.length > 0 ? rf : accepted
  }

  if (refineProvider === 'claude' || shouldAutoRefine(provider)) {
    // Ra soat & sua theo lo (xem refineGeneratedQuestions). Voi Ollama soan +
    // Claude sua: ghep cap "goc -> da sua" bang do giong nhau tu vung roi luu
    // lam vi du few-shot cho Ollama hoc.
    params.onProgress?.({ phase: 'refining', round, target, kept: accepted.length })
    const refined = await refineGeneratedQuestions({
      subjectTitle: params.subjectTitle,
      contentPieces: params.contentPieces,
      questions: accepted,
      existingQuestionTexts: existing,
      provider: refineProvider,
      scope: params.scope,
      onChunk: (done, total) =>
        params.onProgress?.({
          phase: 'refining',
          round,
          target,
          kept: accepted.length,
          refineDone: done,
          refineTotal: total
        })
    })
    await cleanAndSet(refined)

    if (provider === 'ollama' && refineProvider === 'claude' && refined !== accepted) {
      const pairs = matchFixPairs(accepted, finalQuestions, scopeLessonId, scopeTopicId)
      if (pairs.length > 0) {
        try {
          quizLearningRepo.recordExamples(pairs)
        } catch {
          // loi ghi vi du hoc khong lam hong luong chinh
        }
      }
    }
  }

  // Refine co the da bo bot cau -> sinh bu them vai vong ngan (khong refine tiep).
  if (finalQuestions.length < target) {
    // finalQuestions (da qua refine) truoc, existing sau - cung ly do uu tien
    // o tren.
    const avoid2 = [...finalQuestions.map((q) => q.questionText), ...existing]
    let extraRound = round
    let extraEmptyStreak = 0
    while (finalQuestions.length < target && extraRound < maxRounds) {
      extraRound += 1
      const need = target - finalQuestions.length
      const res = await generateOneRound({
        base: params,
        ask: Math.min(perCallCap, target, need + 2),
        avoid: avoid2,
        round: extraRound,
        windowSeed,
        phase: 'topping_up',
        embedder,
        target,
        keptSoFar: finalQuestions.length
      })
      truncatedAny ||= res.truncated
      if (res.error) break
      for (const q of res.fresh) {
        if (finalQuestions.length >= target) break
        finalQuestions.push(q)
        avoid2.unshift(q.questionText)
      }
      extraEmptyStreak = res.fresh.length === 0 ? extraEmptyStreak + 1 : 0
      if (extraEmptyStreak >= (res.truncated ? 3 : 2)) break
    }
  }

  finalQuestions = finalQuestions.slice(0, target)
  const shortfall = target - finalQuestions.length

  return {
    ok: true,
    questions: finalQuestions,
    truncated: truncatedAny,
    duplicatesRemoved: discarded,
    shortfall: shortfall > 0 ? shortfall : undefined
  }
}

export async function generateQuizFromLessons(params: {
  lessonIds: string[]
  numQuestions: number
  subjectTitle: string
  existingQuestionTexts?: string[]
  provider?: AiProvider
  refineProvider?: AiProvider
  topicId?: string | null
  onProgress?: (p: QuizGenProgress) => void
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
    refineProvider: params.refineProvider,
    scope: { lessonIds: params.lessonIds, topicId: params.topicId ?? null },
    onProgress: params.onProgress
  })
}
