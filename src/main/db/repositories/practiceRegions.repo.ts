import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import { normalizeHexColor } from '../../../shared/practice/maskColor'
import { decideAutoDraft, normalizedOverlapRatio, type DetectedRegion } from '../../services/practice/autoDraft'
import type {
  CreatePracticeRegionInput,
  PracticePageState,
  PracticeRegion,
  PracticeRegionPatch,
  PracticeRegionStatus,
  Rect,
  SetPracticePageReviewInput
} from '../../../shared/types/practice'

interface RegionRow {
  id: string
  file_id: string
  page_number: number
  label_box_json: string
  ref_width: number
  ref_height: number
  raw_text: string
  answer_text: string | null
  alternates_json: string
  crop_box_json: string | null
  confidence: number | null
  leader_score: number | null
  suspect: number
  suspect_reasons_json?: string | null
  status: PracticeRegionStatus
  reviewed: number
  color_override: string | null
  opacity_override: number | null
  manual: number
  created_at: string
  updated_at: string
}

export function mapRegion(row: RegionRow): PracticeRegion {
  return {
    id: row.id,
    fileId: row.file_id,
    pageNumber: row.page_number,
    labelBox: JSON.parse(row.label_box_json) as Rect,
    refWidth: row.ref_width,
    refHeight: row.ref_height,
    rawText: row.raw_text,
    answerText: row.answer_text,
    alternates: JSON.parse(row.alternates_json) as string[],
    cropBox: row.crop_box_json ? (JSON.parse(row.crop_box_json) as Rect) : null,
    confidence: row.confidence,
    leaderScore: row.leader_score,
    suspect: row.suspect === 1,
    suspectReasons: row.suspect_reasons_json ? (JSON.parse(row.suspect_reasons_json) as string[]) : [],
    status: row.status,
    reviewed: row.reviewed === 1,
    colorOverride: row.color_override,
    opacityOverride: row.opacity_override,
    manual: row.manual === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ---------- Doc ----------

export function getRegion(id: string): PracticeRegion | null {
  const row = getDb().prepare('SELECT * FROM practice_regions WHERE id = ?').get(id) as RegionRow | undefined
  return row ? mapRegion(row) : null
}

export function listRegionsForPage(fileId: string, pageNumber: number): PracticeRegion[] {
  const rows = getDb()
    .prepare('SELECT * FROM practice_regions WHERE file_id = ? AND page_number = ? ORDER BY created_at, rowid')
    .all(fileId, pageNumber) as RegionRow[]
  return rows.map(mapRegion)
}

export function listRegionsForFile(fileId: string): PracticeRegion[] {
  const rows = getDb()
    .prepare('SELECT * FROM practice_regions WHERE file_id = ? ORDER BY page_number, created_at, rowid')
    .all(fileId) as RegionRow[]
  return rows.map(mapRegion)
}

// ---------- Ghi ----------

function assertConfirmable(status: PracticeRegionStatus, answerText: string | null): void {
  if (status === 'confirmed' && (answerText ?? '').trim() === '') {
    throw new Error('Vùng làm câu hỏi cần có đáp án.')
  }
}

function cleanColor(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = normalizeHexColor(value)
  if (!normalized) throw new Error('Màu không hợp lệ.')
  return normalized
}

function cleanOpacity(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Math.min(1, Math.max(0, value))
}

/** Nguoi dung tu ve 1 vung (manual = 1, duoc bao ve khi quet lai). */
export function createRegion(input: CreatePracticeRegionInput): PracticeRegion {
  const status = input.status ?? 'pending'
  const answerText = input.answerText?.trim() ? input.answerText.trim() : null
  assertConfirmable(status, answerText)
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO practice_regions
        (id, file_id, page_number, label_box_json, ref_width, ref_height, raw_text, answer_text,
         alternates_json, crop_box_json, status, reviewed, manual)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, 1)`
    )
    .run(
      id, input.fileId, input.pageNumber, JSON.stringify(input.labelBox), input.refWidth, input.refHeight,
      answerText, JSON.stringify(input.alternates ?? []),
      input.cropBox ? JSON.stringify(input.cropBox) : null, status, input.reviewed ? 1 : 0
    )
  return getRegion(id) as PracticeRegion
}

/** Dua lai 1 vung da xoa (hoan tac) - giu nguyen id va moi truong. */
export function restoreRegion(region: PracticeRegion): PracticeRegion {
  assertConfirmable(region.status, region.answerText)
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO practice_regions
        (id, file_id, page_number, label_box_json, ref_width, ref_height, raw_text, answer_text,
         alternates_json, crop_box_json, confidence, leader_score, suspect, suspect_reasons_json, status, reviewed,
         color_override, opacity_override, manual, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      region.id, region.fileId, region.pageNumber, JSON.stringify(region.labelBox), region.refWidth,
      region.refHeight, region.rawText, region.answerText, JSON.stringify(region.alternates),
      region.cropBox ? JSON.stringify(region.cropBox) : null, region.confidence, region.leaderScore,
      region.suspect ? 1 : 0, JSON.stringify(region.suspectReasons ?? []), region.status, region.reviewed ? 1 : 0,
      cleanColor(region.colorOverride), cleanOpacity(region.opacityOverride), region.manual ? 1 : 0,
      region.createdAt
    )
  return getRegion(region.id) as PracticeRegion
}

export function updateRegion(id: string, patch: PracticeRegionPatch): PracticeRegion {
  const current = getRegion(id)
  if (!current) throw new Error('Không tìm thấy vùng.')

  const answerText = patch.answerText === undefined
    ? current.answerText
    : (patch.answerText?.trim() ? patch.answerText.trim() : null)
  const status = patch.status ?? current.status
  assertConfirmable(status, answerText)

  const labelBox = patch.labelBox ?? current.labelBox
  const cropBox = patch.cropBox === undefined ? current.cropBox : patch.cropBox
  const alternates = patch.alternates === undefined
    ? current.alternates
    : patch.alternates.map((a) => a.trim()).filter(Boolean)
  const colorOverride = patch.colorOverride === undefined ? current.colorOverride : cleanColor(patch.colorOverride)
  const opacityOverride = patch.opacityOverride === undefined ? current.opacityOverride : cleanOpacity(patch.opacityOverride)

  getDb()
    .prepare(
      `UPDATE practice_regions SET
         label_box_json = ?, crop_box_json = ?, raw_text = ?, answer_text = ?, alternates_json = ?,
         status = ?, reviewed = ?, color_override = ?, opacity_override = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      JSON.stringify(labelBox), cropBox ? JSON.stringify(cropBox) : null, patch.rawText ?? current.rawText,
      answerText, JSON.stringify(alternates), status,
      (patch.reviewed ?? current.reviewed) ? 1 : 0, colorOverride, opacityOverride, id
    )
  return getRegion(id) as PracticeRegion
}

/** Xoa that (khong phai 'rejected'). */
export function deleteRegion(id: string): void {
  getDb().prepare('DELETE FROM practice_regions WHERE id = ?').run(id)
}

// ---------- Ket qua quet ----------

export interface NewDetectedRegion extends DetectedRegion {
  pageNumber: number
}

/** Vung duoc bao ve khi quet lai: da duyet, tu ve, hoac nguoi dung da danh dau "chi che". */
export function isProtectedRegion(region: Pick<PracticeRegion, 'reviewed' | 'manual' | 'status'>): boolean {
  return region.reviewed || region.manual || region.status === 'rejected'
}

/**
 * Thay cac vung CHUA duyet cua 1 trang bang ket qua do moi, giu nguyen vung duoc
 * bao ve (xem isProtectedRegion) va bo qua vung moi chong len vung bao ve >= 70%
 * (so theo toa do chuan hoa, phong khi doi do phan giai). Vung moi duoc nhap tu
 * dong theo decideAutoDraft. Tra ve id cac vung moi them.
 */
export function replaceDetectedRegions(fileId: string, pageNumber: number, detected: NewDetectedRegion[]): string[] {
  const db = getDb()
  const ids: string[] = []
  const insert = db.prepare(
    `INSERT INTO practice_regions
      (id, file_id, page_number, label_box_json, ref_width, ref_height, raw_text, answer_text,
       alternates_json, confidence, leader_score, suspect, suspect_reasons_json, status, reviewed, manual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
  )
  const tx = db.transaction(() => {
    const existing = listRegionsForPage(fileId, pageNumber)
    const retained = existing.filter(isProtectedRegion)
    const removable = existing.filter((r) => !isProtectedRegion(r))
    const del = db.prepare('DELETE FROM practice_regions WHERE id = ?')
    for (const region of removable) del.run(region.id)

    for (const region of detected) {
      const overlapsRetained = retained.some((old) =>
        normalizedOverlapRatio(
          { box: old.labelBox, refWidth: old.refWidth, refHeight: old.refHeight },
          { box: region.labelBox, refWidth: region.refWidth, refHeight: region.refHeight }
        ) >= 0.7)
      if (overlapsRetained) continue
      const decision = decideAutoDraft(region)
      const id = randomUUID()
      ids.push(id)
      insert.run(
        id, fileId, pageNumber, JSON.stringify(region.labelBox), region.refWidth, region.refHeight,
        region.rawText, decision.answerText, JSON.stringify(decision.alternates),
        region.confidence, region.leaderScore ?? null, region.suspect ? 1 : 0,
        JSON.stringify(region.suspectReasons ?? []), decision.status
      )
    }
  })
  tx()
  return ids
}

// ---------- Trang ----------

export function setPageReview(input: SetPracticePageReviewInput): void {
  const current = getDb()
    .prepare('SELECT reviewed, excluded FROM practice_page_reviews WHERE file_id = ? AND page_number = ?')
    .get(input.fileId, input.pageNumber) as { reviewed: number; excluded: number } | undefined
  getDb()
    .prepare(
      `INSERT INTO practice_page_reviews (file_id, page_number, reviewed, excluded, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(file_id, page_number) DO UPDATE SET
         reviewed = excluded.reviewed, excluded = excluded.excluded, updated_at = datetime('now')`
    )
    .run(
      input.fileId, input.pageNumber,
      input.reviewed === undefined ? (current?.reviewed ?? 0) : input.reviewed ? 1 : 0,
      input.excluded === undefined ? (current?.excluded ?? 0) : input.excluded ? 1 : 0
    )
}

/** Cac trang co ghi nhan duyet/loai (trang khong co dong nao = chua duyet, khong loai). */
export function listPageStates(fileId: string): PracticePageState[] {
  const rows = getDb()
    .prepare('SELECT page_number, reviewed, excluded FROM practice_page_reviews WHERE file_id = ? ORDER BY page_number')
    .all(fileId) as { page_number: number; reviewed: number; excluded: number }[]
  return rows.map((r) => ({ pageNumber: r.page_number, reviewed: r.reviewed === 1, excluded: r.excluded === 1 }))
}
