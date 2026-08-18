export type ExamFileType = 'pdf' | 'docx' | 'pptx'
export type ExamExtractionStatus = 'pending' | 'done' | 'failed'

export interface ExamFile {
  id: string
  fileName: string
  fileType: ExamFileType
  storedPath: string
  fileSizeBytes: number
  rawExtractedText: string | null
  extractionStatus: ExamExtractionStatus
  createdAt: string
}
