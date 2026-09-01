import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type {
  LearningExampleInput,
  LearningExampleKind,
  QuestionDraftContent
} from '../../../shared/types/question'

export interface LearningExample {
  id: string
  kind: LearningExampleKind
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

function afterQuestionText(json: string): string {
  try {
    return (JSON.parse(json) as QuestionDraftContent).questionText.trim().toLowerCase()
  } catch {
    return ''
  }
}

export function recordExamples(examples: LearningExampleInput[]): void {
  if (examples.length === 0) return
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO quiz_learning_examples (id, kind, topic_id, lesson_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  // Tranh luu trung mau 'marked_good' cho cung 1 cau (user co the bam nhieu lan).
  const existingGood = new Set(
    (
      db
        .prepare(`SELECT after_json FROM quiz_learning_examples WHERE kind = 'marked_good'`)
        .all() as { after_json: string }[]
    ).map((r) => afterQuestionText(r.after_json))
  )

  const tx = db.transaction(() => {
    for (const ex of examples) {
      const afterJson = JSON.stringify(ex.after)
      if (ex.kind === 'marked_good') {
        const key = ex.after.questionText.trim().toLowerCase()
        if (existingGood.has(key)) continue
        existingGood.add(key)
      }
      insert.run(
        randomUUID(),
        ex.kind,
        ex.topicId,
        ex.lessonId,
        ex.before ? JSON.stringify(ex.before) : null,
        afterJson
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
  const orderBy = `ORDER BY CASE kind WHEN 'marked_good' THEN 0 WHEN 'claude_fix' THEN 1 ELSE 2 END, created_at DESC`

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
