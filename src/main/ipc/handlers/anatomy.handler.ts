import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as candidatesRepo from '../../db/repositories/anatomyCandidates.repo'
import * as anatomyQuizRepo from '../../db/repositories/anatomyQuiz.repo'
import { detectLabelsForPage } from '../../services/anatomy/detectPage'
import { getPageCount } from '../../services/attachmentView.service'

const attachmentPageSchema = z.object({
  attachmentId: z.string(),
  pageNumber: z.number().int().positive()
})

const rectSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number()
})

const updateCandidateSchema = z.object({
  candidateId: z.string(),
  rawText: z.string().optional(),
  labelBox: rectSchema.optional()
})

const candidateIdSchema = z.object({ candidateId: z.string() })

const createManualCandidateSchema = z.object({
  attachmentId: z.string(),
  pageNumber: z.number().int().positive(),
  rawText: z.string(),
  labelBox: rectSchema,
  refWidth: z.number(),
  refHeight: z.number()
})

const confirmCandidateSchema = z.object({
  candidateId: z.string(),
  lessonId: z.string(),
  answerText: z.string().min(1),
  acceptedAlternates: z.array(z.string())
})

const updateQuestionAnswerSchema = z.object({
  candidateId: z.string(),
  answerText: z.string().min(1),
  acceptedAlternates: z.array(z.string())
})

const attachmentIdSchema = z.object({ attachmentId: z.string() })

const checkAnswerSchema = z.object({
  questionId: z.string(),
  submittedText: z.string()
})

const startAttemptSchema = z.object({
  attachmentId: z.string(),
  feedbackMode: z.enum(['practice', 'exam']),
  questionCount: z.number().int().positive()
})

const submitAttemptSchema = z.object({
  attemptId: z.string(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      submittedText: z.string()
    })
  )
})

const attemptIdSchema = z.object({ attemptId: z.string() })

export function registerAnatomyHandlers(): void {
  ipcMain.handle(IpcChannels.anatomy.detectPage, async (_event, payload) => {
    const { attachmentId, pageNumber } = attachmentPageSchema.parse(payload)
    await detectLabelsForPage(attachmentId, pageNumber)
    return candidatesRepo.listCandidatesForPage(attachmentId, pageNumber)
  })

  // Do truoc toan bo tai lieu (chi de xac dinh VI TRI vung chu can che, khong
  // quan tam OCR doc dung chu gi) - dung khi nguoi soan muon co san vung o
  // moi trang truoc, roi tu dien dap an sau, khong can cho "Dang do trang..."
  // moi trang trong luc dien.
  ipcMain.handle(IpcChannels.anatomy.detectAllPages, async (event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    const totalPages = await getPageCount(attachmentId)
    if (!totalPages) return { totalPages: 0 }
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      await detectLabelsForPage(attachmentId, pageNumber)
      if (!event.sender.isDestroyed()) {
        event.sender.send(IpcChannels.anatomy.detectAllPagesProgress, { pageNumber, totalPages })
      }
    }
    return { totalPages }
  })

  ipcMain.handle(IpcChannels.anatomy.listCandidatesForPage, (_event, payload) => {
    const { attachmentId, pageNumber } = attachmentPageSchema.parse(payload)
    return candidatesRepo.listCandidatesForPage(attachmentId, pageNumber)
  })

  ipcMain.handle(IpcChannels.anatomy.updateCandidate, (_event, payload) => {
    const input = updateCandidateSchema.parse(payload)
    candidatesRepo.updateCandidate(input)
  })

  ipcMain.handle(IpcChannels.anatomy.createManualCandidate, (_event, payload) => {
    const input = createManualCandidateSchema.parse(payload)
    return candidatesRepo.createManualCandidate(input)
  })

  ipcMain.handle(IpcChannels.anatomy.confirmCandidate, (_event, payload) => {
    const input = confirmCandidateSchema.parse(payload)
    return anatomyQuizRepo.confirmCandidate(input)
  })

  // Xoa cau hoi lien ket TRUOC (neu co) roi moi chuyen candidate sang
  // 'rejected' - dung chung duoc cho ca "Bo qua vung" (dang pending, khong co
  // gi de xoa) va "un-confirm" (dang co dap an, xoa luon cau hoi da luu).
  ipcMain.handle(IpcChannels.anatomy.rejectCandidate, (_event, payload) => {
    const { candidateId } = candidateIdSchema.parse(payload)
    anatomyQuizRepo.deleteQuestionByCandidateId(candidateId)
    candidatesRepo.setCandidateStatus(candidateId, 'rejected')
  })

  ipcMain.handle(IpcChannels.anatomy.updateQuestionAnswer, (_event, payload) => {
    const input = updateQuestionAnswerSchema.parse(payload)
    anatomyQuizRepo.updateQuestionAnswer(input)
  })

  // Xoa han (khac rejectCandidate) - dung trong man "Sua vung" de go bo 1 o
  // ve sai/du/gop nham, tranh de lai hang rac de mask den chong len o khac.
  ipcMain.handle(IpcChannels.anatomy.deleteCandidate, (_event, payload) => {
    const { candidateId } = candidateIdSchema.parse(payload)
    anatomyQuizRepo.deleteQuestionByCandidateId(candidateId)
    candidatesRepo.deleteCandidate(candidateId)
  })

  ipcMain.handle(IpcChannels.anatomy.countConfirmedForAttachment, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return anatomyQuizRepo.countConfirmedForAttachment(attachmentId)
  })

  ipcMain.handle(IpcChannels.anatomy.checkAnswer, (_event, payload) => {
    const { questionId, submittedText } = checkAnswerSchema.parse(payload)
    return anatomyQuizRepo.checkAnswer(questionId, submittedText)
  })

  ipcMain.handle(IpcChannels.anatomy.startAttempt, (_event, payload) => {
    const input = startAttemptSchema.parse(payload)
    return anatomyQuizRepo.startAttempt(input)
  })

  ipcMain.handle(IpcChannels.anatomy.submitAttempt, (_event, payload) => {
    const input = submitAttemptSchema.parse(payload)
    return anatomyQuizRepo.submitAttempt(input)
  })

  ipcMain.handle(IpcChannels.anatomy.getAttemptReview, (_event, payload) => {
    const { attemptId } = attemptIdSchema.parse(payload)
    return anatomyQuizRepo.getAttemptReview(attemptId)
  })
}
