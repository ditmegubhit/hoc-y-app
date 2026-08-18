import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as searchIndexRepo from './searchIndex.repo'
import type {
  Attachment,
  AttachmentFileType,
  ExtractionStatus
} from '../../../shared/types/attachment'

interface AttachmentRow {
  id: string
  lesson_id: string
  file_name: string
  file_type: string
  stored_path: string
  file_size_bytes: number
  extracted_text: string | null
  extraction_status: string
  created_at: string
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    fileName: row.file_name,
    fileType: row.file_type as AttachmentFileType,
    storedPath: row.stored_path,
    fileSizeBytes: row.file_size_bytes,
    extractedText: row.extracted_text,
    extractionStatus: row.extraction_status as ExtractionStatus,
    createdAt: row.created_at
  }
}

export function listAttachmentsByLesson(lessonId: string): Attachment[] {
  const rows = getDb()
    .prepare('SELECT * FROM attachments WHERE lesson_id = ? ORDER BY created_at')
    .all(lessonId) as AttachmentRow[]
  return rows.map(mapAttachment)
}

export function getAttachment(id: string): Attachment | null {
  const row = getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    | AttachmentRow
    | undefined
  return row ? mapAttachment(row) : null
}

export function createAttachment(input: {
  lessonId: string
  fileName: string
  fileType: AttachmentFileType
  storedPath: string
  fileSizeBytes: number
  extractionStatus: ExtractionStatus
}): Attachment {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO attachments (id, lesson_id, file_name, file_type, stored_path, file_size_bytes, extraction_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.lessonId,
    input.fileName,
    input.fileType,
    input.storedPath,
    input.fileSizeBytes,
    input.extractionStatus
  )
  return getAttachment(id) as Attachment
}

export function updateAttachmentExtraction(
  id: string,
  status: ExtractionStatus,
  text: string | null
): void {
  getDb()
    .prepare('UPDATE attachments SET extraction_status = ?, extracted_text = ? WHERE id = ?')
    .run(status, text, id)
}

export function deleteAttachment(id: string): void {
  const db = getDb()
  const deleteTx = db.transaction(() => {
    searchIndexRepo.deleteSearchIndex('attachment', id)
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  })
  deleteTx()
}
