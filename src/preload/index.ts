import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels } from '../shared/types/ipcChannels'
import type { AppApi } from '../shared/types/api'

const api: AppApi = {
  appVersion: process.env['npm_package_version'] ?? 'dev',
  topics: {
    list: () => ipcRenderer.invoke(IpcChannels.topics.list),
    create: (input) => ipcRenderer.invoke(IpcChannels.topics.create, input),
    update: (input) => ipcRenderer.invoke(IpcChannels.topics.update, input),
    delete: (id) => ipcRenderer.invoke(IpcChannels.topics.delete, { id })
  },
  lessons: {
    listAll: () => ipcRenderer.invoke(IpcChannels.lessons.listAll),
    listRecent: (limit) => ipcRenderer.invoke(IpcChannels.lessons.listRecent, { limit }),
    get: (id) => ipcRenderer.invoke(IpcChannels.lessons.get, { id }),
    create: (input) => ipcRenderer.invoke(IpcChannels.lessons.create, input),
    update: (input) => ipcRenderer.invoke(IpcChannels.lessons.update, input),
    delete: (id) => ipcRenderer.invoke(IpcChannels.lessons.delete, { id })
  },
  attachments: {
    listByLesson: (lessonId) =>
      ipcRenderer.invoke(IpcChannels.attachments.listByLesson, { lessonId }),
    add: (lessonId) => ipcRenderer.invoke(IpcChannels.attachments.add, { lessonId }),
    remove: (id) => ipcRenderer.invoke(IpcChannels.attachments.remove, { id }),
    reextract: (id) => ipcRenderer.invoke(IpcChannels.attachments.reextract, { id }),
    linkSource: (id) => ipcRenderer.invoke(IpcChannels.attachments.linkSource, { id }),
    bulkLinkSources: () => ipcRenderer.invoke(IpcChannels.attachments.bulkLinkSources),
    onExtractionUpdated: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { attachmentId: string }
      ): void => callback(payload.attachmentId)
      ipcRenderer.on(IpcChannels.attachments.extractionUpdated, listener)
      return () => ipcRenderer.removeListener(IpcChannels.attachments.extractionUpdated, listener)
    },
    getPageImage: (input) => ipcRenderer.invoke(IpcChannels.attachments.getPageImage, input),
    getPageCount: (input) => ipcRenderer.invoke(IpcChannels.attachments.getPageCount, input),
    openAtLocation: (input) => ipcRenderer.invoke(IpcChannels.attachments.openAtLocation, input),
    getAnnotations: (input) => ipcRenderer.invoke(IpcChannels.attachments.getAnnotations, input),
    saveAnnotations: (input) => ipcRenderer.invoke(IpcChannels.attachments.saveAnnotations, input)
  },
  search: {
    query: (keyword) => ipcRenderer.invoke(IpcChannels.search.query, { keyword }),
    getHighlightedChunk: (query) =>
      ipcRenderer.invoke(IpcChannels.search.getHighlightedChunk, query)
  },
  ai: {
    checkAvailability: () => ipcRenderer.invoke(IpcChannels.ai.checkAvailability),
    checkOllama: () => ipcRenderer.invoke(IpcChannels.ai.checkOllama),
    getAiSettings: () => ipcRenderer.invoke(IpcChannels.ai.getAiSettings),
    setAiSettings: (patch) => ipcRenderer.invoke(IpcChannels.ai.setAiSettings, patch),
    generateQuizFromLesson: (input) =>
      ipcRenderer.invoke(IpcChannels.ai.generateQuizFromLesson, input),
    generateQuizFromLessons: (input) =>
      ipcRenderer.invoke(IpcChannels.ai.generateQuizFromLessons, input),
    onGenerateProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: Parameters<typeof callback>[0]
      ): void => callback(payload)
      ipcRenderer.on(IpcChannels.ai.generateProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.ai.generateProgress, listener)
    },
    saveDraftQuestions: (input) => ipcRenderer.invoke(IpcChannels.ai.saveDraftQuestions, input),
    listQuestionsByLesson: (lessonId) =>
      ipcRenderer.invoke(IpcChannels.ai.listQuestionsByLesson, { lessonId }),
    listQuestionsByLessonIds: (lessonIds) =>
      ipcRenderer.invoke(IpcChannels.ai.listQuestionsByLessonIds, { lessonIds }),
    listQuestionsByTopic: (topicId) =>
      ipcRenderer.invoke(IpcChannels.ai.listQuestionsByTopic, { topicId }),
    listQuestionsUnderTopic: (topicId) =>
      ipcRenderer.invoke(IpcChannels.ai.listQuestionsUnderTopic, { topicId }),
    updateQuestion: (input) => ipcRenderer.invoke(IpcChannels.ai.updateQuestion, input),
    reviewQuestions: (input) => ipcRenderer.invoke(IpcChannels.ai.reviewQuestions, input),
    recordLearningExamples: (examples) =>
      ipcRenderer.invoke(IpcChannels.ai.recordLearningExamples, { examples }),
    deleteQuestion: (id) => ipcRenderer.invoke(IpcChannels.ai.deleteQuestion, { id })
  },
  quiz: {
    listPlayableForLesson: (lessonId) =>
      ipcRenderer.invoke(IpcChannels.quiz.listPlayableForLesson, { lessonId }),
    listPlayableForTopic: (input) =>
      ipcRenderer.invoke(IpcChannels.quiz.listPlayableForTopic, input),
    create: (input) => ipcRenderer.invoke(IpcChannels.quiz.create, input),
    submitAttempt: (input) => ipcRenderer.invoke(IpcChannels.quiz.submitAttempt, input),
    listAttemptsByLesson: (lessonId) =>
      ipcRenderer.invoke(IpcChannels.quiz.listAttemptsByLesson, { lessonId }),
    listAttemptsByTopic: (topicId) =>
      ipcRenderer.invoke(IpcChannels.quiz.listAttemptsByTopic, { topicId }),
    getAttemptReview: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.quiz.getAttemptReview, { attemptId }),
    deleteAttempt: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.quiz.deleteAttempt, { attemptId })
  },
  questionBank: {
    countAll: () => ipcRenderer.invoke(IpcChannels.questionBank.countAll)
  },
  examFiles: {
    list: () => ipcRenderer.invoke(IpcChannels.examFiles.list),
    add: () => ipcRenderer.invoke(IpcChannels.examFiles.add),
    remove: (id) => ipcRenderer.invoke(IpcChannels.examFiles.remove, { id })
  },
  notes: {
    pickImage: () => ipcRenderer.invoke(IpcChannels.notes.pickImage)
  },
  anatomy: {
    readCandidateText: (candidateId) => ipcRenderer.invoke(IpcChannels.anatomy.readCandidateText, { candidateId }),
    detectPage: (input) => ipcRenderer.invoke(IpcChannels.anatomy.detectPage, input),
    detectAllPages: (input) => ipcRenderer.invoke(IpcChannels.anatomy.detectAllPages, input),
    cancelDetectAllPages: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.cancelDetectAllPages, { attachmentId }),
    onDetectAllPagesProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { pageNumber: number; totalPages: number }
      ): void => callback(payload)
      ipcRenderer.on(IpcChannels.anatomy.detectAllPagesProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.anatomy.detectAllPagesProgress, listener)
    },
    listCandidatesForPage: (input) =>
      ipcRenderer.invoke(IpcChannels.anatomy.listCandidatesForPage, input),
    updateCandidate: (input) => ipcRenderer.invoke(IpcChannels.anatomy.updateCandidate, input),
    createManualCandidate: (input) =>
      ipcRenderer.invoke(IpcChannels.anatomy.createManualCandidate, input),
    confirmCandidate: (input) => ipcRenderer.invoke(IpcChannels.anatomy.confirmCandidate, input),
    updateQuestionAnswer: (input) =>
      ipcRenderer.invoke(IpcChannels.anatomy.updateQuestionAnswer, input),
    rejectCandidate: (candidateId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.rejectCandidate, { candidateId }),
    deleteCandidate: (candidateId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.deleteCandidate, { candidateId }),
    countConfirmedForAttachment: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.countConfirmedForAttachment, { attachmentId }),
    listQuestionSummaries: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.listQuestionSummaries, { attachmentId }),
    listStationSets: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.listStationSets, { attachmentId }),
    createStationSet: (input) => ipcRenderer.invoke(IpcChannels.anatomy.createStationSet, input),
    deleteStationSet: (stationSetId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.deleteStationSet, { stationSetId }),
    saveAttemptProgress: (input) =>
      ipcRenderer.invoke(IpcChannels.anatomy.saveAttemptProgress, input),
    resumeAttempt: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.resumeAttempt, { attemptId }),
    getEligibility: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.getEligibility, { attachmentId }),
    resolveSourceChange: (input) => ipcRenderer.invoke(IpcChannels.anatomy.resolveSourceChange, input),
    setPageReview: (input) => ipcRenderer.invoke(IpcChannels.anatomy.setPageReview, input),
    getPageReview: (input) => ipcRenderer.invoke(IpcChannels.anatomy.getPageReview, input),
    checkAnswer: (input) => ipcRenderer.invoke(IpcChannels.anatomy.checkAnswer, input),
    startAttempt: (input) => ipcRenderer.invoke(IpcChannels.anatomy.startAttempt, input),
    submitAttempt: (input) => ipcRenderer.invoke(IpcChannels.anatomy.submitAttempt, input),
    getAttemptReview: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.getAttemptReview, { attemptId }),
    listAttemptHistory: (attachmentId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.listAttemptHistory, { attachmentId }),
    deleteAttemptHistory: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.anatomy.deleteAttemptHistory, { attemptId })
  },
  practice: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
    listNodes: () => ipcRenderer.invoke(IpcChannels.practice.listNodes),
    createFolder: (input) => ipcRenderer.invoke(IpcChannels.practice.createFolder, input),
    renameNode: (input) => ipcRenderer.invoke(IpcChannels.practice.renameNode, input),
    moveNode: (input) => ipcRenderer.invoke(IpcChannels.practice.moveNode, input),
    deleteNode: (id) => ipcRenderer.invoke(IpcChannels.practice.deleteNode, { id }),
    search: (keyword) => ipcRenderer.invoke(IpcChannels.practice.search, { keyword }),
    pickAndAddFiles: (parentId) => ipcRenderer.invoke(IpcChannels.practice.pickAndAddFiles, { parentId }),
    addFilesFromPaths: (parentId, paths) =>
      ipcRenderer.invoke(IpcChannels.practice.addFilesFromPaths, { parentId, paths }),
    getFile: (fileId) => ipcRenderer.invoke(IpcChannels.practice.getFile, { fileId }),
    updateFileSettings: (input) => ipcRenderer.invoke(IpcChannels.practice.updateFileSettings, input),
    resetRegionColors: (input) => ipcRenderer.invoke(IpcChannels.practice.resetRegionColors, input),
    getSourceStatus: (fileId) => ipcRenderer.invoke(IpcChannels.practice.getSourceStatus, { fileId }),
    syncSource: (fileId) => ipcRenderer.invoke(IpcChannels.practice.syncSource, { fileId }),
    resolveSourceChange: (input) => ipcRenderer.invoke(IpcChannels.practice.resolveSourceChange, input),
    onFilesUpdated: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { fileId: string }): void =>
        callback(payload.fileId)
      ipcRenderer.on(IpcChannels.practice.filesUpdated, listener)
      return () => ipcRenderer.removeListener(IpcChannels.practice.filesUpdated, listener)
    },
    scanFile: (input) => ipcRenderer.invoke(IpcChannels.practice.scanFile, input),
    cancelScan: (fileId) => ipcRenderer.invoke(IpcChannels.practice.cancelScan, { fileId }),
    getScanState: (fileId) => ipcRenderer.invoke(IpcChannels.practice.getScanState, { fileId }),
    onScanProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: Parameters<typeof callback>[0]
      ): void => callback(payload)
      ipcRenderer.on(IpcChannels.practice.scanProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.practice.scanProgress, listener)
    },
    listRegionsForPage: (input) => ipcRenderer.invoke(IpcChannels.practice.listRegionsForPage, input),
    listRegionsForFile: (fileId) => ipcRenderer.invoke(IpcChannels.practice.listRegionsForFile, { fileId }),
    createRegion: (input) => ipcRenderer.invoke(IpcChannels.practice.createRegion, input),
    updateRegion: (input) => ipcRenderer.invoke(IpcChannels.practice.updateRegion, input),
    deleteRegion: (id) => ipcRenderer.invoke(IpcChannels.practice.deleteRegion, { id }),
    restoreRegion: (region) => ipcRenderer.invoke(IpcChannels.practice.restoreRegion, region),
    readRegionWithAi: (regionId) => ipcRenderer.invoke(IpcChannels.practice.readRegionWithAi, { regionId }),
    readPageWithAi: (input) => ipcRenderer.invoke(IpcChannels.practice.readPageWithAi, input),
    listPageStates: (fileId) => ipcRenderer.invoke(IpcChannels.practice.listPageStates, { fileId }),
    setPageReview: (input) => ipcRenderer.invoke(IpcChannels.practice.setPageReview, input),
    listQuestionSummaries: (fileId) => ipcRenderer.invoke(IpcChannels.practice.listQuestionSummaries, { fileId }),
    pickRandomQuestions: (input) => ipcRenderer.invoke(IpcChannels.practice.pickRandomQuestions, input),
    listStationSets: (fileId) => ipcRenderer.invoke(IpcChannels.practice.listStationSets, { fileId }),
    createStationSet: (input) => ipcRenderer.invoke(IpcChannels.practice.createStationSet, input),
    deleteStationSet: (stationSetId) =>
      ipcRenderer.invoke(IpcChannels.practice.deleteStationSet, { stationSetId }),
    startAttempt: (input) => ipcRenderer.invoke(IpcChannels.practice.startAttempt, input),
    saveAttemptProgress: (input) => ipcRenderer.invoke(IpcChannels.practice.saveAttemptProgress, input),
    resumeAttempt: (attemptId) => ipcRenderer.invoke(IpcChannels.practice.resumeAttempt, { attemptId }),
    findActiveAttempt: (fileId) => ipcRenderer.invoke(IpcChannels.practice.findActiveAttempt, { fileId }),
    checkAnswer: (input) => ipcRenderer.invoke(IpcChannels.practice.checkAnswer, input),
    submitAttempt: (input) => ipcRenderer.invoke(IpcChannels.practice.submitAttempt, input),
    getAttemptReview: (attemptId) => ipcRenderer.invoke(IpcChannels.practice.getAttemptReview, { attemptId }),
    listAttemptHistory: (fileId) => ipcRenderer.invoke(IpcChannels.practice.listAttemptHistory, { fileId }),
    deleteAttemptHistory: (attemptId) =>
      ipcRenderer.invoke(IpcChannels.practice.deleteAttemptHistory, { attemptId }),
    createReviewSet: (attemptId) => ipcRenderer.invoke(IpcChannels.practice.createReviewSet, { attemptId })
  }
}

contextBridge.exposeInMainWorld('api', api)
