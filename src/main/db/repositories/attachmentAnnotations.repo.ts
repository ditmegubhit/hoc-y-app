import { getDb } from '../index'
import type { Annotation, AnnotationType, NewAnnotation } from '../../../shared/types/annotation'

interface AnnotationRow {
  id: string
  attachment_id: string
  page_number: number
  type: string
  data: string
  created_at: string
}

function mapAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    pageNumber: row.page_number,
    type: row.type as AnnotationType,
    data: JSON.parse(row.data),
    createdAt: row.created_at
  }
}

export function listAnnotationsByAttachment(attachmentId: string): Annotation[] {
  const rows = getDb()
    .prepare('SELECT * FROM attachment_annotations WHERE attachment_id = ? ORDER BY created_at')
    .all(attachmentId) as AnnotationRow[]
  return rows.map(mapAnnotation)
}

// Luu "Save" ghi de toan bo danh sach annotation cua 1 file - don gian va an
// toan hon dong bo tung thay doi rieng le (xoa het cua attachment nay, chen
// lai dung danh sach hien tai), khop dung voi hanh vi nut Luu (luu 1 lan,
// khong tu dong luu tung net).
export function replaceAnnotations(attachmentId: string, annotations: NewAnnotation[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM attachment_annotations WHERE attachment_id = ?').run(attachmentId)
    const insert = db.prepare(
      `INSERT INTO attachment_annotations (id, attachment_id, page_number, type, data)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const a of annotations) {
      insert.run(a.id, attachmentId, a.pageNumber, a.type, JSON.stringify(a.data))
    }
  })
  tx()
}
