import { extname } from 'node:path'
import { extractPdfText } from './pdf.extractor'
import { extractDocxText } from './docx.extractor'
import { extractPptxText } from './pptx.extractor'

export type ExtractableFileType = 'pdf' | 'docx' | 'pptx'

export function detectExtractableType(filePath: string): ExtractableFileType | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.pptx') return 'pptx'
  return null
}

export async function extractText(filePath: string, type: ExtractableFileType): Promise<string> {
  switch (type) {
    case 'pdf':
      return extractPdfText(filePath)
    case 'docx':
      return extractDocxText(filePath)
    case 'pptx':
      return extractPptxText(filePath)
  }
}
