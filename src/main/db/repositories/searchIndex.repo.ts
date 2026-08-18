import { getDb } from '../index'
import type { SearchSourceType } from '../../../shared/types/search'

export function upsertSearchIndex(entry: {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  topicId: string
  title: string
  content: string
}): void {
  const db = getDb()
  db.prepare('DELETE FROM search_index WHERE source_type = ? AND source_id = ?').run(
    entry.sourceType,
    entry.sourceId
  )
  if (!entry.content.trim()) return
  db.prepare(
    `INSERT INTO search_index (title, content, lesson_id, topic_id, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(entry.title, entry.content, entry.lessonId, entry.topicId, entry.sourceType, entry.sourceId)
}

export function deleteSearchIndex(sourceType: SearchSourceType, sourceId: string): void {
  getDb()
    .prepare('DELETE FROM search_index WHERE source_type = ? AND source_id = ?')
    .run(sourceType, sourceId)
}

export function deleteSearchIndexByLesson(lessonId: string): void {
  getDb().prepare('DELETE FROM search_index WHERE lesson_id = ?').run(lessonId)
}
