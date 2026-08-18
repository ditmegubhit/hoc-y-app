import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type {
  Question,
  QuestionSource,
  QuestionStatus,
  DraftQuestion
} from '../../../shared/types/question'

interface QuestionRow {
  id: string
  question_text: string
  options_json: string
  explanation: string | null
  source: string
  lesson_id: string | null
  exam_file_id: string | null
  topic_id: string | null
  status: string
  created_at: string
  updated_at: string
}

function mapQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    questionText: row.question_text,
    options: JSON.parse(row.options_json),
    explanation: row.explanation,
    source: row.source as QuestionSource,
    lessonId: row.lesson_id,
    examFileId: row.exam_file_id,
    topicId: row.topic_id,
    status: row.status as QuestionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getQuestion(id: string): Question | null {
  const row = getDb().prepare('SELECT * FROM question_bank WHERE id = ?').get(id) as
    | QuestionRow
    | undefined
  return row ? mapQuestion(row) : null
}

export function saveDraftQuestionsFromLesson(params: {
  lessonId: string
  topicId: string
  questions: DraftQuestion[]
}): Question[] {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO question_bank (id, question_text, options_json, explanation, source, lesson_id, topic_id, status)
     VALUES (?, ?, ?, ?, 'ai_generated_from_lesson', ?, ?, 'draft')`
  )
  const ids: string[] = []
  const tx = db.transaction(() => {
    for (const q of params.questions) {
      const id = randomUUID()
      insert.run(
        id,
        q.questionText,
        JSON.stringify(q.options),
        q.explanation,
        params.lessonId,
        params.topicId
      )
      ids.push(id)
    }
  })
  tx()
  return ids.map((id) => getQuestion(id) as Question)
}

export function listQuestionsByLesson(lessonId: string): Question[] {
  const rows = getDb()
    .prepare('SELECT * FROM question_bank WHERE lesson_id = ? ORDER BY created_at DESC')
    .all(lessonId) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listQuestionsBySource(source: QuestionSource): Question[] {
  const rows = getDb()
    .prepare('SELECT * FROM question_bank WHERE source = ? ORDER BY created_at DESC')
    .all(source) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function deleteQuestion(id: string): void {
  getDb().prepare('DELETE FROM question_bank WHERE id = ?').run(id)
}

export function countAll(): number {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM question_bank').get() as { c: number }
  return row.c
}
