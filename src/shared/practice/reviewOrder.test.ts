import { describe, expect, it } from 'vitest'
import { nextRegionInOrder, orderRegionsForReview, type ReviewOrderRegion } from './reviewOrder'

function region(id: string, page: number, x0: number, y0: number, reviewed = false): ReviewOrderRegion {
  return {
    id, pageNumber: page, reviewed, refWidth: 1000, refHeight: 1000,
    labelBox: { x0, y0, x1: x0 + 100, y1: y0 + 40 }
  }
}

describe('orderRegionsForReview', () => {
  it('sap theo trang, tren xuong duoi, trai sang phai', () => {
    const input = [
      region('p2', 2, 10, 10), region('b', 1, 500, 300), region('a', 1, 10, 100),
      region('c', 1, 10, 300)
    ]
    expect(orderRegionsForReview(input, { onlyUnreviewed: false }).map((r) => r.id)).toEqual(['a', 'c', 'b', 'p2'])
  })

  it('vung lech y nho van tinh cung hang, xep theo x', () => {
    const input = [region('right', 1, 600, 105), region('left', 1, 50, 100), region('below', 1, 50, 400)]
    expect(orderRegionsForReview(input, { onlyUnreviewed: false }).map((r) => r.id)).toEqual(['left', 'right', 'below'])
  })

  it('mac dinh chi lay vung chua duyet, startPage cat tu trang chon', () => {
    const input = [region('done', 1, 0, 0, true), region('todo1', 1, 0, 100), region('todo2', 3, 0, 0)]
    expect(orderRegionsForReview(input).map((r) => r.id)).toEqual(['todo1', 'todo2'])
    expect(orderRegionsForReview(input, { startPage: 2 }).map((r) => r.id)).toEqual(['todo2'])
    expect(orderRegionsForReview(input, { onlyUnreviewed: false, startPage: 1 }).map((r) => r.id))
      .toEqual(['done', 'todo1', 'todo2'])
  })

  it('nextRegionInOrder', () => {
    const list = [{ id: 'a' }, { id: 'b' }]
    expect(nextRegionInOrder(list, 'a')?.id).toBe('b')
    expect(nextRegionInOrder(list, 'b')).toBeNull()
    expect(nextRegionInOrder(list, 'zzz')?.id).toBe('a')
  })
})
