import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannels } from '../../../shared/types/ipcChannels'

// Kho ban sao PDF cua khu Thuc hanh Giai phau: userData/practiceFiles.
export function practiceFilesDir(): string {
  return join(app.getPath('userData'), 'practiceFiles')
}

export async function storePracticeFile(
  sourcePath: string
): Promise<{ storedPath: string; fileSizeBytes: number }> {
  const dir = practiceFilesDir()
  await mkdir(dir, { recursive: true })
  const storedPath = join(dir, `${randomUUID()}.pdf`)
  await copyFile(sourcePath, storedPath)
  const stats = await stat(storedPath)
  return { storedPath, fileSizeBytes: stats.size }
}

// Nuot loi - tep co the da khong con.
export async function deleteStoredPracticeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    // ignore
  }
}

// Ban su kien cho moi cua so (tien trinh quet, file doi do dong bo).
export function broadcastPractice(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function notifyPracticeFilesUpdated(fileId: string): void {
  broadcastPractice(IpcChannels.practice.filesUpdated, { fileId })
}
