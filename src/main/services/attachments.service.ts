import { dialog, BrowserWindow } from 'electron'
import { extname } from 'node:path'
import { storeAttachmentFile } from './fileStorage.service'
import { detectExtractableType, extractText, type ExtractableFileType } from './textExtraction'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import * as lessonsRepo from '../db/repositories/lessons.repo'
import * as searchIndexRepo from '../db/repositories/searchIndex.repo'
import * as wordPositionsRepo from '../db/repositories/wordPositions.repo'
import type { Attachment, AttachmentFileType } from '../../shared/types/attachment'

// Van co the co text OCR ra 1-2 ky tu rac (nhieu/mo) - khong tinh la "co noi
// dung" de tranh gay hieu lam da lap chi muc tim kiem duoc.
const MIN_USEFUL_TEXT_CHARS = 3

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
  type: ExtractableFileType,
  lessonId: string
): Promise<void> {
  try {
    const chunks = await extractText(storedPath, type, () => {
      attachmentsRepo.markAttachmentOcrProcessing(attachmentId)
      notifyExtractionUpdated(attachmentId)
    })
    const text = chunks.map((c) => c.text).join('\n\n')
    const status = text.trim().length >= MIN_USEFUL_TEXT_CHARS ? 'done' : 'done_empty'
    attachmentsRepo.updateAttachmentExtraction(attachmentId, status, text)

    wordPositionsRepo.replaceWordPositions({
      sourceType: 'attachment',
      sourceId: attachmentId,
      chunks
    })

    const lesson = lessonsRepo.getLesson(lessonId)
    if (lesson) {
      searchIndexRepo.replaceSearchIndexEntries({
        sourceType: 'attachment',
        sourceId: attachmentId,
        lessonId: lesson.id,
        topicId: lesson.topicId,
        title: lesson.title,
        chunks
      })
    }
  } catch (err) {
    console.error('[attachments] extraction failed:', err)
    attachmentsRepo.updateAttachmentExtraction(attachmentId, 'failed', null)
  } finally {
    notifyExtractionUpdated(attachmentId)
  }
}

// Chay khi app khoi dong: file cu bi ket o 'done_empty' (bug gan nham 'done'
// truoc khi co OCR) hoac do dang do app tat dot ngot duoc tu dong xu ly lai
// bang pipeline OCR moi, khong can user thao tac gi.
export function requeueStuckExtractions(): void {
  const stuck = attachmentsRepo.listAttachmentsNeedingReextraction()
  for (const att of stuck) {
    const type = detectExtractableType(att.storedPath)
    if (!type) continue
    void extractAndIndex(att.id, att.storedPath, type, att.lessonId)
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
