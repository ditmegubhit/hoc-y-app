// Tim theo ten node, khong phan biet dau/hoa-thuong. Thuan tuy.

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SearchableNode {
  id: string
  parentId: string | null
  name: string
}

export function searchNodesByName<T extends SearchableNode>(
  nodes: readonly T[],
  keyword: string
): { node: T; pathNames: string[] }[] {
  const needle = fold(keyword)
  if (!needle) return []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const results: { node: T; pathNames: string[] }[] = []
  for (const node of nodes) {
    if (!fold(node.name).includes(needle)) continue
    const pathNames: string[] = []
    let current = node.parentId ? byId.get(node.parentId) : undefined
    let guard = 0
    while (current && guard++ < 100) {
      pathNames.unshift(current.name)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    results.push({ node, pathNames })
  }
  return results
}
