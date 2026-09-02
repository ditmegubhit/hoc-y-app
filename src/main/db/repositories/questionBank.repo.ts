import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type {
  Question,
  QuestionSource,
  QuestionGenerator,
  QuestionStatus,
  DraftQuestion,
  UpdateQuestionInput
} from '../../../shared/types/question'

interface QuestionRow {
  id: string
  question_text: string
  options_json: string
  explanation: string | null
  source: string
  generator: string | null
  lesson_id: string | null
  exam_file_id: string | null
  topic_id: string | null
  status: string
  marked_good: number
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
    generator: (row.generator as QuestionGenerator) ?? null,
    lessonId: row.lesson_id,
    examFileId: row.exam_file_id,
    topicId: row.topic_id,
    status: row.status as QuestionStatus,
    markedGood: row.marked_good === 1,
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

export function saveDraftQuestions(params: {
  questions: DraftQuestion[]
  source: QuestionSource
  generator?: QuestionGenerator
  lessonId: string | null
  topicId: string | null
}): Question[] {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO question_bank (id, question_text, options_json, explanation, source, generator, lesson_id, topic_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
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
        params.source,
        params.generator ?? null,
        params.lessonId,
        params.topicId
      )
      ids.push(id)
    }
  })
  tx()
  return ids.map((id) => getQuestion(id) as Question)
}

export function saveDraftQuestionsFromLesson(params: {
  lessonId: string
  topicId: string
  questions: DraftQuestion[]
  generator?: QuestionGenerator
}): Question[] {
  return saveDraftQuestions({
    questions: params.questions,
    source: 'ai_generated_from_lesson',
    generator: params.generator,
    lessonId: params.lessonId,
    topicId: params.topicId
  })
}

// Cau do Claude sinh, trong pham vi (de lam vi du few-shot cho Ollama).
export function listClaudeGeneratedByLessonIds(ids: string[], limit: number): Question[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT * FROM question_bank
       WHERE generator = 'claude' AND lesson_id IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...ids, limit) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listClaudeGeneratedUnderTopic(topicId: string, limit: number): Question[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT ?
         UNION ALL
         SELECT t.id FROM topics t JOIN sub ON t.parent_id = sub.id
       )
       SELECT DISTINCT qb.* FROM question_bank qb
       WHERE qb.generator = 'claude'
         AND (qb.topic_id IN (SELECT id FROM sub)
              OR qb.lesson_id IN (SELECT id FROM lessons WHERE topic_id IN (SELECT id FROM sub)))
       ORDER BY qb.created_at DESC LIMIT ?`
    )
    .all(topicId, limit) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listQuestionsByLesson(lessonId: string): Question[] {
  const rows = getDb()
    .prepare('SELECT * FROM question_bank WHERE lesson_id = ? ORDER BY created_at DESC')
    .all(lessonId) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listQuestionsByLessonIds(ids: string[]): Question[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT * FROM question_bank WHERE lesson_id IN (${placeholders}) ORDER BY created_at DESC`
    )
    .all(...ids) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listQuestionsByTopic(topicId: string): Question[] {
  const rows = getDb()
    .prepare('SELECT * FROM question_bank WHERE topic_id = ? ORDER BY created_at DESC')
    .all(topicId) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function listQuestionsUnderTopic(topicId: string): Question[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT ?
         UNION ALL
         SELECT t.id FROM topics t JOIN sub ON t.parent_id = sub.id
       )
       SELECT DISTINCT qb.* FROM question_bank qb
       WHERE qb.topic_id IN (SELECT id FROM sub)
          OR qb.lesson_id IN (SELECT id FROM lessons WHERE topic_id IN (SELECT id FROM sub))
       ORDER BY qb.created_at DESC`
    )
    .all(topicId) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function updateQuestion(input: UpdateQuestionInput): Question {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM question_bank WHERE id = ?').get(input.id)
  if (!existing) throw new Error('Không tìm thấy câu hỏi.')

  db.prepare(
    `UPDATE question_bank
     SET question_text = ?, options_json = ?, explanation = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    input.questionText,
    JSON.stringify(input.options),
    input.explanation,
    input.id
  )
  return getQuestion(input.id) as Question
}

export function listQuestionsBySource(source: QuestionSource): Question[] {
  const rows = getDb()
    .prepare('SELECT * FROM question_bank WHERE source = ? ORDER BY created_at DESC')
    .all(source) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function setMarkedGood(id: string, value: boolean): void {
  getDb()
    .prepare('UPDATE question_bank SET marked_good = ? WHERE id = ?')
    .run(value ? 1 : 0, id)
}

export function deleteQuestion(id: string): void {
  getDb().prepare('DELETE FROM question_bank WHERE id = ?').run(id)
}

export function countAll(): number {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM question_bank').get() as { c: number }
  return row.c
}
