import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as candidatesRepo from '../../db/repositories/anatomyCandidates.repo'
import * as anatomyQuizRepo from '../../db/repositories/anatomyQuiz.repo'
import { detectLabelsForPage } from '../../services/anatomy/detectPage'
import { getPageCount } from '../../services/attachmentView.service'
import { getDb } from '../../db'
import { analyzeAnatomyEligibility } from '../../services/anatomy/eligibility'
import * as anatomyEligibilityRepo from '../../db/repositories/anatomyEligibility.repo'
import { readCandidateWithAi } from '../../services/anatomy/readLabelWithAi'

const cancelledScans = new Set<string>()

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
  labelBox: rectSchema.optional(),
  cropBox: rectSchema.nullable().optional()
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
const detectAllPagesSchema = attachmentIdSchema.extend({ force: z.boolean().optional() })

const checkAnswerSchema = z.object({
  questionId: z.string(),
  submittedText: z.string()
})

const startAttemptSchema = z.object({
  stationSetId: z.string()
})

const stationSetSchema = z.object({
  attachmentId: z.string(),
  feedbackMode: z.enum(['practice', 'exam']),
  timeLimitSeconds: z.number().int().min(0).max(300),
  questionIds: z.array(z.string()).min(1)
}).refine((value) => value.feedbackMode === 'practice' || value.timeLimitSeconds > 0, {
  message: 'Thi thử phải có thời gian từ 1 đến 300 giây.'
})

const saveProgressSchema = z.object({
  attemptId: z.string(), currentIndex: z.number().int().nonnegative(),
  remainingMs: z.number().int().nonnegative().nullable(),
  penaltyDebtMs: z.number().int().nonnegative(),
  answers: z.array(z.object({ questionId: z.string(), submittedText: z.string() }))
})

const stationSetIdSchema = z.object({ stationSetId: z.string() })
const pageReviewSchema = attachmentPageSchema.extend({
  reviewed: z.boolean().optional(), excluded: z.boolean().optional()
})
const resolveSourceChangeSchema = z.object({ attachmentId: z.string(), isSimilar: z.boolean() })

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
  ipcMain.handle(IpcChannels.anatomy.readCandidateText, (_event, payload) => {
    return readCandidateWithAi(candidateIdSchema.parse(payload).candidateId)
  })
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
    const { attachmentId, force = false } = detectAllPagesSchema.parse(payload)
    const totalPages = await getPageCount(attachmentId)
    if (!totalPages) return { totalPages: 0 }
    const row = getDb().prepare('SELECT last_page, completed FROM anatomy_scan_progress WHERE attachment_id = ?')
      .get(attachmentId) as { last_page: number; completed: number } | undefined
    if (row?.completed === 1 && !force) return { totalPages, alreadyComplete: true }
    const startPage = force ? 1 : Math.min(totalPages, (row?.last_page ?? 0) + 1)
    cancelledScans.delete(attachmentId)
    for (let pageNumber = startPage; pageNumber <= totalPages; pageNumber++) {
      if (cancelledScans.has(attachmentId)) break
      await detectLabelsForPage(attachmentId, pageNumber)
      getDb().prepare(
        `INSERT INTO anatomy_scan_progress (attachment_id, last_page, total_pages, completed, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(attachment_id) DO UPDATE SET last_page = excluded.last_page,
           total_pages = excluded.total_pages, completed = excluded.completed, updated_at = datetime('now')`
      ).run(attachmentId, pageNumber, totalPages, pageNumber === totalPages ? 1 : 0)
      if (!event.sender.isDestroyed()) {
        event.sender.send(IpcChannels.anatomy.detectAllPagesProgress, { pageNumber, totalPages })
      }
    }
    return { totalPages, cancelled: cancelledScans.has(attachmentId) }
  })

  ipcMain.handle(IpcChannels.anatomy.cancelDetectAllPages, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    cancelledScans.add(attachmentId)
  })

  ipcMain.handle(IpcChannels.anatomy.listCandidatesForPage, (_event, payload) => {
    const { attachmentId, pageNumber } = attachmentPageSchema.parse(payload)
    return candidatesRepo.listCandidatesForPage(attachmentId, pageNumber)
  })

  ipcMain.handle(IpcChannels.anatomy.updateCandidate, (_event, payload) => {
    const input = updateCandidateSchema.parse(payload)
    const before = candidatesRepo.getCandidate(input.candidateId)
    candidatesRepo.updateCandidate(input)
    if (before) anatomyQuizRepo.refreshPageQuestionGeometry(before.attachmentId, before.pageNumber)
  })

  ipcMain.handle(IpcChannels.anatomy.createManualCandidate, (_event, payload) => {
    const input = createManualCandidateSchema.parse(payload)
    const id = candidatesRepo.createManualCandidate(input)
    anatomyQuizRepo.refreshPageQuestionGeometry(input.attachmentId, input.pageNumber)
    return id
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
    const before = candidatesRepo.getCandidate(candidateId)
    anatomyQuizRepo.deleteQuestionByCandidateId(candidateId)
    candidatesRepo.deleteCandidate(candidateId)
    if (before) anatomyQuizRepo.refreshPageQuestionGeometry(before.attachmentId, before.pageNumber)
  })

  ipcMain.handle(IpcChannels.anatomy.countConfirmedForAttachment, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return anatomyQuizRepo.countConfirmedForAttachment(attachmentId)
  })

  ipcMain.handle(IpcChannels.anatomy.listQuestionSummaries, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return anatomyQuizRepo.listQuestionSummaries(attachmentId)
  })
  ipcMain.handle(IpcChannels.anatomy.listStationSets, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return anatomyQuizRepo.listStationSets(attachmentId)
  })
  ipcMain.handle(IpcChannels.anatomy.createStationSet, (_event, payload) =>
    anatomyQuizRepo.createStationSet(stationSetSchema.parse(payload)))
  ipcMain.handle(IpcChannels.anatomy.deleteStationSet, (_event, payload) => {
    anatomyQuizRepo.deleteStationSet(stationSetIdSchema.parse(payload).stationSetId)
  })
  ipcMain.handle(IpcChannels.anatomy.saveAttemptProgress, (_event, payload) => {
    anatomyQuizRepo.saveAttemptProgress(saveProgressSchema.parse(payload))
  })
  ipcMain.handle(IpcChannels.anatomy.resumeAttempt, (_event, payload) => {
    return anatomyQuizRepo.resumeAttempt(attemptIdSchema.parse(payload).attemptId)
  })
  ipcMain.handle(IpcChannels.anatomy.getEligibility, async (_event, payload) => {
    return analyzeAnatomyEligibility(attachmentIdSchema.parse(payload).attachmentId)
  })
  ipcMain.handle(IpcChannels.anatomy.resolveSourceChange, (_event, payload) => {
    const input = resolveSourceChangeSchema.parse(payload)
    anatomyEligibilityRepo.resolveSourceChange(input.attachmentId, input.isSimilar)
  })
  ipcMain.handle(IpcChannels.anatomy.setPageReview, (_event, payload) => {
    candidatesRepo.setPageReview(pageReviewSchema.parse(payload))
  })
  ipcMain.handle(IpcChannels.anatomy.getPageReview, (_event, payload) => {
    const input = attachmentPageSchema.parse(payload)
    return candidatesRepo.getPageReview(input.attachmentId, input.pageNumber)
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
  ipcMain.handle(IpcChannels.anatomy.listAttemptHistory, (_event, payload) => {
    return anatomyQuizRepo.listAttemptHistory(attachmentIdSchema.parse(payload).attachmentId)
  })
  ipcMain.handle(IpcChannels.anatomy.deleteAttemptHistory, (_event, payload) => {
    anatomyQuizRepo.deleteAttemptHistory(attemptIdSchema.parse(payload).attemptId)
  })
}
