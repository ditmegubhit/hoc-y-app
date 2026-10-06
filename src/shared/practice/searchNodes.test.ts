import { describe, expect, it } from 'vitest'
import { searchNodesByName } from './searchNodes'

const nodes = [
  { id: '1', parentId: null, name: 'Giải phẫu' },
  { id: '2', parentId: '1', name: 'Hệ tiết niệu' },
  { id: '3', parentId: '2', name: 'Thận - bàng quang' },
  { id: '4', parentId: null, name: 'Sinh lý' }
]

describe('searchNodesByName', () => {
  it('tim khong phan biet dau va hoa thuong', () => {
    const found = searchNodesByName(nodes, 'TIET NIEU')
    expect(found.map((r) => r.node.id)).toEqual(['2'])
    expect(searchNodesByName(nodes, 'than').map((r) => r.node.id)).toEqual(['3'])
  })

  it('tra ve duong dan thu muc cha', () => {
    expect(searchNodesByName(nodes, 'bang quang')[0].pathNames).toEqual(['Giải phẫu', 'Hệ tiết niệu'])
  })

  it('tu khoa rong khong ra gi', () => {
    expect(searchNodesByName(nodes, '   ')).toEqual([])
  })
})
