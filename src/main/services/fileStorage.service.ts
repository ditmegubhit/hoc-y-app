import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export function attachmentsDir(): string {
  return join(app.getPath('userData'), 'attachments')
}

export function examFilesDir(): string {
  return join(app.getPath('userData'), 'examFiles')
}

async function storeFileIn(
  dir: string,
  sourcePath: string
): Promise<{ storedPath: string; fileName: string; fileSizeBytes: number }> {
  await mkdir(dir, { recursive: true })

  const ext = extname(sourcePath)
  const storedPath = join(dir, `${randomUUID()}${ext}`)
  await copyFile(sourcePath, storedPath)
  const stats = await stat(storedPath)

  return { storedPath, fileName: basename(sourcePath), fileSizeBytes: stats.size }
}

export function storeAttachmentFile(
  sourcePath: string
): Promise<{ storedPath: string; fileName: string; fileSizeBytes: number }> {
  return storeFileIn(attachmentsDir(), sourcePath)
}

export function storeExamFile(
  sourcePath: string
): Promise<{ storedPath: string; fileName: string; fileSizeBytes: number }> {
  return storeFileIn(examFilesDir(), sourcePath)
}
