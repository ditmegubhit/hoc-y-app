import * as nodesRepo from '../../db/repositories/practiceNodes.repo'
import * as regionsRepo from '../../db/repositories/practiceRegions.repo'
import type { DetectedRegion } from './autoDraft'
import type { PracticeScanProgress, PracticeScanResult, PracticeScanState } from '../../../shared/types/practice'

// Vong lap quet ca file (giong handler detectAllPages cu): luu tien trinh sau
// moi trang de tiep tuc duoc, huy duoc, ban su kien tien trinh. Phu thuoc ben
// ngoai (do chu tung trang, dem trang, gui su kien) duoc tiem qua `deps` de
// kiem thu khong can Electron/OCR.

export interface ScanDeps {
  detectPage(pdfPath: string, pageNumber: number): Promise<{ refWidth: number; refHeight: number; regions: DetectedRegion[] }>
  countPages(pdfPath: string): Promise<number>
  emit(progress: PracticeScanProgress): void
  /** So lan thu moi trang truoc khi bo qua trang loi (mac dinh 2). */
  attemptsPerPage?: number
}

const running = new Map<string, { cancelled: boolean }>()

export function isScanRunning(fileId: string): boolean {
  return running.has(fileId)
}

export function cancelScan(fileId: string): void {
  const job = running.get(fileId)
  if (job) job.cancelled = true
}

export function getScanStateWithRunning(fileId: string): PracticeScanState | null {
  const state = nodesRepo.getScanState(fileId)
  return state ? { ...state, running: running.has(fileId) } : null
}

// Trang thai tra ve khi luot quet vua ket thuc (running=false du map chua kip xoa).
function finalState(fileId: string): PracticeScanState {
  return { ...(nodesRepo.getScanState(fileId) as PracticeScanState), running: false }
}

export async function runScan(fileId: string, force: boolean, deps: ScanDeps): Promise<PracticeScanResult> {
  const row = nodesRepo.getFileRow(fileId)
  if (!row) throw new Error('Không tìm thấy file để quét.')
  const baseState = getScanStateWithRunning(fileId) as PracticeScanState
  const none = { cancelled: false, alreadyComplete: false, alreadyRunning: false, failedPages: [] as number[] }

  if (running.has(fileId)) return { ...none, state: baseState, alreadyRunning: true }
  if (row.scan_completed === 1 && !force) return { ...none, state: baseState, alreadyComplete: true }

  const job = { cancelled: false }
  running.set(fileId, job)
  const failedPages: number[] = []
  let newRegions = 0
  let totalPages = row.total_pages ?? 0
  let lastPage = force ? 0 : row.scan_last_page
  try {
    if (!totalPages) totalPages = await deps.countPages(row.stored_path)
    if (!totalPages) throw new Error('PDF không có trang nào.')
    const startPage = Math.min(totalPages, lastPage + 1)
    const attempts = Math.max(1, deps.attemptsPerPage ?? 2)
    nodesRepo.saveScanState(fileId, { status: 'scanning', lastPage: startPage - 1, totalPages, completed: false })

    let processed = 0
    for (let pageNumber = startPage; pageNumber <= totalPages; pageNumber += 1) {
      if (job.cancelled) break
      let done = false
      for (let attempt = 1; attempt <= attempts && !done; attempt += 1) {
        try {
          const page = await deps.detectPage(row.stored_path, pageNumber)
          const created = regionsRepo.replaceDetectedRegions(
            fileId, pageNumber, page.regions.map((r) => ({ ...r, pageNumber }))
          )
          newRegions += created.length
          done = true
        } catch (error) {
          console.error(`[practice] quét trang ${pageNumber} lần ${attempt} lỗi:`, error)
        }
      }
      if (!done) failedPages.push(pageNumber)
      processed += 1
      lastPage = pageNumber
      nodesRepo.saveScanState(fileId, { status: 'scanning', lastPage, totalPages, completed: false })
      deps.emit({ fileId, phase: 'scanning', pageNumber, totalPages, regionCount: newRegions, failedPages: [...failedPages] })
    }

    if (job.cancelled) {
      nodesRepo.saveScanState(fileId, { status: 'none', lastPage, totalPages, completed: false })
      deps.emit({ fileId, phase: 'cancelled', pageNumber: lastPage, totalPages, regionCount: newRegions, failedPages })
      return { ...none, state: finalState(fileId), cancelled: true, failedPages }
    }

    if (processed > 0 && failedPages.length === processed) {
      // Trang nao cung loi (vd engine OCR hong): giu moc cu de lan sau thu lai tu dau doan nay.
      nodesRepo.saveScanState(fileId, { status: 'failed', lastPage: startPage - 1, totalPages, completed: false })
      const error = 'Không đọc được trang nào, kiểm tra lại công cụ nhận dạng chữ.'
      deps.emit({ fileId, phase: 'failed', pageNumber: lastPage, totalPages, regionCount: newRegions, failedPages, error })
      return { ...none, state: finalState(fileId), failedPages }
    }

    nodesRepo.saveScanState(fileId, { status: 'done', lastPage: totalPages, totalPages, completed: true })
    deps.emit({ fileId, phase: 'done', pageNumber: totalPages, totalPages, regionCount: newRegions, failedPages })
    return { ...none, state: finalState(fileId), failedPages }
  } catch (error) {
    nodesRepo.saveScanState(fileId, { status: 'failed', lastPage, totalPages: totalPages || null, completed: false })
    deps.emit({
      fileId, phase: 'failed', pageNumber: lastPage, totalPages, regionCount: newRegions, failedPages,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  } finally {
    running.delete(fileId)
  }
}
