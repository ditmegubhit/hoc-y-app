import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type {
  AnatomyCandidateStatus,
  AnatomyLabelCandidate,
  CreateManualCandidateInput,
  Rect,
  UpdateAnatomyCandidateInput
} from '../../../shared/types/anatomyQuiz'

interface CandidateRow {
  id: string
  attachment_id: string
  page_number: number
  raw_text: string
  label_box_json: string
  status: string
  ref_width: number
  ref_height: number
  answer_text: string | null
  accepted_alternates_json: string | null
  confidence: number | null
  crop_box_json: string | null
}

function toCandidate(row: CandidateRow): AnatomyLabelCandidate {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    pageNumber: row.page_number,
    rawText: row.raw_text,
    labelBox: JSON.parse(row.label_box_json) as Rect,
    status: row.status as AnatomyCandidateStatus,
    refWidth: row.ref_width,
    refHeight: row.ref_height,
    answerText: row.answer_text,
    acceptedAlternates: row.accepted_alternates_json
      ? (JSON.parse(row.accepted_alternates_json) as string[])
      : null,
    confidence: row.confidence,
    cropBox: row.crop_box_json ? (JSON.parse(row.crop_box_json) as Rect) : null
  }
}

export interface NewAnatomyLabelCandidate {
  attachmentId: string
  pageNumber: number
  rawText: string
  labelBox: Rect
  refWidth: number
  refHeight: number
  confidence?: number | null
}

// Thay toan bo candidate cua 1 trang bang ket qua do moi nhat - trang duoc mo
// lai trong man hinh soan la coi nhu chay lai thuat toan tu dau, tru cac hang
// da 'confirmed' (giu nguyen, khong ghi de cau hoi da chon roi) hoac
// 'rejected' (giu nguyen de khong hoi lai o nguoi soan da tu choi).
export function replaceDetectedCandidates(
  attachmentId: string,
  pageNumber: number,
  detected: NewAnatomyLabelCandidate[]
): string[] {
  const db = getDb()
  const del = db.prepare(
    `DELETE FROM anatomy_label_candidates
     WHERE attachment_id = ? AND page_number = ? AND status = 'pending'`
  )
  const ins = db.prepare(
    `INSERT INTO anatomy_label_candidates
      (id, attachment_id, page_number, raw_text, label_box_json, ref_width, ref_height, status, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  )

  const ids: string[] = []
  const tx = db.transaction(() => {
    del.run(attachmentId, pageNumber)
    for (const c of detected) {
      const id = randomUUID()
      ids.push(id)
      ins.run(id, c.attachmentId, c.pageNumber, c.rawText, JSON.stringify(c.labelBox), c.refWidth, c.refHeight, c.confidence ?? null)
    }
  })
  tx()
  return ids
}

// Them 1 o do tac gia TU VE tren anh (khong phai thuat toan do ra) - dung khi
// thuat toan bo sot 1 nhan hoac tac gia muon hoi ve 1 vi tri khong co san
// chu thich rieng.
export function createManualCandidate(input: CreateManualCandidateInput): string {
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO anatomy_label_candidates
        (id, attachment_id, page_number, raw_text, label_box_json, ref_width, ref_height, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
    .run(
      id,
      input.attachmentId,
      input.pageNumber,
      input.rawText,
      JSON.stringify(input.labelBox),
      input.refWidth,
      input.refHeight
    )
  return id
}

// LEFT JOIN sang anatomy_questions de tra kem dap an da luu (neu candidate da
// confirmed) - dung de nap san form khi lui lai xem/sua 1 vung da xong trong
// man hinh "Cap nhat cau hoi GP".
export function listCandidatesForPage(
  attachmentId: string,
  pageNumber: number
): AnatomyLabelCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, q.answer_text, q.accepted_alternates_json
       FROM anatomy_label_candidates c
       LEFT JOIN anatomy_questions q ON q.candidate_id = c.id
       WHERE c.attachment_id = ? AND c.page_number = ?
       ORDER BY c.created_at`
    )
    .all(attachmentId, pageNumber) as CandidateRow[]
  return rows.map(toCandidate)
}

// Toan bo box tren trang (moi trang thai) - dung khi chot mask_boxes_json luc
// xac nhan cau hoi: chu cua nhan bi tu choi/chua xac dinh van phai bi che.
export function listAllLabelBoxesForPage(attachmentId: string, pageNumber: number): Rect[] {
  const rows = getDb()
    .prepare(
      `SELECT label_box_json FROM anatomy_label_candidates
       WHERE attachment_id = ? AND page_number = ?`
    )
    .all(attachmentId, pageNumber) as { label_box_json: string }[]
  return rows.map((r) => JSON.parse(r.label_box_json) as Rect)
}

export function getCandidate(candidateId: string): AnatomyLabelCandidate | null {
  const row = getDb()
    .prepare('SELECT * FROM anatomy_label_candidates WHERE id = ?')
    .get(candidateId) as CandidateRow | undefined
  return row ? toCandidate(row) : null
}

export function updateCandidate(input: UpdateAnatomyCandidateInput): void {
  const db = getDb()
  const current = getCandidate(input.candidateId)
  if (!current) return

  const rawText = input.rawText ?? current.rawText
  const labelBox = input.labelBox ?? current.labelBox
  const cropBox = input.cropBox === undefined ? current.cropBox : input.cropBox

  db.prepare(
    `UPDATE anatomy_label_candidates
     SET raw_text = ?, label_box_json = ?, crop_box_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(rawText, JSON.stringify(labelBox), cropBox ? JSON.stringify(cropBox) : null, input.candidateId)
}

export function setPageReview(input: { attachmentId: string; pageNumber: number; reviewed?: boolean; excluded?: boolean }): void {
  const current = getDb().prepare(
    'SELECT reviewed, excluded FROM anatomy_page_reviews WHERE attachment_id = ? AND page_number = ?'
  ).get(input.attachmentId, input.pageNumber) as { reviewed: number; excluded: number } | undefined
  getDb().prepare(
    `INSERT INTO anatomy_page_reviews (attachment_id, page_number, reviewed, excluded, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(attachment_id, page_number) DO UPDATE SET
       reviewed = excluded.reviewed, excluded = excluded.excluded, updated_at = datetime('now')`
  ).run(
    input.attachmentId,
    input.pageNumber,
    input.reviewed === undefined ? (current?.reviewed ?? 0) : input.reviewed ? 1 : 0,
    input.excluded === undefined ? (current?.excluded ?? 0) : input.excluded ? 1 : 0
  )
}

export function getPageReview(attachmentId: string, pageNumber: number): { reviewed: boolean; excluded: boolean } {
  const row = getDb().prepare(
    'SELECT reviewed, excluded FROM anatomy_page_reviews WHERE attachment_id = ? AND page_number = ?'
  ).get(attachmentId, pageNumber) as { reviewed: number; excluded: number } | undefined
  return { reviewed: row?.reviewed === 1, excluded: row?.excluded === 1 }
}

export function setCandidateStatus(candidateId: string, status: AnatomyCandidateStatus): void {
  getDb()
    .prepare(
      `UPDATE anatomy_label_candidates SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(status, candidateId)
}

// Xoa han khoi DB - dung khi "Sua vung" go bo 1 o ve sai/du/gop nham (khac
// voi setCandidateStatus('rejected'), vi o van con hang trong bang va van bi
// ve mask den o man hinh dien dap an, chi la khong con duoc hoi trong bai thi).
export function deleteCandidate(candidateId: string): void {
  getDb().prepare('DELETE FROM anatomy_label_candidates WHERE id = ?').run(candidateId)
}
