import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type { LearningExampleInput, QuestionDraftContent } from '../../../shared/types/question'

export interface LearningExample {
  id: string
  kind: 'claude_fix' | 'ollama_fixed'
  topicId: string | null
  lessonId: string | null
  before: QuestionDraftContent | null
  after: QuestionDraftContent
  createdAt: string
}

interface Row {
  id: string
  kind: string
  topic_id: string | null
  lesson_id: string | null
  before_json: string | null
  after_json: string
  created_at: string
}

function map(row: Row): LearningExample {
  return {
    id: row.id,
    kind: row.kind as LearningExample['kind'],
    topicId: row.topic_id,
    lessonId: row.lesson_id,
    before: row.before_json ? (JSON.parse(row.before_json) as QuestionDraftContent) : null,
    after: JSON.parse(row.after_json) as QuestionDraftContent,
    createdAt: row.created_at
  }
}

export function recordExamples(examples: LearningExampleInput[]): void {
  if (examples.length === 0) return
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO quiz_learning_examples (id, kind, topic_id, lesson_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction(() => {
    for (const ex of examples) {
      insert.run(
        randomUUID(),
        ex.kind,
        ex.topicId,
        ex.lessonId,
        JSON.stringify(ex.before),
        JSON.stringify(ex.after)
      )
    }
  })
  tx()
}

// Vi du trong pham vi (uu tien) roi bu them vi du bat ky. claude_fix xep truoc
// ollama_fixed; moi nhat truoc.
export function listExamplesForScope(params: {
  lessonIds: string[]
  topicId: string | null
  limit: number
}): LearningExample[] {
  const db = getDb()
  const orderBy = `ORDER BY CASE kind WHEN 'claude_fix' THEN 0 ELSE 1 END, created_at DESC`

  const inScope: Row[] = []
  if (params.topicId) {
    inScope.push(
      ...(db
        .prepare(`SELECT * FROM quiz_learning_examples WHERE topic_id = ? ${orderBy} LIMIT ?`)
        .all(params.topicId, params.limit) as Row[])
    )
  }
  if (inScope.length < params.limit && params.lessonIds.length > 0) {
    const ph = params.lessonIds.map(() => '?').join(',')
    inScope.push(
      ...(db
        .prepare(
          `SELECT * FROM quiz_learning_examples WHERE lesson_id IN (${ph}) ${orderBy} LIMIT ?`
        )
        .all(...params.lessonIds, params.limit) as Row[])
    )
  }

  const seen = new Set(inScope.map((r) => r.id))
  const result = [...inScope]
  if (result.length < params.limit) {
    const rest = db
      .prepare(`SELECT * FROM quiz_learning_examples ${orderBy} LIMIT ?`)
      .all(params.limit * 2) as Row[]
    for (const r of rest) {
      if (result.length >= params.limit) break
      if (!seen.has(r.id)) {
        seen.add(r.id)
        result.push(r)
      }
    }
  }

  return result.slice(0, params.limit).map(map)
}
