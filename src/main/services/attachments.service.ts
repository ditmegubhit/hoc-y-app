import { dialog, BrowserWindow } from 'electron'
import { extname } from 'node:path'
import { storeAttachmentFile } from './fileStorage.service'
import { detectExtractableType, extractText } from './textExtraction'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import * as lessonsRepo from '../db/repositories/lessons.repo'
import * as searchIndexRepo from '../db/repositories/searchIndex.repo'
import type { Attachment, AttachmentFileType } from '../../shared/types/attachment'

const SUPPORTED_EXTENSIONS: Record<string, AttachmentFileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpeg'
}

function notifyExtractionUpdated(attachmentId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('attachments:extractionUpdated', { attachmentId })
  }
}

export async function pickAndAddAttachment(lessonId: string): Promise<Attachment | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Tài liệu học tập', extensions: ['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  return addAttachmentFromPath(lessonId, result.filePaths[0])
}

export async function addAttachmentFromPath(
  lessonId: string,
  sourcePath: string
): Promise<Attachment> {
  const ext = extname(sourcePath).toLowerCase()
  const fileType = SUPPORTED_EXTENSIONS[ext] ?? 'other'

  const stored = await storeAttachmentFile(sourcePath)
  const extractable = detectExtractableType(sourcePath)

  const attachment = attachmentsRepo.createAttachment({
    lessonId,
    fileName: stored.fileName,
    fileType,
    storedPath: stored.storedPath,
    fileSizeBytes: stored.fileSizeBytes,
    extractionStatus: extractable ? 'pending' : 'not_supported'
  })

  if (extractable) {
    void extractAndIndex(attachment.id, stored.storedPath, extractable, lessonId)
  }

  return attachment
}

async function extractAndIndex(
  attachmentId: string,
  storedPath: string,
  type: 'pdf' | 'docx' | 'pptx',
  lessonId: string
): Promise<void> {
  try {
    const text = await extractText(storedPath, type)
    attachmentsRepo.updateAttachmentExtraction(attachmentId, 'done', text)

    const lesson = lessonsRepo.getLesson(lessonId)
    if (lesson) {
      searchIndexRepo.upsertSearchIndex({
        sourceType: 'attachment',
        sourceId: attachmentId,
        lessonId: lesson.id,
        topicId: lesson.topicId,
        title: lesson.title,
        content: text
      })
    }
  } catch (err) {
    console.error('[attachments] extraction failed:', err)
    attachmentsRepo.updateAttachmentExtraction(attachmentId, 'failed', null)
  } finally {
    notifyExtractionUpdated(attachmentId)
  }
}

export function reextractAttachment(attachmentId: string): void {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return
  const type = detectExtractableType(attachment.storedPath)
  if (!type) return
  attachmentsRepo.updateAttachmentExtraction(attachmentId, 'pending', attachment.extractedText)
  void extractAndIndex(attachmentId, attachment.storedPath, type, attachment.lessonId)
}

export function removeAttachment(id: string): void {
  attachmentsRepo.deleteAttachment(id)
}

export function listAttachments(lessonId: string): Attachment[] {
  return attachmentsRepo.listAttachmentsByLesson(lessonId)
}
