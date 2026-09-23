import { getDb } from '../index'
import type { AnatomyEligibility, AnatomyEligibilityStatus } from '../../../shared/types/anatomyQuiz'

interface Row {
  status: AnatomyEligibilityStatus
  image_page_ratio: number | null
  analyzed_pages: number
  total_pages: number
  needs_source_confirmation: number
}

export function getEligibility(attachmentId: string): AnatomyEligibility | null {
  const row = getDb().prepare(
    'SELECT status, image_page_ratio, analyzed_pages, total_pages, needs_source_confirmation FROM anatomy_attachment_eligibility WHERE attachment_id = ?'
  ).get(attachmentId) as Row | undefined
  return row ? {
    status: row.status,
    imagePageRatio: row.image_page_ratio,
    analyzedPages: row.analyzed_pages,
    totalPages: row.total_pages,
    needsSourceConfirmation: row.needs_source_confirmation === 1
  } : null
}

export function markSourceChangedIfMapped(attachmentId: string): void {
  getDb().prepare(
    `UPDATE anatomy_attachment_eligibility SET needs_source_confirmation = 1, updated_at = datetime('now')
     WHERE attachment_id = ? AND EXISTS (SELECT 1 FROM anatomy_questions WHERE attachment_id = ?)`
  ).run(attachmentId, attachmentId)
}

export function resolveSourceChange(attachmentId: string, isSimilar: boolean): void {
  getDb().prepare(
    `UPDATE anatomy_attachment_eligibility
     SET needs_source_confirmation = 0, status = CASE WHEN ? THEN status ELSE 'ineligible' END,
         updated_at = datetime('now') WHERE attachment_id = ?`
  ).run(isSimilar ? 1 : 0, attachmentId)
}

export function saveEligibility(input: {
  attachmentId: string
  status: AnatomyEligibilityStatus
  imagePageRatio?: number | null
  analyzedPages?: number
  totalPages?: number
}): void {
  getDb().prepare(
    `INSERT INTO anatomy_attachment_eligibility
       (attachment_id, status, image_page_ratio, analyzed_pages, total_pages, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(attachment_id) DO UPDATE SET status = excluded.status,
       image_page_ratio = excluded.image_page_ratio,
       analyzed_pages = excluded.analyzed_pages, total_pages = excluded.total_pages,
       updated_at = datetime('now')`
  ).run(
    input.attachmentId, input.status, input.imagePageRatio ?? null,
    input.analyzedPages ?? 0, input.totalPages ?? 0
  )
}
