import { extname } from 'node:path'
import { extractPdfText } from './pdf.extractor'
import { extractDocxText } from './docx.extractor'
import { extractPptxText } from './pptx.extractor'
import { extractImageText } from './image.extractor'
import { extractLegacyOfficeText } from './legacyOffice.extractor'

// 'docLegacy'/'pptLegacy' = .doc/.ppt (Office 97-2003, nhi phan OLE) - phai
// xu ly khac .docx/.pptx (zip). Loai file luu trong DB van la 'docx'/'pptx'
// (Word/PowerPoint mo file .doc/.ppt binh thuong nen phan xem/mo tai vi tri
// khong doi), chi rieng buoc trich xuat text di duong chuyen sang PDF.
export type ExtractableFileType = 'pdf' | 'docx' | 'pptx' | 'image' | 'docLegacy' | 'pptLegacy'

// unitType/unitIndex xac dinh vi tri (trang PDF, slide PPTX, hoac toan bo
// tai lieu voi docx/anh) de sau nay tim kiem co the tro thang toi dung noi
// chua tu khoa thay vi chi biet "co trong file nay o dau do".
export interface ExtractedWord {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface ExtractedChunk {
  unitType: 'page' | 'slide' | 'docPage' | 'image'
  unitIndex: number
  text: string
  // words/coordSpace/refWidth/refHeight chi co voi unitType 'page'/'image' -
  // dung de ve khung to mau dung vi tri khi mo file goc (xem highlight/).
  words?: ExtractedWord[]
  coordSpace?: 'pdf_point' | 'image_pixel'
  refWidth?: number
  refHeight?: number
}

export function detectExtractableType(filePath: string): ExtractableFileType | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.pptx') return 'pptx'
  if (ext === '.doc') return 'docLegacy'
  if (ext === '.ppt') return 'pptLegacy'
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return 'image'
  return null
}

// onOcrStart: goi 1 lan khi file bat dau roi vao nhanh OCR fallback (trang/slide
// khong co text layer, hoac anh roi luon OCR truc tiep), de caller cap nhat
// trang thai UI sang 'ocr_processing' truoc khi co ket qua cuoi cung.
// sourceId (attachmentId hoac examFileId) chi can cho .doc/.ppt - dung lam
// khoa cache cho file PDF chuyen doi tu Office.
export async function extractText(
  filePath: string,
  type: ExtractableFileType,
  onOcrStart?: () => void,
  sourceId?: string
): Promise<ExtractedChunk[]> {
  switch (type) {
    case 'pdf':
      return extractPdfText(filePath, onOcrStart)
    case 'docx':
      return extractDocxText(filePath)
    case 'pptx':
      return extractPptxText(filePath, onOcrStart)
    case 'image':
      return extractImageText(filePath, onOcrStart)
    case 'docLegacy':
      return extractLegacyOfficeText(filePath, 'docx', sourceId, onOcrStart)
    case 'pptLegacy':
      return extractLegacyOfficeText(filePath, 'pptx', sourceId, onOcrStart)
  }
}
