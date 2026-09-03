import { dialog } from 'electron'
import { extname } from 'node:path'
import { storeExamFile } from './fileStorage.service'
import { extractText, detectExtractableType } from './textExtraction'
import * as examFilesRepo from '../db/repositories/examFiles.repo'
import type { ExamFile, ExamFileType } from '../../shared/types/examFile'

// .doc/.ppt quy ve 'docx'/'pptx' - xem ghi chu trong attachments.service.ts.
const SUPPORTED: Record<string, ExamFileType> = {
  '.pdf': 'pdf',
  '.doc': 'docx',
  '.docx': 'docx',
  '.ppt': 'pptx',
  '.pptx': 'pptx'
}

export async function pickAndAddExamFile(): Promise<ExamFile | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Đề thi', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const ext = extname(sourcePath).toLowerCase()
  const fileType = SUPPORTED[ext]
  if (!fileType) return null

  const stored = await storeExamFile(sourcePath)
  const examFile = examFilesRepo.createExamFile({
    fileName: stored.fileName,
    fileType,
    storedPath: stored.storedPath,
    fileSizeBytes: stored.fileSizeBytes
  })

  void extractAndSave(examFile.id, stored.storedPath)

  return examFile
}

async function extractAndSave(id: string, storedPath: string): Promise<void> {
  try {
    const type = detectExtractableType(storedPath)
    if (!type) {
      examFilesRepo.updateExtraction(id, 'failed', null)
      return
    }
    const chunks = await extractText(storedPath, type, undefined, id)
    const text = chunks.map((c) => c.text).join('\n\n')
    examFilesRepo.updateExtraction(id, 'done', text)
  } catch (err) {
    console.error('[examFiles] extraction failed:', err)
    examFilesRepo.updateExtraction(id, 'failed', null)
  }
}

export function listExamFiles(): ExamFile[] {
  return examFilesRepo.listExamFiles()
}

export function removeExamFile(id: string): void {
  examFilesRepo.deleteExamFile(id)
}
