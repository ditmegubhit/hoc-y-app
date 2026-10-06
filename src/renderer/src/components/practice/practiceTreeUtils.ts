import type { PracticeTreeNode } from '@shared/types/practice'

// Cay thuc hanh: danh sach phang (parentId) -> cay long nhau cho react-arborist.
// Thu muc luon co `children` (ke ca mang rong) de arborist coi la node "internal"
// (mo/dong duoc); file la la nen KHONG gan children.

export interface PracticeTreeItem {
  id: string
  name: string
  kind: 'folder' | 'file'
  node: PracticeTreeNode
  children?: PracticeTreeItem[]
}

export function buildPracticeTree(nodes: PracticeTreeNode[]): PracticeTreeItem[] {
  const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)
  const items = new Map<string, PracticeTreeItem>()
  for (const n of sorted) {
    items.set(n.id, {
      id: n.id,
      name: n.name,
      kind: n.kind,
      node: n,
      ...(n.kind === 'folder' ? { children: [] } : {})
    })
  }
  const roots: PracticeTreeItem[] = []
  for (const n of sorted) {
    const item = items.get(n.id)
    if (!item) continue
    const parent = n.parentId ? items.get(n.parentId) : undefined
    if (parent && parent.children) parent.children.push(item)
    else roots.push(item)
  }
  return roots
}

/** Cac id file nam trong node (gom chinh no neu la file). Dung de dem/kiem tra khi xoa. */
export function collectFileIds(nodes: PracticeTreeNode[], rootId: string): string[] {
  const byParent = new Map<string | null, PracticeTreeNode[]>()
  const byId = new Map<string, PracticeTreeNode>()
  for (const n of nodes) {
    byId.set(n.id, n)
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const result: string[] = []
  const stack = [rootId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    if (!n) continue
    if (n.kind === 'file') result.push(n.id)
    for (const child of byParent.get(id) ?? []) stack.push(child.id)
  }
  return result
}

/**
 * Chi so dich de gui cho backend (moveNode.index = vi tri trong danh sach con
 * SAU khi go node ra). react-arborist bao index tinh ca node dang keo, nen khi
 * keo xuong trong cung 1 cha phai tru 1.
 */
export function adjustMoveIndex(
  nodes: PracticeTreeNode[],
  movedId: string,
  newParentId: string | null,
  arboristIndex: number
): number {
  const moved = nodes.find((n) => n.id === movedId)
  if (!moved || moved.parentId !== newParentId) return arboristIndex
  const siblings = nodes.filter((n) => n.parentId === newParentId).sort((a, b) => a.sortOrder - b.sortOrder)
  const currentIndex = siblings.findIndex((n) => n.id === movedId)
  return currentIndex !== -1 && currentIndex < arboristIndex ? arboristIndex - 1 : arboristIndex
}
