import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as quizRepo from '../../db/repositories/quiz.repo'

const lessonIdSchema = z.object({ lessonId: z.string() })
const topicIdSchema = z.object({ topicId: z.string() })
const attemptIdSchema = z.object({ attemptId: z.string() })

const topicPlayableSchema = z.object({
  topicId: z.string(),
  lessonIds: z.array(z.string())
})

const createQuizSchema = z.object({
  scopeType: z.enum(['lesson', 'topic']),
  lessonId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  lessonIds: z.array(z.string()),
  feedbackMode: z.enum(['practice', 'exam']),
  questionIds: z.array(z.string()).min(1),
  title: z.string().min(1)
})

const submitAttemptSchema = z.object({
  quizId: z.string(),
  feedbackMode: z.enum(['practice', 'exam']),
  answers: z.array(
    z.object({
      quizQuestionId: z.string(),
      selectedOptionId: z.string().nullable()
    })
  )
})

export function registerQuizHandlers(): void {
  ipcMain.handle(IpcChannels.quiz.listPlayableForLesson, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return quizRepo.listPlayableQuestionsForLesson(lessonId)
  })

  ipcMain.handle(IpcChannels.quiz.listPlayableForTopic, (_event, payload) => {
    const { topicId, lessonIds } = topicPlayableSchema.parse(payload)
    return quizRepo.listPlayableQuestionsForTopic(lessonIds, topicId)
  })

  ipcMain.handle(IpcChannels.quiz.create, (_event, payload) => {
    const input = createQuizSchema.parse(payload)
    return quizRepo.createQuiz(input)
  })

  ipcMain.handle(IpcChannels.quiz.submitAttempt, (_event, payload) => {
    const input = submitAttemptSchema.parse(payload)
    return quizRepo.submitAttempt(input)
  })

  ipcMain.handle(IpcChannels.quiz.listAttemptsByLesson, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return quizRepo.listAttemptsByLesson(lessonId)
  })

  ipcMain.handle(IpcChannels.quiz.listAttemptsByTopic, (_event, payload) => {
    const { topicId } = topicIdSchema.parse(payload)
    return quizRepo.listAttemptsByTopic(topicId)
  })

  ipcMain.handle(IpcChannels.quiz.getAttemptReview, (_event, payload) => {
    const { attemptId } = attemptIdSchema.parse(payload)
    return quizRepo.getAttemptReview(attemptId)
  })

  ipcMain.handle(IpcChannels.quiz.deleteAttempt, (_event, payload) => {
    const { attemptId } = attemptIdSchema.parse(payload)
    quizRepo.deleteAttempt(attemptId)
  })
}
