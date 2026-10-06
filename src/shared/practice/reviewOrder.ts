// Thu tu duyet trinh tu cac vung: theo trang, roi tren xuong duoi, trai sang
// phai. Cac vung nam gan cung 1 hang (tam y lech nho hon nua chieu cao) duoc
// coi la cung hang va xep theo x. Thuan tuy, dung chung main + renderer.

export interface ReviewOrderRegion {
  id: string
  pageNumber: number
  labelBox: { x0: number; y0: number; x1: number; y1: number }
  refWidth: number
  refHeight: number
  reviewed: boolean
}

export interface ReviewOrderOptions {
  /** true (mac dinh): chi cac vung chua duyet. false: tat ca. */
  onlyUnreviewed?: boolean
  /** Chi lay tu trang nay tro di. */
  startPage?: number
}

export function orderRegionsForReview<T extends ReviewOrderRegion>(
  regions: readonly T[],
  options: ReviewOrderOptions = {}
): T[] {
  const onlyUnreviewed = options.onlyUnreviewed ?? true
  const startPage = options.startPage ?? 1
  const picked = regions.filter(
    (r) => r.pageNumber >= startPage && (!onlyUnreviewed || !r.reviewed)
  )

  const byPage = new Map<number, T[]>()
  for (const region of picked) {
    const list = byPage.get(region.pageNumber) ?? []
    list.push(region)
    byPage.set(region.pageNumber, list)
  }

  const result: T[] = []
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    // Toa do chuan hoa theo kich thuoc tham chieu de khac do phan giai van so sanh duoc.
    const norm = (r: T): { cy: number; h: number; x: number } => ({
      cy: ((r.labelBox.y0 + r.labelBox.y1) / 2) / Math.max(1, r.refHeight),
      h: (r.labelBox.y1 - r.labelBox.y0) / Math.max(1, r.refHeight),
      x: r.labelBox.x0 / Math.max(1, r.refWidth)
    })
    const items = (byPage.get(page) ?? [])
      .map((r) => ({ r, ...norm(r) }))
      .sort((a, b) => a.cy - b.cy || a.x - b.x)

    const rows: (typeof items)[] = []
    for (const item of items) {
      const row = rows[rows.length - 1]
      if (row) {
        const anchor = row[0]
        const tolerance = Math.max(anchor.h, item.h) / 2
        if (Math.abs(item.cy - anchor.cy) <= tolerance) {
          row.push(item)
          continue
        }
      }
      rows.push([item])
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x)
      for (const item of row) result.push(item.r)
    }
  }
  return result
}

/** Vung ke tiep trong danh sach da sap (null neu het). */
export function nextRegionInOrder<T extends { id: string }>(
  ordered: readonly T[],
  currentId: string
): T | null {
  const index = ordered.findIndex((r) => r.id === currentId)
  if (index < 0) return ordered[0] ?? null
  return ordered[index + 1] ?? null
}
