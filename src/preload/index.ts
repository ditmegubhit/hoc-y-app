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
    onExtractionUpdated: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { attachmentId: string }
      ): void => callback(payload.attachmentId)
      ipcRenderer.on(IpcChannels.attachments.extractionUpdated, listener)
      return () => ipcRenderer.removeListener(IpcChannels.attachments.extractionUpdated, listener)
    }
  },
  search: {
    query: (keyword) => ipcRenderer.invoke(IpcChannels.search.query, { keyword })
  },
  ai: {
    checkAvailability: () => ipcRenderer.invoke(IpcChannels.ai.checkAvailability),
    generateQuizFromLesson: (input) =>
      ipcRenderer.invoke(IpcChannels.ai.generateQuizFromLesson, input),
    saveDraftQuestions: (input) => ipcRenderer.invoke(IpcChannels.ai.saveDraftQuestions, input),
    listQuestionsByLesson: (lessonId) =>
      ipcRenderer.invoke(IpcChannels.ai.listQuestionsByLesson, { lessonId }),
    deleteQuestion: (id) => ipcRenderer.invoke(IpcChannels.ai.deleteQuestion, { id })
  },
  questionBank: {
    countAll: () => ipcRenderer.invoke(IpcChannels.questionBank.countAll)
  }
}

contextBridge.exposeInMainWorld('api', api)
