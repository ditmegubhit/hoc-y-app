import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as searchIndexRepo from './searchIndex.repo'
import type { Topic, CreateTopicInput, UpdateTopicInput } from '../../../shared/types/topic'

interface TopicRow {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function mapTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listTopics(): Topic[] {
  const rows = getDb()
    .prepare('SELECT * FROM topics ORDER BY sort_order, name')
    .all() as TopicRow[]
  return rows.map(mapTopic)
}

export function createTopic(input: CreateTopicInput): Topic {
  const db = getDb()
  const id = randomUUID()
  db.prepare('INSERT INTO topics (id, parent_id, name, sort_order) VALUES (?, ?, ?, 0)').run(
    id,
    input.parentId,
    input.name
  )
  const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as TopicRow
  return mapTopic(row)
}

function wouldCreateCycle(
  db: ReturnType<typeof getDb>,
  topicId: string,
  newParentId: string | null
): boolean {
  let current = newParentId
  while (current) {
    if (current === topicId) return true
    const row = db.prepare('SELECT parent_id FROM topics WHERE id = ?').get(current) as
      | { parent_id: string | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return false
}

export function updateTopic(input: UpdateTopicInput): Topic {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM topics WHERE id = ?').get(input.id) as
    | TopicRow
    | undefined
  if (!existing) throw new Error(`Topic not found: ${input.id}`)

  const name = input.name ?? existing.name
  const parentId = input.parentId !== undefined ? input.parentId : existing.parent_id
  const sortOrder = input.sortOrder ?? existing.sort_order

  if (input.parentId !== undefined && parentId !== existing.parent_id) {
    if (parentId === input.id || wouldCreateCycle(db, input.id, parentId)) {
      throw new Error('Khong the di chuyen chu de vao chinh no hoac con chau cua no')
    }
  }

  db.prepare(
    `UPDATE topics SET name = ?, parent_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, parentId, sortOrder, input.id)

  const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(input.id) as TopicRow
  return mapTopic(row)
}

function collectDescendantTopicIds(db: ReturnType<typeof getDb>, rootId: string): string[] {
  const result: string[] = []
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const children = db.prepare('SELECT id FROM topics WHERE parent_id = ?').all(current) as {
      id: string
    }[]
    for (const child of children) {
      result.push(child.id)
      queue.push(child.id)
    }
  }
  return result
}

export function deleteTopic(id: string): void {
  const db = getDb()
  // Xoa topic se CASCADE xoa het chu de con + bai hoc + attachment trong DB quan he,
  // nhung search_index (FTS5) khong ho tro FK nen phai don thu cong truoc khi xoa.
  const allTopicIds = [id, ...collectDescendantTopicIds(db, id)]
  const placeholders = allTopicIds.map(() => '?').join(',')
  const lessonRows = db
    .prepare(`SELECT id FROM lessons WHERE topic_id IN (${placeholders})`)
    .all(...allTopicIds) as { id: string }[]

  const deleteTx = db.transaction(() => {
    for (const lesson of lessonRows) {
      searchIndexRepo.deleteSearchIndexByLesson(lesson.id)
    }
    db.prepare('DELETE FROM topics WHERE id = ?').run(id)
  })
  deleteTx()
}
