import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { getDb } from './db'

app.whenReady().then(() => {
  getDb()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
