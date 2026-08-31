import { contextBridge, ipcRenderer } from 'electron'
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
  }
}

contextBridge.exposeInMainWorld('api', api)
