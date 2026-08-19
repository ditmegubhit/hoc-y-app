import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { getDb } from './db'
import { requeueStuckExtractions } from './services/attachments.service'
import { terminateOcrWorker } from './services/ocr/ocrEngine'
import { cleanupHighlightTempDir } from './services/fileStorage.service'

app.whenReady().then(() => {
  getDb()
  requeueStuckExtractions()
  void cleanupHighlightTempDir()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void terminateOcrWorker()
})
