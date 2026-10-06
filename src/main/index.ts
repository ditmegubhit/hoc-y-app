import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { getDb } from './db'
import {
  requeueStuckExtractions,
  syncAllAttachments,
  maybeSyncAllAttachments
} from './services/attachments.service'
import { terminateOcrWorker } from './services/ocr/ocrEngine'
import { terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { cleanupHighlightTempDir } from './services/fileStorage.service'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'

handleProcessStdioErrors()

app.whenReady().then(() => {
  getDb()
  requeueStuckExtractions()
  syncAllAttachments()
  void cleanupHighlightTempDir()
  registerIpcHandlers()
  createMainWindow()

  // File goc bi sua ngoai app trong luc app dang chay -> khi quay lai cua so
  // app, kiem tra & cap nhat lai (co chan tan suat trong maybeSyncAllAttachments).
  app.on('browser-window-focus', () => {
    maybeSyncAllAttachments()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void terminateOcrWorker()
  void terminateVietnameseOcr()
  terminatePaddleOcr()
})
