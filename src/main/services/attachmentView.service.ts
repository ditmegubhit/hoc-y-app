import { readFile } from 'node:fs/promises'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import { renderPdfPageAsPng, getPdfPageCount, RENDER_SCALE } from './textExtraction/pdfRender'
import { ensureOfficePdf } from './officeConvert.service'
import type { Attachment } from '../../shared/types/attachment'

export interface PageImage {
  mimeType: string
  base64: string
}

// Voi PDF: dung thang file goc. Voi docx/pptx: chuyen doi (co cache) sang
// PDF bang chinh Word/PowerPoint COM automation roi dung lai duong dan do -
// xem officeConvert.service.ts. Tra null neu khong ap dung duoc (anh, hoac
// chuyen doi that bai) de goi noi tu quyet dinh fallback.
async function resolveRenderablePdfPath(attachment: Attachment): Promise<string | null> {
  if (attachment.fileType === 'pdf') return attachment.storedPath
  if (attachment.fileType === 'docx' || attachment.fileType === 'pptx') {
    return ensureOfficePdf(attachment.id, attachment.storedPath, attachment.fileType)
  }
  return null
}

// Tra ve anh cua dung vi tri de hien trong modal xem-vi-tri (unitType 'page'
// cho PDF/docx/pptx da chuyen doi) hoac anh dinh kem (unitType bat ky, doc
// thang file). Luu y: modal xem ket qua tim kiem (SearchResultViewerModal)
// goi ham nay voi unitType khac ('docPage'/'slide') cho docx/pptx - khong bi
// anh huong boi nhanh 'page' o day.
export async function getPageImage(
  attachmentId: string,
  unitType: string,
  unitIndex: number
): Promise<PageImage | null> {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return null

  if (unitType === 'page') {
    const pdfPath = await resolveRenderablePdfPath(attachment)
    if (pdfPath) {
      const buffer = await renderPdfPageAsPng(pdfPath, unitIndex, RENDER_SCALE)
      return { mimeType: 'image/png', base64: buffer.toString('base64') }
    }
  }

  if (attachment.fileType === 'png' || attachment.fileType === 'jpg' || attachment.fileType === 'jpeg') {
    const buffer = await readFile(attachment.storedPath)
    const mimeType = attachment.fileType === 'png' ? 'image/png' : 'image/jpeg'
    return { mimeType, base64: buffer.toString('base64') }
  }

  return null
}

// Dung cho panel xem file: biet truoc tong so trang de cuon lien tuc,
// lazy-load anh tung trang qua getPageImage khi cuon toi.
export async function getPageCount(attachmentId: string): Promise<number | null> {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return null
  const pdfPath = await resolveRenderablePdfPath(attachment)
  if (!pdfPath) return null
  return getPdfPageCount(pdfPath)
}
