import { describe, expect, it } from 'vitest'
import type { PracticeTreeNode } from '@shared/types/practice'
import { adjustMoveIndex, buildPracticeTree, collectFileIds } from './practiceTreeUtils'

function node(id: string, parentId: string | null, kind: 'folder' | 'file', sortOrder: number): PracticeTreeNode {
  return {
    id,
    parentId,
    kind,
    name: id,
    sortOrder,
    createdAt: '',
    updatedAt: '',
    file: null
  }
}

const NODES: PracticeTreeNode[] = [
  node('b', null, 'folder', 1),
  node('a', null, 'folder', 0),
  node('a1', 'a', 'folder', 0),
  node('f1', 'a1', 'file', 0),
  node('f2', 'a', 'file', 1),
  node('f3', null, 'file', 2)
]

describe('buildPracticeTree', () => {
  it('long nhau theo parentId va sap xep theo sortOrder', () => {
    const tree = buildPracticeTree(NODES)
    expect(tree.map((n) => n.id)).toEqual(['a', 'b', 'f3'])
    expect(tree[0].children?.map((n) => n.id)).toEqual(['a1', 'f2'])
    expect(tree[0].children?.[0].children?.map((n) => n.id)).toEqual(['f1'])
  })

  it('thu muc luon co children (ke ca rong), file thi khong', () => {
    const tree = buildPracticeTree(NODES)
    expect(tree[1].children).toEqual([])
    expect(tree[2].children).toBeUndefined()
  })
})

describe('collectFileIds', () => {
  it('lay moi file con chau cua thu muc', () => {
    expect(collectFileIds(NODES, 'a').sort()).toEqual(['f1', 'f2'])
  })
  it('node la file thi tra chinh no', () => {
    expect(collectFileIds(NODES, 'f3')).toEqual(['f3'])
  })
  it('thu muc rong khong co file', () => {
    expect(collectFileIds(NODES, 'b')).toEqual([])
  })
})

describe('adjustMoveIndex', () => {
  it('keo xuong trong cung cha thi tru 1', () => {
    // a co [a1, f2]; keo a1 xuong cuoi (arborist index = 2) -> 1 sau khi go ra
    expect(adjustMoveIndex(NODES, 'a1', 'a', 2)).toBe(1)
  })
  it('keo len trong cung cha thi giu nguyen', () => {
    expect(adjustMoveIndex(NODES, 'f2', 'a', 0)).toBe(0)
  })
  it('doi cha thi giu nguyen', () => {
    expect(adjustMoveIndex(NODES, 'f2', 'b', 0)).toBe(0)
  })
})
