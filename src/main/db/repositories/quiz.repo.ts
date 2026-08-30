import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as questionBankRepo from './questionBank.repo'
import { computeAttemptResult } from '../../services/quiz/scoring'
import type { QuestionOption, Question } from '../../../shared/types/question'
import type {
  AttemptAnswerReview,
  AttemptReview,
  CreateQuizInput,
  CreatedQuiz,
  PlayableQuestion,
  QuizAttemptSummary,
  QuizFeedbackMode,
  QuizScopeType,
  SubmitAttemptInput
} from '../../../shared/types/quiz'

interface QuizRow {
  id: string
  title: string
  scope_type: string
  lesson_id: string | null
  topic_id: string | null
  lesson_ids_json: string
  feedback_mode: string
  question_count: number
  created_at: string
}

interface QuizQuestionRow {
  id: string
  quiz_id: string
  question_id: string | null
  sort_order: number
  question_text: string
  options_json: string
  explanation: string | null
}

interface QuizAttemptRow {
  id: string
  quiz_id: string
  feedback_mode: string
  started_at: string
  submitted_at: string | null
  correct_count: number | null
  total_count: number | null
  score: number | null
}

interface QuizAttemptAnswerRow {
  id: string
  attempt_id: string
  quiz_question_id: string
  selected_option_id: string | null
  is_correct: number | null
}

function correctOptionId(options: QuestionOption[]): string {
  return options.find((o) => o.isCorrect)?.id ?? ''
}

function toPlayable(row: QuizQuestionRow): PlayableQuestion {
  return {
    quizQuestionId: row.id,
    questionId: row.question_id,
    questionText: row.question_text,
    options: JSON.parse(row.options_json) as QuestionOption[],
    explanation: row.explanation,
    sortOrder: row.sort_order
  }
}

// ---------- Chon cau hoi de choi ----------

export function listPlayableQuestionsForLesson(lessonId: string): Question[] {
  return questionBankRepo.listQuestionsByLesson(lessonId)
}

export function listPlayableQuestionsForTopic(
  lessonIds: string[],
  topicId: string
): Question[] {
  const byId = new Map<string, Question>()
  // (a) cau gan cho cac bai hoc da chon
  for (const q of questionBankRepo.listQuestionsByLessonIds(lessonIds)) {
    byId.set(q.id, q)
  }
  // (b) cau sinh o cap chu de (khong gan bai hoc nao)
  for (const q of questionBankRepo.listQuestionsByTopic(topicId)) {
    if (q.lessonId === null) byId.set(q.id, q)
  }
  return [...byId.values()]
}

// ---------- Tao quiz + snapshot ----------

export function createQuiz(input: CreateQuizInput): CreatedQuiz {
  const db = getDb()

  const picked = input.questionIds
    .map((id) => questionBankRepo.getQuestion(id))
    .filter((q): q is Question => q !== null)

  if (picked.length === 0) {
    throw new Error('Khong tao duoc bai kiem tra: khong co cau hoi hop le.')
  }

  const quizId = randomUUID()
  const insertQuiz = db.prepare(
    `INSERT INTO quizzes (id, title, scope_type, lesson_id, topic_id, lesson_ids_json, feedback_mode, question_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertQuizQuestion = db.prepare(
    `INSERT INTO quiz_questions (id, quiz_id, question_id, sort_order, question_text, options_json, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const quizQuestionIds: string[] = []
  const tx = db.transaction(() => {
    insertQuiz.run(
      quizId,
      input.title,
      input.scopeType,
      input.lessonId ?? null,
      input.topicId ?? null,
      JSON.stringify(input.lessonIds),
      input.feedbackMode,
      picked.length
    )
    picked.forEach((q, idx) => {
      const qqId = randomUUID()
      insertQuizQuestion.run(
        qqId,
        quizId,
        q.id,
        idx,
        q.questionText,
        JSON.stringify(q.options),
        q.explanation
      )
      quizQuestionIds.push(qqId)
    })
  })
  tx()

  const rows = db
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order')
    .all(quizId) as QuizQuestionRow[]

  return {
    quizId,
    feedbackMode: input.feedbackMode as QuizFeedbackMode,
    questions: rows.map(toPlayable)
  }
}

// ---------- Nop bai + cham diem ----------

function loadSnapshotRows(quizId: string): QuizQuestionRow[] {
  return getDb()
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order')
    .all(quizId) as QuizQuestionRow[]
}

function buildReview(params: {
  attempt: QuizAttemptRow
  quiz: QuizRow
  snapshotRows: QuizQuestionRow[]
  answerByQuestion: Map<string, { selectedOptionId: string | null; isCorrect: boolean }>
}): AttemptReview {
  const { attempt, quiz, snapshotRows, answerByQuestion } = params
  const answers: AttemptAnswerReview[] = snapshotRows.map((row) => {
    const options = JSON.parse(row.options_json) as QuestionOption[]
    const stored = answerByQuestion.get(row.id)
    return {
      quizQuestionId: row.id,
      questionText: row.question_text,
      options,
      explanation: row.explanation,
      selectedOptionId: stored?.selectedOptionId ?? null,
      correctOptionId: correctOptionId(options),
      isCorrect: stored?.isCorrect ?? false
    }
  })

  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    title: quiz.title,
    feedbackMode: attempt.feedback_mode as QuizFeedbackMode,
    correctCount: attempt.correct_count ?? 0,
    totalCount: attempt.total_count ?? snapshotRows.length,
    score: attempt.score ?? 0,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at ?? attempt.started_at,
    answers
  }
}

export function submitAttempt(input: SubmitAttemptInput): AttemptReview {
  const db = getDb()

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(input.quizId) as
    | QuizRow
    | undefined
  if (!quiz) throw new Error('Khong tim thay bai kiem tra.')

  const snapshotRows = loadSnapshotRows(input.quizId)
  const snapshot = new Map<string, { options: QuestionOption[] }>()
  for (const row of snapshotRows) {
    snapshot.set(row.id, { options: JSON.parse(row.options_json) as QuestionOption[] })
  }

  const result = computeAttemptResult(snapshot, input.answers)

  const attemptId = randomUUID()
  const insertAttempt = db.prepare(
    `INSERT INTO quiz_attempts (id, quiz_id, feedback_mode, submitted_at, correct_count, total_count, score)
     VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  )
  const insertAnswer = db.prepare(
    `INSERT INTO quiz_attempt_answers (id, attempt_id, quiz_question_id, selected_option_id, is_correct)
     VALUES (?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    insertAttempt.run(
      attemptId,
      input.quizId,
      input.feedbackMode,
      result.correctCount,
      result.totalCount,
      result.score
    )
    for (const a of result.perAnswer) {
      insertAnswer.run(
        randomUUID(),
        attemptId,
        a.quizQuestionId,
        a.selectedOptionId,
        a.isCorrect ? 1 : 0
      )
    }
  })
  tx()

  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as
    | QuizAttemptRow
    | undefined
  if (!attempt) throw new Error('Luu luot lam bai that bai.')

  const answerByQuestion = new Map(
    result.perAnswer.map((a) => [
      a.quizQuestionId,
      { selectedOptionId: a.selectedOptionId, isCorrect: a.isCorrect }
    ])
  )

  return buildReview({ attempt, quiz, snapshotRows, answerByQuestion })
}

export function getAttemptReview(attemptId: string): AttemptReview | null {
  const db = getDb()
  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as
    | QuizAttemptRow
    | undefined
  if (!attempt) return null

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(attempt.quiz_id) as
    | QuizRow
    | undefined
  if (!quiz) return null

  const snapshotRows = loadSnapshotRows(attempt.quiz_id)
  const answerRows = db
    .prepare('SELECT * FROM quiz_attempt_answers WHERE attempt_id = ?')
    .all(attemptId) as QuizAttemptAnswerRow[]

  const answerByQuestion = new Map(
    answerRows.map((r) => [
      r.quiz_question_id,
      { selectedOptionId: r.selected_option_id, isCorrect: r.is_correct === 1 }
    ])
  )

  return buildReview({ attempt, quiz, snapshotRows, answerByQuestion })
}

// ---------- Lich su ----------

const ATTEMPT_SUMMARY_SELECT = `
  SELECT a.id AS attemptId, a.quiz_id AS quizId, q.title AS title, q.scope_type AS scopeType,
         a.feedback_mode AS feedbackMode, a.correct_count AS correctCount,
         a.total_count AS totalCount, a.score AS score, a.submitted_at AS submittedAt
  FROM quiz_attempts a
  JOIN quizzes q ON q.id = a.quiz_id
`

interface AttemptSummaryRow {
  attemptId: string
  quizId: string
  title: string
  scopeType: string
  feedbackMode: string
  correctCount: number
  totalCount: number
  score: number
  submittedAt: string
}

function mapSummary(row: AttemptSummaryRow): QuizAttemptSummary {
  return {
    attemptId: row.attemptId,
    quizId: row.quizId,
    title: row.title,
    scopeType: row.scopeType as QuizScopeType,
    feedbackMode: row.feedbackMode as QuizFeedbackMode,
    correctCount: row.correctCount,
    totalCount: row.totalCount,
    score: row.score,
    submittedAt: row.submittedAt
  }
}

export function listAttemptsByLesson(lessonId: string): QuizAttemptSummary[] {
  const rows = getDb()
    .prepare(
      `${ATTEMPT_SUMMARY_SELECT}
       WHERE q.lesson_id = ? AND q.scope_type = 'lesson' AND a.submitted_at IS NOT NULL
       ORDER BY a.submitted_at DESC`
    )
    .all(lessonId) as AttemptSummaryRow[]
  return rows.map(mapSummary)
}

export function listAttemptsByTopic(topicId: string): QuizAttemptSummary[] {
  const rows = getDb()
    .prepare(
      `${ATTEMPT_SUMMARY_SELECT}
       WHERE q.topic_id = ? AND q.scope_type = 'topic' AND a.submitted_at IS NOT NULL
       ORDER BY a.submitted_at DESC`
    )
    .all(topicId) as AttemptSummaryRow[]
  return rows.map(mapSummary)
}

export function deleteAttempt(attemptId: string): void {
  getDb().prepare('DELETE FROM quiz_attempts WHERE id = ?').run(attemptId)
}
