import type { Topic } from '@shared/types/topic'
import type { LessonSummary } from '@shared/types/lesson'

export interface TreeNode {
  id: string
  name: string
  kind: 'topic' | 'lesson'
  // react-arborist: node co children (ke ca mang rong) duoc coi la "internal" (co the mo/dong).
  // Lesson la leaf nen KHONG duoc gan children.
  children?: TreeNode[]
}

export function buildTree(topics: Topic[], lessons: LessonSummary[]): TreeNode[] {
  const topicNodes = new Map<string, TreeNode>()
  for (const t of topics) {
    topicNodes.set(t.id, { id: t.id, name: t.name, kind: 'topic', children: [] })
  }

  const roots: TreeNode[] = []
  for (const t of topics) {
    const node = topicNodes.get(t.id)
    if (!node) continue
    if (t.parentId && topicNodes.has(t.parentId)) {
      topicNodes.get(t.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const l of lessons) {
    const parent = topicNodes.get(l.topicId)
    if (!parent) continue
    parent.children!.push({ id: l.id, name: l.title, kind: 'lesson' })
  }

  return roots
}
