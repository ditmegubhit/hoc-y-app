import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type { ExamFile, ExamFileType, ExamExtractionStatus } from '../../../shared/types/examFile'

interface ExamFileRow {
  id: string
  file_name: string
  file_type: string
  stored_path: string
  file_size_bytes: number
  raw_extracted_text: string | null
  extraction_status: string
  created_at: string
}

function mapExamFile(row: ExamFileRow): ExamFile {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type as ExamFileType,
    storedPath: row.stored_path,
    fileSizeBytes: row.file_size_bytes,
    rawExtractedText: row.raw_extracted_text,
    extractionStatus: row.extraction_status as ExamExtractionStatus,
    createdAt: row.created_at
  }
}

export function listExamFiles(): ExamFile[] {
  const rows = getDb()
    .prepare('SELECT * FROM exam_files ORDER BY created_at DESC')
    .all() as ExamFileRow[]
  return rows.map(mapExamFile)
}

export function getExamFile(id: string): ExamFile | null {
  const row = getDb().prepare('SELECT * FROM exam_files WHERE id = ?').get(id) as
    | ExamFileRow
    | undefined
  return row ? mapExamFile(row) : null
}

export function createExamFile(input: {
  fileName: string
  fileType: ExamFileType
  storedPath: string
  fileSizeBytes: number
}): ExamFile {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO exam_files (id, file_name, file_type, stored_path, file_size_bytes, extraction_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, input.fileName, input.fileType, input.storedPath, input.fileSizeBytes)
  return getExamFile(id) as ExamFile
}

export function updateExtraction(
  id: string,
  status: ExamExtractionStatus,
  text: string | null
): void {
  getDb()
    .prepare('UPDATE exam_files SET extraction_status = ?, raw_extracted_text = ? WHERE id = ?')
    .run(status, text, id)
}

export function deleteExamFile(id: string): void {
  getDb().prepare('DELETE FROM exam_files WHERE id = ?').run(id)
}
