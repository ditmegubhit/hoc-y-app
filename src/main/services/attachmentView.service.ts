import { readFile } from 'node:fs/promises'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import { renderPdfPageAsPng, RENDER_SCALE } from './textExtraction/pdfRender'

export interface PageImage {
  mimeType: string
  base64: string
}

// Tra ve anh cua dung vi tri de hien trong modal xem-vi-tri - trang PDF duoc
// render truc tiep tu file goc (khong luu cache, render theo yeu cau), anh
// dinh kem thi doc thang file. docx/pptx khong co cach render layout that
// nen tra null - renderer chi hien khoi text da highlight.
export async function getPageImage(
  attachmentId: string,
  unitType: string,
  unitIndex: number
): Promise<PageImage | null> {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return null

  if (attachment.fileType === 'pdf' && unitType === 'page') {
    const buffer = await renderPdfPageAsPng(attachment.storedPath, unitIndex, RENDER_SCALE)
    return { mimeType: 'image/png', base64: buffer.toString('base64') }
  }

  if (attachment.fileType === 'png' || attachment.fileType === 'jpg' || attachment.fileType === 'jpeg') {
    const buffer = await readFile(attachment.storedPath)
    const mimeType = attachment.fileType === 'png' ? 'image/png' : 'image/jpeg'
    return { mimeType, base64: buffer.toString('base64') }
  }

  return null
}
