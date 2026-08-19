import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as searchIndexRepo from './searchIndex.repo'
import type {
  Lesson,
  LessonSummary,
  RecentLesson,
  CreateLessonInput,
  UpdateLessonInput
} from '../../../shared/types/lesson'

interface LessonRow {
  id: string
  topic_id: string
  title: string
  notes_json: string | null
  notes_text: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function mapLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    notesJson: row.notes_json,
    notesText: row.notes_text,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapLessonSummary(row: LessonRow): LessonSummary {
  return { id: row.id, topicId: row.topic_id, title: row.title, sortOrder: row.sort_order }
}

export function listAllLessonSummaries(): LessonSummary[] {
  const rows = getDb()
    .prepare('SELECT id, topic_id, title, sort_order FROM lessons ORDER BY sort_order, title')
    .all() as LessonRow[]
  return rows.map(mapLessonSummary)
}

export function listRecentLessons(limit: number): RecentLesson[] {
  const rows = getDb()
    .prepare(
      `SELECT l.id as id, l.title as title, l.topic_id as topicId, t.name as topicName,
              l.updated_at as updatedAt
       FROM lessons l
       JOIN topics t ON t.id = l.topic_id
       ORDER BY l.updated_at DESC
       LIMIT ?`
    )
    .all(limit) as RecentLesson[]
  return rows
}

export function getLesson(id: string): Lesson | null {
  const row = getDb().prepare('SELECT * FROM lessons WHERE id = ?').get(id) as
    | LessonRow
    | undefined
  return row ? mapLesson(row) : null
}

export function createLesson(input: CreateLessonInput): Lesson {
  const db = getDb()
  const id = randomUUID()
  db.prepare('INSERT INTO lessons (id, topic_id, title, sort_order) VALUES (?, ?, ?, 0)').run(
    id,
    input.topicId,
    input.title
  )
  return getLesson(id) as Lesson
}

export function updateLesson(input: UpdateLessonInput): Lesson {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM lessons WHERE id = ?').get(input.id) as
    | LessonRow
    | undefined
  if (!existing) throw new Error(`Lesson not found: ${input.id}`)

  const title = input.title ?? existing.title
  const notesJson = input.notesJson !== undefined ? input.notesJson : existing.notes_json
  const notesText = input.notesText !== undefined ? input.notesText : existing.notes_text
  const topicId = input.topicId ?? existing.topic_id
  const sortOrder = input.sortOrder ?? existing.sort_order

  db.prepare(
    `UPDATE lessons SET title = ?, notes_json = ?, notes_text = ?, topic_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, notesJson, notesText, topicId, sortOrder, input.id)

  const updated = getLesson(input.id) as Lesson
  searchIndexRepo.replaceSearchIndexEntries({
    sourceType: 'lesson_note',
    sourceId: updated.id,
    lessonId: updated.id,
    topicId: updated.topicId,
    title: updated.title,
    chunks: [{ unitType: 'note', unitIndex: 1, text: updated.notesText ?? '' }]
  })
  return updated
}

export function deleteLesson(id: string): void {
  const db = getDb()
  const deleteTx = db.transaction(() => {
    searchIndexRepo.deleteSearchIndexByLesson(id)
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  })
  deleteTx()
}
