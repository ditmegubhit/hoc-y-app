import { contextBridge } from 'electron'

// M1: chưa có IPC nghiệp vụ nào — chỉ dựng khung expose an toàn.
// Các namespace topics/lessons/attachments/search/ai/exam/quiz/automation
// sẽ được thêm dần ở M2-M7 theo shared/types/ipcChannels.ts.
const api = {
  appVersion: process.env['npm_package_version'] ?? 'dev'
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
