import { ensureOfficePdf } from '../officeConvert.service'
import { extractPdfText } from './pdf.extractor'
import type { ExtractedChunk } from './index'

// Word 97-2003 (.doc) va PowerPoint 97-2003 (.ppt) la dinh dang nhi phan OLE
// cu - KHONG phai zip, nen khong doc duoc bang JSZip nhu .docx/.pptx. Cach
// tin cay nhat (khong them code COM moi): nho chinh Word/PowerPoint chuyen
// sang PDF (da co san ha tang, xem officeConvert.service.ts) roi trich xuat
// text tu PDF do - dung luon nhanh OCR fallback cua pdf.extractor cho trang
// chi co anh. PDF chuyen doi duoc cache theo sourceId nen panel xem file sau
// do tai su dung dung file nay, khong chuyen doi lai.
export async function extractLegacyOfficeText(
  filePath: string,
  appType: 'docx' | 'pptx',
  sourceId: string | undefined,
  onOcrStart?: () => void
): Promise<ExtractedChunk[]> {
  if (!sourceId) {
    throw new Error('extractLegacyOfficeText cần sourceId để cache PDF chuyển đổi')
  }
  const pdfPath = await ensureOfficePdf(sourceId, filePath, appType)
  if (!pdfPath) {
    throw new Error('Không chuyển đổi được file Office định dạng cũ sang PDF để trích xuất')
  }
  return extractPdfText(pdfPath, onOcrStart)
}
