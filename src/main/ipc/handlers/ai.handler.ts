import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import { checkClaudeCliAvailability } from '../../services/claudeCli/checkAvailability'
import { generateQuizFromLesson } from '../../services/claudeCli/generateQuizFromLesson'
import { generateQuizFromLessons } from '../../services/claudeCli/generateQuizFromLessons'
import { reviewQuestionBankEntries } from '../../services/claudeCli/reviewQuestions'
import { checkOllama } from '../../services/ollama/ollamaClient'
import * as questionBankRepo from '../../db/repositories/questionBank.repo'
import * as quizLearningRepo from '../../db/repositories/quizLearning.repo'
import * as lessonsRepo from '../../db/repositories/lessons.repo'
import * as appSettingsRepo from '../../db/repositories/appSettings.repo'

const providerSchema = z.enum(['claude', 'ollama']).default('claude')

const generateSchema = z.object({
  lessonId: z.string(),
  numQuestions: z.number().int().min(1).max(20),
  provider: providerSchema,
  // "Ollama nhap -> Claude chinh": chay luot ra soat & sua bang Claude.
  refineWithClaude: z.boolean().optional(),
  // Khoa pham vi de renderer dinh tuyen event tien do.
  progressKey: z.string().optional()
})

const generateManySchema = z.object({
  lessonIds: z.array(z.string()).min(1),
  numQuestions: z.number().int().min(1).max(50),
  topicId: z.string().nullable().optional(),
  provider: providerSchema,
  refineWithClaude: z.boolean().optional(),
  progressKey: z.string().optional()
})

const aiSettingsSchema = z.object({
  ollamaModel: z.string().min(1).optional(),
  ollamaPath: z.string().optional(),
  ollamaRefineWithClaude: z.boolean().optional(),
  ollamaAutoRefine: z.boolean().optional(),
  ollamaUseLearnedExamples: z.boolean().optional()
})

const optionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean()
})

const saveDraftSchema = z.object({
  questions: z.array(
    z.object({
      questionText: z.string().min(1),
      options: z.array(optionSchema).min(2),
      explanation: z.string().nullable()
    })
  ),
  lessonId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  provider: providerSchema
})

const draftContentSchema = z.object({
  questionText: z.string(),
  options: z.array(optionSchema),
  explanation: z.string().nullable()
})

const recordLearningSchema = z.object({
  examples: z
    .array(
      z.object({
        kind: z.enum(['claude_fix', 'ollama_fixed', 'marked_good']),
        before: draftContentSchema.nullable(),
        after: draftContentSchema,
        lessonId: z.string().nullable(),
        topicId: z.string().nullable(),
        questionId: z.string().optional()
      })
    )
    .min(1)
})

const idSchema = z.object({ id: z.string() })
const lessonIdSchema = z.object({ lessonId: z.string() })
const lessonIdsSchema = z.object({ lessonIds: z.array(z.string()) })
const topicIdSchema = z.object({ topicId: z.string() })

const updateQuestionSchema = z.object({
  id: z.string(),
  questionText: z.string().min(1),
  options: z
    .array(optionSchema)
    .min(2)
    .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
      message: 'Phải có đúng một đáp án đúng.'
    }),
  explanation: z.string().nullable()
})

export function registerAiHandlers(): void {
  ipcMain.handle(IpcChannels.ai.checkAvailability, () => checkClaudeCliAvailability())

  ipcMain.handle(IpcChannels.ai.checkOllama, () => checkOllama())

  ipcMain.handle(IpcChannels.ai.getAiSettings, () => appSettingsRepo.getAiSettings())

  ipcMain.handle(IpcChannels.ai.setAiSettings, (_event, payload) => {
    const patch = aiSettingsSchema.parse(payload)
    return appSettingsRepo.setAiSettings(patch)
  })

  ipcMain.handle(IpcChannels.ai.generateQuizFromLesson, (event, payload) => {
    const input = generateSchema.parse(payload)
    return generateQuizFromLesson({
      lessonId: input.lessonId,
      numQuestions: input.numQuestions,
      provider: input.provider,
      refineProvider: input.refineWithClaude ? 'claude' : undefined,
      onProgress: (p) => {
        if (!event.sender.isDestroyed())
          event.sender.send(IpcChannels.ai.generateProgress, { ...p, key: input.progressKey })
      }
    })
  })

  ipcMain.handle(IpcChannels.ai.generateQuizFromLessons, (event, payload) => {
    const input = generateManySchema.parse(payload)
    const titles = input.lessonIds
      .map((id) => lessonsRepo.getLesson(id)?.title)
      .filter((t): t is string => Boolean(t))
    const subjectTitle =
      titles.length === 1 ? `bài học "${titles[0]}"` : `${input.lessonIds.length} bài học đã chọn`

    // Cau da co (theo pham vi) de tranh trung: uu tien toan bo cau duoi chu de
    // neu co topicId, khong thi lay theo cac bai da chon.
    const existingQuestionTexts = (
      input.topicId
        ? questionBankRepo.listQuestionsUnderTopic(input.topicId)
        : questionBankRepo.listQuestionsByLessonIds(input.lessonIds)
    ).map((q) => q.questionText)

    return generateQuizFromLessons({
      lessonIds: input.lessonIds,
      numQuestions: input.numQuestions,
      subjectTitle,
      existingQuestionTexts,
      provider: input.provider,
      refineProvider: input.refineWithClaude ? 'claude' : undefined,
      topicId: input.topicId ?? null,
      onProgress: (p) => {
        if (!event.sender.isDestroyed())
          event.sender.send(IpcChannels.ai.generateProgress, { ...p, key: input.progressKey })
      }
    })
  })

  ipcMain.handle(IpcChannels.ai.saveDraftQuestions, (_event, payload) => {
    const input = saveDraftSchema.parse(payload)

    let lessonId = input.lessonId ?? null
    let topicId = input.topicId ?? null

    if (lessonId) {
      const lesson = lessonsRepo.getLesson(lessonId)
      if (!lesson) throw new Error('Không tìm thấy bài học.')
      topicId = lesson.topicId
    } else if (!topicId) {
      throw new Error('Thiếu bài học hoặc chủ đề để lưu câu hỏi.')
    } else {
      lessonId = null
    }

    return questionBankRepo.saveDraftQuestions({
      questions: input.questions,
      source: 'ai_generated_from_lesson',
      generator: input.provider,
      lessonId,
      topicId
    })
  })

  ipcMain.handle(IpcChannels.ai.recordLearningExamples, (_event, payload) => {
    const { examples } = recordLearningSchema.parse(payload)
    quizLearningRepo.recordExamples(examples)
    for (const ex of examples) {
      if (ex.kind === 'marked_good' && ex.questionId) {
        questionBankRepo.setMarkedGood(ex.questionId, true)
      }
    }
  })

  ipcMain.handle(IpcChannels.ai.listQuestionsByLesson, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return questionBankRepo.listQuestionsByLesson(lessonId)
  })

  ipcMain.handle(IpcChannels.ai.listQuestionsByLessonIds, (_event, payload) => {
    const { lessonIds } = lessonIdsSchema.parse(payload)
    return questionBankRepo.listQuestionsByLessonIds(lessonIds)
  })

  ipcMain.handle(IpcChannels.ai.listQuestionsByTopic, (_event, payload) => {
    const { topicId } = topicIdSchema.parse(payload)
    return questionBankRepo.listQuestionsByTopic(topicId)
  })

  ipcMain.handle(IpcChannels.ai.listQuestionsUnderTopic, (_event, payload) => {
    const { topicId } = topicIdSchema.parse(payload)
    return questionBankRepo.listQuestionsUnderTopic(topicId)
  })

  ipcMain.handle(IpcChannels.ai.updateQuestion, (_event, payload) => {
    const input = updateQuestionSchema.parse(payload)
    return questionBankRepo.updateQuestion(input)
  })

  ipcMain.handle(IpcChannels.ai.reviewQuestions, async (_event, payload) => {
    const { questionIds, provider } = z
      .object({ questionIds: z.array(z.string()).min(1), provider: providerSchema })
      .parse(payload)
    const res = await reviewQuestionBankEntries(questionIds, provider)
    if (!res.ok || !res.reviewed) throw new Error(res.errorMessage ?? 'Rà soát thất bại.')
    return res.reviewed
  })

  ipcMain.handle(IpcChannels.ai.deleteQuestion, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    questionBankRepo.deleteQuestion(id)
  })
}
