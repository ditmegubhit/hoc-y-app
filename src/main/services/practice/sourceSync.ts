import { stat } from 'node:fs/promises'
import * as nodesRepo from '../../db/repositories/practiceNodes.repo'
import { getPdfPageCount } from '../textExtraction/pdfRender'
import { deleteStoredPracticeFile, notifyPracticeFilesUpdated, storePracticeFile } from './practiceStorage'
import type { PracticeSourceStatus } from '../../../shared/types/practice'

// Dong bo voi file goc ngoai app (giong attachments.service.ts): file goc doi
// -> chep ban moi vao kho. Neu file da co vung (cau hoi/che) thi bat co
// needs_source_confirmation de hoi nguoi dung "giong 90% file goc khong?"
// (xem resolveSourceChange trong practiceNodes.repo.ts).

const syncing = new Set<string>()
let lastFullSyncMs = 0
const FULL_SYNC_MIN_INTERVAL_MS = 15_000

async function syncOne(row: nodesRepo.SyncablePracticeFile): Promise<boolean> {
  if (syncing.has(row.fileId)) return false
  syncing.add(row.fileId)
  try {
    const st = await stat(row.sourcePath).catch(() => null)
    if (!st) return false // file goc bi di chuyen/xoa - giu ban sao hien co
    if (row.sourceMtimeMs != null && st.mtimeMs <= row.sourceMtimeMs) return false // chua doi

    const fresh = await storePracticeFile(row.sourcePath)
    let totalPages: number | null = null
    try {
      totalPages = await getPdfPageCount(fresh.storedPath)
    } catch {
      // File goc dang bi ghi do/hong: bo ban sao moi, giu ban cu, thu lai lan sau.
      await deleteStoredPracticeFile(fresh.storedPath)
      return false
    }
    nodesRepo.replaceStoredFile(row.fileId, {
      storedPath: fresh.storedPath,
      fileSizeBytes: fresh.fileSizeBytes,
      sourceMtimeMs: st.mtimeMs,
      totalPages
    })
    await deleteStoredPracticeFile(row.storedPath)
    notifyPracticeFilesUpdated(row.fileId)
    return true
  } catch (error) {
    console.error('[practice] sync failed for', row.sourcePath, error)
    return false
  } finally {
    syncing.delete(row.fileId)
  }
}

/** Kiem tra 1 file ngay bay gio. Tra ve true neu da cap nhat tu file goc. */
export async function syncPracticeFile(fileId: string): Promise<boolean> {
  const row = nodesRepo.getFileRow(fileId)
  if (!row || !row.source_path) return false
  return syncOne({
    fileId,
    storedPath: row.stored_path,
    sourcePath: row.source_path,
    sourceMtimeMs: row.source_mtime_ms
  })
}

export function syncAllPracticeFiles(): void {
  lastFullSyncMs = Date.now()
  for (const row of nodesRepo.listSyncableFiles()) void syncOne(row)
}

// Goi khi liet ke cay / cua so duoc focus - chan bot tan suat.
export function maybeSyncAllPracticeFiles(): void {
  if (Date.now() - lastFullSyncMs < FULL_SYNC_MIN_INTERVAL_MS) return
  syncAllPracticeFiles()
}

export async function getPracticeSourceStatus(fileId: string): Promise<PracticeSourceStatus> {
  const row = nodesRepo.getFileRow(fileId)
  if (!row) throw new Error('Không tìm thấy file.')
  const hasSource = row.source_path !== null
  const sourceMissing = hasSource ? (await stat(row.source_path as string).catch(() => null)) === null : false
  return {
    hasSource,
    sourcePath: row.source_path,
    sourceMissing,
    needsConfirmation: row.needs_source_confirmation === 1
  }
}
