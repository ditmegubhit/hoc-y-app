import { ipcMain, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { IpcChannels } from '../../../shared/types/ipcChannels'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export function registerNotesHandlers(): void {
  ipcMain.handle(IpcChannels.notes.pickImage, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Hình ảnh', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const mimeType = MIME_BY_EXT[extname(filePath).toLowerCase()]
    if (!mimeType) return null

    const buffer = await readFile(filePath)
    return { mimeType, base64: buffer.toString('base64') }
  })
}
