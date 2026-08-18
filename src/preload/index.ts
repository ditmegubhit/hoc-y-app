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
    get: (id) => ipcRenderer.invoke(IpcChannels.lessons.get, { id }),
    create: (input) => ipcRenderer.invoke(IpcChannels.lessons.create, input),
    update: (input) => ipcRenderer.invoke(IpcChannels.lessons.update, input),
    delete: (id) => ipcRenderer.invoke(IpcChannels.lessons.delete, { id })
  }
}

contextBridge.exposeInMainWorld('api', api)
