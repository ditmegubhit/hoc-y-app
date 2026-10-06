import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMigratedMemoryDb } from '../../db/testDb'

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }))
vi.mock('../../db/index', () => ({ getDb: () => holder.db }))

import * as nodes from '../../db/repositories/practiceNodes.repo'
import * as regions from '../../db/repositories/practiceRegions.repo'
import { cancelScan, runScan, type ScanDeps } from './scanRunner'
import type { PracticeScanProgress } from '../../../shared/types/practice'

function newFile(totalPages: number | null = 3): string {
  return nodes.createFileNode({
    parentId: null, name: 'f', storedPath: 'C:\\kho\\f.pdf', fileSizeBytes: 1, sourcePath: null, sourceMtimeMs: null, totalPages
  }).id
}

function makeDeps(overrides: Partial<ScanDeps> = {}): ScanDeps & { events: PracticeScanProgress[]; pages: number[] } {
  const events: PracticeScanProgress[] = []
  const pages: number[] = []
  return {
    events,
    pages,
    countPages: async () => 3,
    emit: (p) => events.push(p),
    detectPage: async (_path, page) => {
      pages.push(page)
      return {
        refWidth: 1000, refHeight: 1000,
        regions: [
          { rawText: `Nhan ${page}`, labelBox: { x0: 10, y0: 10, x1: 110, y1: 40 }, refWidth: 1000, refHeight: 1000, confidence: 0.95 },
          { rawText: '?', labelBox: { x0: 10, y0: 200, x1: 110, y1: 240 }, refWidth: 1000, refHeight: 1000, confidence: 0.3 }
        ]
      }
    },
    ...overrides
  }
}

beforeEach(() => {
  holder.db = createMigratedMemoryDb()
})

describe('runScan', () => {
  it('quet het cac trang, tu nhap vung chac chan, luu trang thai va ban tien do', async () => {
    const fileId = newFile()
    const deps = makeDeps()
    const result = await runScan(fileId, false, deps)
    expect(deps.pages).toEqual([1, 2, 3])
    expect(result.state).toMatchObject({ status: 'done', completed: true, lastPage: 3, totalPages: 3, running: false })
    expect(deps.events.map((e) => e.phase)).toEqual(['scanning', 'scanning', 'scanning', 'done'])
    const all = regions.listRegionsForFile(fileId)
    expect(all).toHaveLength(6)
    expect(all.filter((r) => r.status === 'confirmed')).toHaveLength(3)
    expect(all.every((r) => !r.reviewed)).toBe(true)
  })

  it('da quet xong thi khong quet lai tru khi force', async () => {
    const fileId = newFile()
    await runScan(fileId, false, makeDeps())
    const deps = makeDeps()
    const skipped = await runScan(fileId, false, deps)
    expect(skipped.alreadyComplete).toBe(true)
    expect(deps.pages).toEqual([])
    await runScan(fileId, true, deps)
    expect(deps.pages).toEqual([1, 2, 3])
    expect(regions.listRegionsForFile(fileId)).toHaveLength(6) // vung chua duyet duoc thay, khong nhan doi
  })

  it('quet lai (force) giu vung da duyet', async () => {
    const fileId = newFile()
    await runScan(fileId, false, makeDeps())
    const first = regions.listRegionsForPage(fileId, 1)[0]
    regions.updateRegion(first.id, { answerText: 'Đã sửa', reviewed: true })
    await runScan(fileId, true, makeDeps())
    expect(regions.getRegion(first.id)?.answerText).toBe('Đã sửa')
    expect(regions.listRegionsForPage(fileId, 1)).toHaveLength(2)
  })

  it('huy giua chung roi tiep tuc tu trang da quet', async () => {
    const fileId = newFile()
    const deps = makeDeps()
    const original = deps.detectPage
    deps.detectPage = async (path, page) => {
      const value = await original(path, page)
      if (page === 2) cancelScan(fileId)
      return value
    }
    const cancelled = await runScan(fileId, false, deps)
    expect(cancelled.cancelled).toBe(true)
    expect(deps.pages).toEqual([1, 2])
    expect(cancelled.state).toMatchObject({ completed: false, lastPage: 2 })
    expect(deps.events.at(-1)?.phase).toBe('cancelled')

    const resume = makeDeps()
    const done = await runScan(fileId, false, resume)
    expect(resume.pages).toEqual([3])
    expect(done.state.completed).toBe(true)
  })

  it('trang loi duoc thu lai 1 lan roi bo qua, van hoan tat', async () => {
    const fileId = newFile()
    let page2Calls = 0
    const base = makeDeps()
    const deps = makeDeps({
      detectPage: async (path, page) => {
        if (page === 2) {
          page2Calls += 1
          throw new Error('hong')
        }
        return base.detectPage(path, page)
      }
    })
    const result = await runScan(fileId, false, deps)
    expect(page2Calls).toBe(2)
    expect(result.failedPages).toEqual([2])
    expect(result.state.completed).toBe(true)
  })

  it('moi trang deu loi thi bao failed va giu moc de thu lai', async () => {
    const fileId = newFile()
    const deps = makeDeps({ detectPage: async () => { throw new Error('engine chet') } })
    const result = await runScan(fileId, false, deps)
    expect(result.state).toMatchObject({ status: 'failed', completed: false, lastPage: 0 })
    expect(deps.events.at(-1)?.phase).toBe('failed')
  })

  it('khong chay song song 2 luot cung 1 file; dem trang khi chua biet tong so', async () => {
    const fileId = newFile(null)
    const deps = makeDeps()
    const slow = makeDeps({
      detectPage: async (path, page) => {
        await new Promise((r) => setTimeout(r, 20))
        return deps.detectPage(path, page)
      }
    })
    const [a, b] = await Promise.all([runScan(fileId, false, slow), runScan(fileId, false, makeDeps())])
    expect(b.alreadyRunning).toBe(true)
    expect(a.state).toMatchObject({ completed: true, totalPages: 3 })
  })
})
