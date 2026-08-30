import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export function attachmentsDir(): string {
  return join(app.getPath('userData'), 'attachments')
}

export function examFilesDir(): string {
  return join(app.getPath('userData'), 'examFiles')
}

// Ban sao tam co ve khung to mau (PDF/anh) khi mo file goc - khong phai file
// nguoi dung tao, khong hien trong UI attachments, chi dung de xem tam.
export function highlightTempDir(): string {
  return join(app.getPath('userData'), 'highlightTemp')
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

// Xoa 1 file da luu (vd: sau khi thay ban sao cu bang ban moi luc dong bo lai
// tu file goc). Nuot loi - file co the da khong con.
export async function deleteStoredFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    // ignore
  }
}

const HIGHLIGHT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Goi luc app khoi dong - file tam to mau khong tu xoa ngay sau khi mo (khong
// co tin hieu dang tin cay "user da dong trinh doc") nen don dep dinh ky thay
// vi theo doi real-time.
export async function cleanupHighlightTempDir(): Promise<void> {
  const dir = highlightTempDir()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  const now = Date.now()
  for (const name of entries) {
    const filePath = join(dir, name)
    try {
      const stats = await stat(filePath)
      if (now - stats.mtimeMs > HIGHLIGHT_TEMP_MAX_AGE_MS) {
        await unlink(filePath)
      }
    } catch (err) {
      console.error('[fileStorage] cleanup highlightTemp failed for', filePath, err)
    }
  }
}
