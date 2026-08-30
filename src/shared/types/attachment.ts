export type AttachmentFileType = 'pdf' | 'docx' | 'pptx' | 'png' | 'jpg' | 'jpeg' | 'other'
export type ExtractionStatus =
  | 'pending'
  | 'ocr_processing'
  | 'done'
  | 'done_empty'
  | 'failed'
  | 'not_supported'

export interface Attachment {
  id: string
  lessonId: string
  fileName: string
  fileType: AttachmentFileType
  storedPath: string
  fileSizeBytes: number
  extractedText: string | null
  extractionStatus: ExtractionStatus
  createdAt: string
  // Duong dan file goc ngoai app - co thi app tu cap nhat khi file goc doi
  sourcePath: string | null
}
