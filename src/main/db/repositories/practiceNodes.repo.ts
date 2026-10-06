import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import { normalizeHexColor } from '../../../shared/practice/maskColor'
import type {
  PracticeFile,
  PracticeFileSummary,
  PracticeNode,
  PracticeNodeKind,
  PracticeScanState,
  PracticeScanStatus,
  PracticeTreeNode,
  ResetPracticeRegionColorsInput,
  UpdatePracticeFileSettingsInput
} from '../../../shared/types/practice'

interface NodeRow {
  id: string
  parent_id: string | null
  kind: PracticeNodeKind
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

interface TreeRow extends NodeRow {
  file_size_bytes: number | null
  total_pages: number | null
  scan_status: PracticeScanStatus | null
  scan_completed: number | null
  needs_source_confirmation: number | null
  region_count: number | null
  confirmed_count: number | null
}

export interface PracticeFileRow {
  node_id: string
  stored_path: string
  file_size_bytes: number
  source_path: string | null
  source_mtime_ms: number | null
  needs_source_confirmation: number
  mask_color: string
  mask_opacity: number
  scan_status: PracticeScanStatus
  total_pages: number | null
  scan_last_page: number
  scan_completed: number
  created_at: string
  updated_at: string
}

function mapNode(row: NodeRow): PracticeNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapTreeNode(row: TreeRow): PracticeTreeNode {
  const file: PracticeFileSummary | null =
    row.kind === 'file'
      ? {
          fileSizeBytes: row.file_size_bytes ?? 0,
          totalPages: row.total_pages,
          scanStatus: row.scan_status ?? 'none',
          scanCompleted: row.scan_completed === 1,
          needsSourceConfirmation: row.needs_source_confirmation === 1,
          regionCount: row.region_count ?? 0,
          confirmedCount: row.confirmed_count ?? 0
        }
      : null
  return { ...mapNode(row), file }
}

const TREE_SELECT = `
  SELECT n.*, f.file_size_bytes, f.total_pages, f.scan_status, f.scan_completed,
         f.needs_source_confirmation,
         (SELECT COUNT(*) FROM practice_regions r WHERE r.file_id = n.id) AS region_count,
         (SELECT COUNT(*) FROM practice_regions r WHERE r.file_id = n.id AND r.status = 'confirmed') AS confirmed_count
  FROM practice_nodes n
  LEFT JOIN practice_files f ON f.node_id = n.id`

// ---------- Cay ----------

export function listTreeNodes(): PracticeTreeNode[] {
  const rows = getDb()
    .prepare(`${TREE_SELECT} ORDER BY n.sort_order, n.name`)
    .all() as TreeRow[]
  return rows.map(mapTreeNode)
}

export function getTreeNode(id: string): PracticeTreeNode | null {
  const row = getDb().prepare(`${TREE_SELECT} WHERE n.id = ?`).get(id) as TreeRow | undefined
  return row ? mapTreeNode(row) : null
}

export function getNode(id: string): PracticeNode | null {
  const row = getDb().prepare('SELECT * FROM practice_nodes WHERE id = ?').get(id) as NodeRow | undefined
  return row ? mapNode(row) : null
}

function assertParentIsFolder(parentId: string | null): void {
  if (parentId === null) return
  const parent = getNode(parentId)
  if (!parent) throw new Error('Không tìm thấy thư mục cha.')
  if (parent.kind !== 'folder') throw new Error('Chỉ có thể đặt vào thư mục, không đặt vào file.')
}

function nextSortOrder(parentId: string | null): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM practice_nodes WHERE parent_id IS ?')
    .get(parentId) as { n: number }
  return row.n
}

export function createFolder(parentId: string | null, name: string): PracticeTreeNode {
  assertParentIsFolder(parentId)
  const id = randomUUID()
  getDb()
    .prepare("INSERT INTO practice_nodes (id, parent_id, kind, name, sort_order) VALUES (?, ?, 'folder', ?, ?)")
    .run(id, parentId, name, nextSortOrder(parentId))
  return getTreeNode(id) as PracticeTreeNode
}

export interface NewPracticeFile {
  parentId: string | null
  name: string
  storedPath: string
  fileSizeBytes: number
  sourcePath: string | null
  sourceMtimeMs: number | null
  totalPages: number | null
}

export function createFileNode(input: NewPracticeFile): PracticeTreeNode {
  assertParentIsFolder(input.parentId)
  const db = getDb()
  const id = randomUUID()
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO practice_nodes (id, parent_id, kind, name, sort_order) VALUES (?, ?, 'file', ?, ?)")
      .run(id, input.parentId, input.name, nextSortOrder(input.parentId))
    db.prepare(
      `INSERT INTO practice_files
        (node_id, stored_path, file_size_bytes, source_path, source_mtime_ms, total_pages)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.storedPath, input.fileSizeBytes, input.sourcePath, input.sourceMtimeMs, input.totalPages)
  })
  tx()
  return getTreeNode(id) as PracticeTreeNode
}

export function renameNode(id: string, name: string): PracticeTreeNode {
  const result = getDb()
    .prepare("UPDATE practice_nodes SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, id)
  if (result.changes === 0) throw new Error('Không tìm thấy mục cần đổi tên.')
  return getTreeNode(id) as PracticeTreeNode
}

function wouldCreateCycle(nodeId: string, newParentId: string | null): boolean {
  let current = newParentId
  let guard = 0
  while (current && guard++ < 1000) {
    if (current === nodeId) return true
    const row = getDb().prepare('SELECT parent_id FROM practice_nodes WHERE id = ?').get(current) as
      | { parent_id: string | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return false
}

/** Chuyen node sang parent moi, chen vao vi tri `index` (khong co = cuoi), danh lai sort_order 0..n-1. */
export function moveNode(id: string, parentId: string | null, index?: number): PracticeTreeNode {
  const db = getDb()
  const node = getNode(id)
  if (!node) throw new Error('Không tìm thấy mục cần di chuyển.')
  assertParentIsFolder(parentId)
  if (parentId === id || wouldCreateCycle(id, parentId)) {
    throw new Error('Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó.')
  }
  const tx = db.transaction(() => {
    const siblings = (db
      .prepare('SELECT id FROM practice_nodes WHERE parent_id IS ? AND id != ? ORDER BY sort_order, name')
      .all(parentId, id) as { id: string }[]).map((r) => r.id)
    const at = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length))
    siblings.splice(at, 0, id)
    db.prepare("UPDATE practice_nodes SET parent_id = ?, updated_at = datetime('now') WHERE id = ?").run(parentId, id)
    const setOrder = db.prepare('UPDATE practice_nodes SET sort_order = ? WHERE id = ?')
    siblings.forEach((siblingId, i) => setOrder.run(i, siblingId))
  })
  tx()
  return getTreeNode(id) as PracticeTreeNode
}

/** Duong dan ban sao trong kho cua node va moi file con chau (de xoa tep sau khi xoa DB). */
export function collectStoredPaths(rootId: string): { fileId: string; storedPath: string }[] {
  return getDb()
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM practice_nodes WHERE id = ?
         UNION ALL
         SELECT n.id FROM practice_nodes n JOIN sub ON n.parent_id = sub.id
       )
       SELECT f.node_id AS fileId, f.stored_path AS storedPath
       FROM practice_files f JOIN sub ON sub.id = f.node_id`
    )
    .all(rootId) as { fileId: string; storedPath: string }[]
}

/** Xoa node (CASCADE xoa con chau, vung, de, luot thi). Tra ve cac tep can xoa khoi kho. */
export function deleteNode(id: string): { fileId: string; storedPath: string }[] {
  const stored = collectStoredPaths(id)
  getDb().prepare('DELETE FROM practice_nodes WHERE id = ?').run(id)
  return stored
}

// ---------- File ----------

export function getFile(fileId: string): PracticeFile | null {
  const row = getDb()
    .prepare(
      `SELECT f.*, n.name AS name,
         (SELECT COUNT(*) FROM practice_regions r WHERE r.file_id = f.node_id) AS region_count,
         (SELECT COUNT(*) FROM practice_regions r WHERE r.file_id = f.node_id AND r.status = 'confirmed') AS confirmed_count
       FROM practice_files f JOIN practice_nodes n ON n.id = f.node_id WHERE f.node_id = ?`
    )
    .get(fileId) as (PracticeFileRow & { name: string; region_count: number; confirmed_count: number }) | undefined
  if (!row) return null
  return {
    id: row.node_id,
    name: row.name,
    fileSizeBytes: row.file_size_bytes,
    sourcePath: row.source_path,
    needsSourceConfirmation: row.needs_source_confirmation === 1,
    maskColor: row.mask_color,
    maskOpacity: row.mask_opacity,
    scanStatus: row.scan_status,
    totalPages: row.total_pages,
    scanLastPage: row.scan_last_page,
    scanCompleted: row.scan_completed === 1,
    regionCount: row.region_count,
    confirmedCount: row.confirmed_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getStoredPath(fileId: string): string | null {
  const row = getDb().prepare('SELECT stored_path FROM practice_files WHERE node_id = ?').get(fileId) as
    | { stored_path: string }
    | undefined
  return row?.stored_path ?? null
}

export function getFileRow(fileId: string): PracticeFileRow | null {
  return (getDb().prepare('SELECT * FROM practice_files WHERE node_id = ?').get(fileId) as PracticeFileRow | undefined) ?? null
}

export function updateFileSettings(input: UpdatePracticeFileSettingsInput): PracticeFile {
  const current = getFile(input.fileId)
  if (!current) throw new Error('Không tìm thấy file.')
  let color = current.maskColor
  if (input.maskColor !== undefined) {
    const normalized = normalizeHexColor(input.maskColor)
    if (!normalized) throw new Error('Màu che không hợp lệ.')
    color = normalized
  }
  const opacity = input.maskOpacity === undefined ? current.maskOpacity : Math.min(1, Math.max(0, input.maskOpacity))
  getDb()
    .prepare("UPDATE practice_files SET mask_color = ?, mask_opacity = ?, updated_at = datetime('now') WHERE node_id = ?")
    .run(color, opacity, input.fileId)
  return getFile(input.fileId) as PracticeFile
}

/** Bo mau (va tuy chon do mo) rieng cua moi vung trong file. Tra ve so vung bi doi. */
export function resetRegionColors(input: ResetPracticeRegionColorsInput): number {
  const sql = input.includeOpacity
    ? `UPDATE practice_regions SET color_override = NULL, opacity_override = NULL, updated_at = datetime('now')
       WHERE file_id = ? AND (color_override IS NOT NULL OR opacity_override IS NOT NULL)`
    : `UPDATE practice_regions SET color_override = NULL, updated_at = datetime('now')
       WHERE file_id = ? AND color_override IS NOT NULL`
  return getDb().prepare(sql).run(input.fileId).changes
}

// ---------- Trang thai quet ----------

export function getScanState(fileId: string): PracticeScanState | null {
  const row = getFileRow(fileId)
  if (!row) return null
  return {
    fileId,
    status: row.scan_status,
    lastPage: row.scan_last_page,
    totalPages: row.total_pages,
    completed: row.scan_completed === 1,
    running: false
  }
}

export function saveScanState(
  fileId: string,
  state: { status: PracticeScanStatus; lastPage: number; totalPages: number | null; completed: boolean }
): void {
  getDb()
    .prepare(
      `UPDATE practice_files SET scan_status = ?, scan_last_page = ?, total_pages = ?, scan_completed = ?,
         updated_at = datetime('now') WHERE node_id = ?`
    )
    .run(state.status, state.lastPage, state.totalPages, state.completed ? 1 : 0, fileId)
}

/** Dung khi khoi dong: luot quet bi gian doan (app tat) chuyen ve 'failed' de co the tiep tuc. */
export function markInterruptedScansFailed(): void {
  getDb().prepare("UPDATE practice_files SET scan_status = 'failed' WHERE scan_status = 'scanning'").run()
}

// ---------- Dong bo file goc ----------

export interface SyncablePracticeFile {
  fileId: string
  storedPath: string
  sourcePath: string
  sourceMtimeMs: number | null
}

export function listSyncableFiles(): SyncablePracticeFile[] {
  const rows = getDb()
    .prepare('SELECT node_id, stored_path, source_path, source_mtime_ms FROM practice_files WHERE source_path IS NOT NULL')
    .all() as { node_id: string; stored_path: string; source_path: string; source_mtime_ms: number | null }[]
  return rows.map((r) => ({
    fileId: r.node_id,
    storedPath: r.stored_path,
    sourcePath: r.source_path,
    sourceMtimeMs: r.source_mtime_ms
  }))
}

export function hasRegions(fileId: string): boolean {
  return getDb().prepare('SELECT 1 FROM practice_regions WHERE file_id = ? LIMIT 1').get(fileId) !== undefined
}

/** Ghi ban sao moi sau khi file goc doi. Co vung -> bat co can xac nhan; chua co -> dua trang thai quet ve ban dau. */
export function replaceStoredFile(
  fileId: string,
  update: { storedPath: string; fileSizeBytes: number; sourceMtimeMs: number | null; totalPages: number | null }
): void {
  const keep = hasRegions(fileId) ? 1 : 0
  getDb()
    .prepare(
      `UPDATE practice_files SET stored_path = ?, file_size_bytes = ?, source_mtime_ms = ?, total_pages = ?,
         needs_source_confirmation = CASE WHEN ? = 1 THEN 1 ELSE needs_source_confirmation END,
         scan_status = CASE WHEN ? = 1 THEN scan_status ELSE 'none' END,
         scan_last_page = CASE WHEN ? = 1 THEN scan_last_page ELSE 0 END,
         scan_completed = CASE WHEN ? = 1 THEN scan_completed ELSE 0 END,
         updated_at = datetime('now')
       WHERE node_id = ?`
    )
    .run(update.storedPath, update.fileSizeBytes, update.sourceMtimeMs, update.totalPages, keep, keep, keep, keep, fileId)
}

/** Nguoi dung tra loi "giong 90% file goc?". Khong giong = bo het vung/de cu, de quet lai tu dau. */
export function resolveSourceChange(fileId: string, isSimilar: boolean): void {
  const db = getDb()
  const tx = db.transaction(() => {
    if (!isSimilar) {
      db.prepare('DELETE FROM practice_regions WHERE file_id = ?').run(fileId)
      db.prepare('DELETE FROM practice_page_reviews WHERE file_id = ?').run(fileId)
      db.prepare('DELETE FROM practice_station_sets WHERE file_id = ?').run(fileId)
      db.prepare(
        "UPDATE practice_files SET scan_status = 'none', scan_last_page = 0, scan_completed = 0 WHERE node_id = ?"
      ).run(fileId)
    }
    db.prepare(
      "UPDATE practice_files SET needs_source_confirmation = 0, updated_at = datetime('now') WHERE node_id = ?"
    ).run(fileId)
  })
  tx()
}
