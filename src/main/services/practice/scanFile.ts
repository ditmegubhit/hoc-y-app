import { IpcChannels } from '../../../shared/types/ipcChannels'
import { getPdfPageCount } from '../textExtraction/pdfRender'
import { detectPracticePageRegions } from './scanPage'
import { broadcastPractice } from './practiceStorage'
import { runScan, type ScanDeps } from './scanRunner'
import type { PracticeScanResult } from '../../../shared/types/practice'

export { cancelScan, getScanStateWithRunning, isScanRunning } from './scanRunner'

const realDeps: ScanDeps = {
  detectPage: detectPracticePageRegions,
  countPages: getPdfPageCount,
  emit: (progress) => broadcastPractice(IpcChannels.practice.scanProgress, progress)
}

/** Quet ca file (tiep tuc neu dang do, force = quet lai tu dau nhung giu vung da duyet). Chay den khi xong. */
export function scanPracticeFile(fileId: string, force: boolean): Promise<PracticeScanResult> {
  return runScan(fileId, force, realDeps)
}
