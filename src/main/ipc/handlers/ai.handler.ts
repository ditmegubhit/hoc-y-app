import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import { checkClaudeCliAvailability } from '../../services/claudeCli/checkAvailability'
import { generateQuizFromLesson } from '../../services/claudeCli/generateQuizFromLesson'
import * as questionBankRepo from '../../db/repositories/questionBank.repo'
import * as lessonsRepo from '../../db/repositories/lessons.repo'

const generateSchema = z.object({
  lessonId: z.string(),
  numQuestions: z.number().int().min(1).max(20)
})

const optionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean()
})

const saveDraftSchema = z.object({
  lessonId: z.string(),
  questions: z.array(
    z.object({
      questionText: z.string().min(1),
      options: z.array(optionSchema).min(2),
      explanation: z.string().nullable()
    })
  )
})

const idSchema = z.object({ id: z.string() })
const lessonIdSchema = z.object({ lessonId: z.string() })

export function registerAiHandlers(): void {
  ipcMain.handle(IpcChannels.ai.checkAvailability, () => checkClaudeCliAvailability())

  ipcMain.handle(IpcChannels.ai.generateQuizFromLesson, (_event, payload) => {
    const input = generateSchema.parse(payload)
    return generateQuizFromLesson(input)
  })

  ipcMain.handle(IpcChannels.ai.saveDraftQuestions, (_event, payload) => {
    const input = saveDraftSchema.parse(payload)
    const lesson = lessonsRepo.getLesson(input.lessonId)
    if (!lesson) throw new Error('Không tìm thấy bài học.')
    return questionBankRepo.saveDraftQuestionsFromLesson({
      lessonId: input.lessonId,
      topicId: lesson.topicId,
      questions: input.questions
    })
  })

  ipcMain.handle(IpcChannels.ai.listQuestionsByLesson, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return questionBankRepo.listQuestionsByLesson(lessonId)
  })

  ipcMain.handle(IpcChannels.ai.deleteQuestion, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    questionBankRepo.deleteQuestion(id)
  })
}
