import * as nodesRepo from '../../db/repositories/practiceNodes.repo'
import * as regionsRepo from '../../db/repositories/practiceRegions.repo'
import { renderPdfPageAsPng, RENDER_SCALE } from '../textExtraction/pdfRender'
import { readLabelImage } from '../anatomy/readLabelWithAi'
import type { PracticeAiPageReading, PracticeRegion, PracticeTextReading } from '../../../shared/types/practice'

// Nho Claude doc lai chu: chi tra DE XUAT, khong bao gio tu ghi dap an.

const PAGE_MAX_REGIONS = 30
const PAGE_BUDGET_MS = 8 * 60 * 1000

function requireStoredPath(fileId: string): string {
  const path = nodesRepo.getStoredPath(fileId)
  if (!path) throw new Error('Không tìm thấy file.')
  return path
}

export async function readPracticeRegionWithAi(regionId: string): Promise<PracticeTextReading> {
  const region = regionsRepo.getRegion(regionId)
  if (!region) throw new Error('Không tìm thấy vùng chữ.')
  const png = await renderPdfPageAsPng(requireStoredPath(region.fileId), region.pageNumber, RENDER_SCALE)
  return readLabelImage(png, region.labelBox, region.refWidth, region.refHeight)
}

/** Vung can doc: chua duyet va (dang nhap hoac nghi ngo), khong phai vung "chi che". */
export function regionsNeedingAiReading(regions: PracticeRegion[]): PracticeRegion[] {
  return regions.filter((r) => !r.reviewed && r.status !== 'rejected' && (r.status === 'pending' || r.suspect))
}

/** Doc ca 1 trang: render 1 lan, lap tung vung can doc (tuan tu), toi da PAGE_MAX_REGIONS vung va PAGE_BUDGET_MS. */
export async function readPracticePageWithAi(fileId: string, pageNumber: number): Promise<PracticeAiPageReading[]> {
  const targets = regionsNeedingAiReading(regionsRepo.listRegionsForPage(fileId, pageNumber))
  if (targets.length === 0) return []
  const png = await renderPdfPageAsPng(requireStoredPath(fileId), pageNumber, RENDER_SCALE)
  const started = Date.now()
  const results: PracticeAiPageReading[] = []
  for (const [index, region] of targets.entries()) {
    if (index >= PAGE_MAX_REGIONS || Date.now() - started > PAGE_BUDGET_MS) {
      results.push({ regionId: region.id, reading: null, skipped: true })
      continue
    }
    try {
      const reading = await readLabelImage(png, region.labelBox, region.refWidth, region.refHeight)
      results.push({ regionId: region.id, reading })
    } catch (error) {
      results.push({
        regionId: region.id,
        reading: null,
        error: error instanceof Error ? error.message : 'Không đọc được chữ bằng Claude.'
      })
    }
  }
  return results
}
