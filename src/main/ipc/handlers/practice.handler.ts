import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as nodesRepo from '../../db/repositories/practiceNodes.repo'
import * as regionsRepo from '../../db/repositories/practiceRegions.repo'
import * as quizRepo from '../../db/repositories/practiceQuiz.repo'
import { addPracticeFilesFromPaths, pickAndAddPracticeFiles } from '../../services/practice/addFiles'
import { deleteStoredPracticeFile } from '../../services/practice/practiceStorage'
import {
  getPracticeSourceStatus,
  maybeSyncAllPracticeFiles,
  syncPracticeFile
} from '../../services/practice/sourceSync'
import { cancelScan, getScanStateWithRunning, scanPracticeFile } from '../../services/practice/scanFile'
import { readPracticePageWithAi, readPracticeRegionWithAi } from '../../services/practice/readRegionWithAi'
import { pickRandomQuestionIds } from '../../services/practice/randomPick'
import { searchNodesByName } from '../../../shared/practice/searchNodes'
import type { PracticeSearchResult } from '../../../shared/types/practice'

const rectSchema = z.object({
  x0: z.number().finite(),
  y0: z.number().finite(),
  x1: z.number().finite(),
  y1: z.number().finite()
})
const hexColorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Màu phải dạng #rrggbb.')
const nameSchema = z.string().trim().min(1, 'Tên không được để trống.').max(200)
const idSchema = z.object({ id: z.string() })
const fileIdSchema = z.object({ fileId: z.string() })
const attemptIdSchema = z.object({ attemptId: z.string() })
const statusSchema = z.enum(['pending', 'confirmed', 'rejected'])
const feedbackModeSchema = z.enum(['practice', 'exam'])
const answersSchema = z.array(z.object({ regionId: z.string(), submittedText: z.string() }))

const createFolderSchema = z.object({ parentId: z.string().nullable(), name: nameSchema })
const renameSchema = z.object({ id: z.string(), name: nameSchema })
const moveSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  index: z.number().int().nonnegative().optional()
})
const parentSchema = z.object({ parentId: z.string().nullable() })
const addPathsSchema = z.object({ parentId: z.string().nullable(), paths: z.array(z.string().min(1)).min(1).max(500) })
const searchSchema = z.object({ keyword: z.string().max(200) })

const fileSettingsSchema = z.object({
  fileId: z.string(),
  maskColor: hexColorSchema.optional(),
  maskOpacity: z.number().min(0).max(1).optional()
})
const resetColorsSchema = z.object({ fileId: z.string(), includeOpacity: z.boolean().optional() })
const resolveSourceSchema = z.object({ fileId: z.string(), isSimilar: z.boolean() })
const scanSchema = z.object({ fileId: z.string(), force: z.boolean().optional() })

const pageSchema = z.object({ fileId: z.string(), pageNumber: z.number().int().positive() })
const createRegionSchema = z.object({
  fileId: z.string(),
  pageNumber: z.number().int().positive(),
  labelBox: rectSchema,
  refWidth: z.number().positive(),
  refHeight: z.number().positive(),
  answerText: z.string().nullable().optional(),
  alternates: z.array(z.string()).optional(),
  cropBox: rectSchema.nullable().optional(),
  status: statusSchema.optional(),
  reviewed: z.boolean().optional()
})
const updateRegionSchema = z.object({
  id: z.string(),
  patch: z.object({
    labelBox: rectSchema.optional(),
    cropBox: rectSchema.nullable().optional(),
    rawText: z.string().optional(),
    answerText: z.string().nullable().optional(),
    alternates: z.array(z.string()).optional(),
    status: statusSchema.optional(),
    reviewed: z.boolean().optional(),
    colorOverride: hexColorSchema.nullable().optional(),
    opacityOverride: z.number().min(0).max(1).nullable().optional()
  })
})
const restoreRegionSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  pageNumber: z.number().int().positive(),
  labelBox: rectSchema,
  refWidth: z.number().positive(),
  refHeight: z.number().positive(),
  rawText: z.string(),
  answerText: z.string().nullable(),
  alternates: z.array(z.string()),
  cropBox: rectSchema.nullable(),
  confidence: z.number().nullable(),
  leaderScore: z.number().nullable(),
  suspect: z.boolean(),
  status: statusSchema,
  reviewed: z.boolean(),
  colorOverride: hexColorSchema.nullable(),
  opacityOverride: z.number().min(0).max(1).nullable(),
  manual: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})
const pageReviewSchema = pageSchema.extend({ reviewed: z.boolean().optional(), excluded: z.boolean().optional() })
const regionIdSchema = z.object({ regionId: z.string() })

const pickRandomSchema = z.object({
  fileId: z.string(),
  count: z.number().int().min(0).max(100000),
  fromPage: z.number().int().positive(),
  toPage: z.number().int().positive()
})
const stationSetSchema = z.object({
  fileId: z.string(),
  name: z.string().max(200),
  feedbackMode: feedbackModeSchema,
  timeLimitSeconds: z.number().int().min(0).max(300),
  regionIds: z.array(z.string()).min(1)
}).refine((v) => v.feedbackMode === 'practice' || v.timeLimitSeconds > 0, {
  message: 'Thi thử phải có thời gian từ 1 đến 300 giây.'
})
const stationSetIdSchema = z.object({ stationSetId: z.string() })
const saveProgressSchema = z.object({
  attemptId: z.string(),
  currentIndex: z.number().int().nonnegative(),
  remainingMs: z.number().int().nonnegative().nullable(),
  penaltyDebtMs: z.number().int().nonnegative(),
  answers: answersSchema
})
const checkAnswerSchema = z.object({ attemptId: z.string(), regionId: z.string(), submittedText: z.string() })
const submitSchema = z.object({
  attemptId: z.string(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  answers: answersSchema
})

let interruptedScansCleaned = false

export function registerPracticeHandlers(): void {
  const ch = IpcChannels.practice

  // ---------- Cay ----------
  ipcMain.handle(ch.listNodes, () => {
    if (!interruptedScansCleaned) {
      interruptedScansCleaned = true
      nodesRepo.markInterruptedScansFailed()
    }
    // Tra danh sach ngay; kiem tra file goc doi chua o nen, xong ban su kien filesUpdated.
    maybeSyncAllPracticeFiles()
    return nodesRepo.listTreeNodes()
  })
  ipcMain.handle(ch.createFolder, (_e, payload) => {
    const input = createFolderSchema.parse(payload)
    return nodesRepo.createFolder(input.parentId, input.name)
  })
  ipcMain.handle(ch.renameNode, (_e, payload) => {
    const input = renameSchema.parse(payload)
    return nodesRepo.renameNode(input.id, input.name)
  })
  ipcMain.handle(ch.moveNode, (_e, payload) => {
    const input = moveSchema.parse(payload)
    return nodesRepo.moveNode(input.id, input.parentId, input.index)
  })
  ipcMain.handle(ch.deleteNode, async (_e, payload) => {
    const { id } = idSchema.parse(payload)
    for (const file of nodesRepo.collectStoredPaths(id)) cancelScan(file.fileId)
    const stored = nodesRepo.deleteNode(id)
    for (const file of stored) await deleteStoredPracticeFile(file.storedPath)
  })
  ipcMain.handle(ch.search, (_e, payload): PracticeSearchResult[] => {
    const { keyword } = searchSchema.parse(payload)
    return searchNodesByName(nodesRepo.listTreeNodes(), keyword)
  })
  ipcMain.handle(ch.pickAndAddFiles, (_e, payload) => {
    const { parentId } = parentSchema.parse(payload)
    return pickAndAddPracticeFiles(parentId)
  })
  ipcMain.handle(ch.addFilesFromPaths, (_e, payload) => {
    const input = addPathsSchema.parse(payload)
    return addPracticeFilesFromPaths(input.parentId, input.paths)
  })

  // ---------- File ----------
  ipcMain.handle(ch.getFile, (_e, payload) => nodesRepo.getFile(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.updateFileSettings, (_e, payload) => nodesRepo.updateFileSettings(fileSettingsSchema.parse(payload)))
  ipcMain.handle(ch.resetRegionColors, (_e, payload) => nodesRepo.resetRegionColors(resetColorsSchema.parse(payload)))
  ipcMain.handle(ch.getSourceStatus, (_e, payload) => getPracticeSourceStatus(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.syncSource, (_e, payload) => syncPracticeFile(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.resolveSourceChange, (_e, payload) => {
    const input = resolveSourceSchema.parse(payload)
    nodesRepo.resolveSourceChange(input.fileId, input.isSimilar)
  })

  // ---------- Quet ----------
  ipcMain.handle(ch.scanFile, (_e, payload) => {
    const { fileId, force } = scanSchema.parse(payload)
    return scanPracticeFile(fileId, force ?? false)
  })
  ipcMain.handle(ch.cancelScan, (_e, payload) => cancelScan(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.getScanState, (_e, payload) => getScanStateWithRunning(fileIdSchema.parse(payload).fileId))

  // ---------- Vung ----------
  ipcMain.handle(ch.listRegionsForPage, (_e, payload) => {
    const { fileId, pageNumber } = pageSchema.parse(payload)
    return regionsRepo.listRegionsForPage(fileId, pageNumber)
  })
  ipcMain.handle(ch.listRegionsForFile, (_e, payload) => regionsRepo.listRegionsForFile(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.createRegion, (_e, payload) => regionsRepo.createRegion(createRegionSchema.parse(payload)))
  ipcMain.handle(ch.updateRegion, (_e, payload) => {
    const input = updateRegionSchema.parse(payload)
    return regionsRepo.updateRegion(input.id, input.patch)
  })
  ipcMain.handle(ch.deleteRegion, (_e, payload) => regionsRepo.deleteRegion(idSchema.parse(payload).id))
  ipcMain.handle(ch.restoreRegion, (_e, payload) => regionsRepo.restoreRegion(restoreRegionSchema.parse(payload)))
  ipcMain.handle(ch.readRegionWithAi, (_e, payload) => readPracticeRegionWithAi(regionIdSchema.parse(payload).regionId))
  ipcMain.handle(ch.readPageWithAi, (_e, payload) => {
    const { fileId, pageNumber } = pageSchema.parse(payload)
    return readPracticePageWithAi(fileId, pageNumber)
  })
  ipcMain.handle(ch.listPageStates, (_e, payload) => regionsRepo.listPageStates(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.setPageReview, (_e, payload) => regionsRepo.setPageReview(pageReviewSchema.parse(payload)))

  // ---------- Bai thi ----------
  ipcMain.handle(ch.listQuestionSummaries, (_e, payload) => quizRepo.listQuestionSummaries(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.pickRandomQuestions, (_e, payload) => {
    const input = pickRandomSchema.parse(payload)
    return pickRandomQuestionIds(quizRepo.listQuestionSummaries(input.fileId), input)
  })
  ipcMain.handle(ch.listStationSets, (_e, payload) => quizRepo.listStationSets(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.createStationSet, (_e, payload) => quizRepo.createStationSet(stationSetSchema.parse(payload)))
  ipcMain.handle(ch.deleteStationSet, (_e, payload) => quizRepo.deleteStationSet(stationSetIdSchema.parse(payload).stationSetId))
  ipcMain.handle(ch.startAttempt, (_e, payload) => quizRepo.startAttempt(stationSetIdSchema.parse(payload)))
  ipcMain.handle(ch.saveAttemptProgress, (_e, payload) => quizRepo.saveAttemptProgress(saveProgressSchema.parse(payload)))
  ipcMain.handle(ch.resumeAttempt, (_e, payload) => quizRepo.resumeAttempt(attemptIdSchema.parse(payload).attemptId))
  ipcMain.handle(ch.findActiveAttempt, (_e, payload) => quizRepo.findActiveAttempt(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.checkAnswer, (_e, payload) => quizRepo.checkAnswer(checkAnswerSchema.parse(payload)))
  ipcMain.handle(ch.submitAttempt, (_e, payload) => quizRepo.submitAttempt(submitSchema.parse(payload)))
  ipcMain.handle(ch.getAttemptReview, (_e, payload) => quizRepo.getAttemptReview(attemptIdSchema.parse(payload).attemptId))
  ipcMain.handle(ch.listAttemptHistory, (_e, payload) => quizRepo.listAttemptHistory(fileIdSchema.parse(payload).fileId))
  ipcMain.handle(ch.deleteAttemptHistory, (_e, payload) => quizRepo.deleteAttemptHistory(attemptIdSchema.parse(payload).attemptId))
  ipcMain.handle(ch.createReviewSet, (_e, payload) => quizRepo.createReviewSet(attemptIdSchema.parse(payload).attemptId))
}
