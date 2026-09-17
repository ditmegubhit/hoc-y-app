import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as candidatesRepo from './anatomyCandidates.repo'
import { computeAnatomyAnswerResult } from '../../services/anatomy/grading'
import type {
  AnatomyAttemptAnswerReview,
  AnatomyAttemptReview,
  AnatomyFeedbackMode,
  ConfirmAnatomyCandidateInput,
  PlayableAnatomyQuestion,
  Rect,
  StartAnatomyAttemptInput,
  StartedAnatomyAttempt,
  SubmitAnatomyAttemptInput
} from '../../../shared/types/anatomyQuiz'

interface QuestionRow {
  id: string
  attachment_id: string
  lesson_id: string
  page_number: number
  candidate_id: string | null
  answer_text: string
  accepted_alternates_json: string
  mask_boxes_json: string
  target_box_json: string
  ref_width: number
  ref_height: number
}

interface AttemptRow {
  id: string
  attachment_id: string
  feedback_mode: string
  question_count: number
  started_at: string
  submitted_at: string | null
  duration_seconds: number | null
  correct_count: number | null
  score: number | null
}

interface AttemptAnswerRow {
  id: string
  attempt_id: string
  question_id: string
  submitted_text: string
  is_correct: number
}

function loadQuestion(questionId: string): QuestionRow | undefined {
  return getDb().prepare('SELECT * FROM anatomy_questions WHERE id = ?').get(questionId) as
    | QuestionRow
    | undefined
}

// ---------- Soan cau hoi ----------

export function countConfirmedForAttachment(attachmentId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM anatomy_questions WHERE attachment_id = ?')
    .get(attachmentId) as { n: number }
  return row.n
}

// Xac nhan 1 candidate thanh cau hoi that. Chot mask_boxes_json = TOAN BO o
// nhan hien co tren trang (ke ca cau bi tu choi/chua xac dinh) - on dinh, sua
// candidate sau khong lam thay doi cau hoi da xac nhan (giong quiz_questions
// snapshot options_json).
export function confirmCandidate(input: ConfirmAnatomyCandidateInput): string {
  const db = getDb()
  const candidate = candidatesRepo.getCandidate(input.candidateId)
  if (!candidate) throw new Error('Khong tim thay goi y can xac nhan.')

  const maskBoxes = candidatesRepo.listAllLabelBoxesForPage(
    candidate.attachmentId,
    candidate.pageNumber
  )

  const questionId = randomUUID()
  const insert = db.prepare(
    `INSERT INTO anatomy_questions
      (id, attachment_id, lesson_id, page_number, candidate_id, answer_text,
       accepted_alternates_json, mask_boxes_json, target_box_json, ref_width, ref_height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    insert.run(
      questionId,
      candidate.attachmentId,
      input.lessonId,
      candidate.pageNumber,
      candidate.id,
      input.answerText,
      JSON.stringify(input.acceptedAlternates),
      JSON.stringify(maskBoxes),
      JSON.stringify(candidate.labelBox),
      candidate.refWidth,
      candidate.refHeight
    )
    candidatesRepo.setCandidateStatus(candidate.id, 'confirmed')
  })
  tx()

  return questionId
}

export function deleteQuestion(questionId: string): void {
  getDb().prepare('DELETE FROM anatomy_questions WHERE id = ?').run(questionId)
}

// Xoa cau hoi lien ket voi 1 candidate (neu co) - dung khi "Bo qua vung" mot
// vung DA CO dap an (un-confirm), tranh cau hoi "ma" con lai trong ngan hang
// cau hoi sau khi candidate bi chuyen sang 'rejected'.
export function deleteQuestionByCandidateId(candidateId: string): void {
  getDb().prepare('DELETE FROM anatomy_questions WHERE candidate_id = ?').run(candidateId)
}

// Sua dap an cua 1 candidate DA confirmed - UPDATE thang, khong tao cau hoi
// moi. Dap an phu THAY THE HAN danh sach cu (khong gop).
export function updateQuestionAnswer(input: {
  candidateId: string
  answerText: string
  acceptedAlternates: string[]
}): void {
  getDb()
    .prepare(
      `UPDATE anatomy_questions
       SET answer_text = ?, accepted_alternates_json = ?, updated_at = datetime('now')
       WHERE candidate_id = ?`
    )
    .run(input.answerText, JSON.stringify(input.acceptedAlternates), input.candidateId)
}

// Cham ngay 1 cau, KHONG gan voi attempt nao - dung cho che do "Luyen tap"
// (bao dung/sai ngay sau moi cau). Khong luu vao anatomy_quiz_attempt_answers
// (chi luot Thi thu/da nop moi luu qua submitAttempt) - tranh 2 nguon ghi
// trung nhau cho cung 1 cau tra loi.
export function checkAnswer(
  questionId: string,
  submittedText: string
): { isCorrect: boolean; correctAnswerText: string } {
  const q = loadQuestion(questionId)
  if (!q) throw new Error('Khong tim thay cau hoi.')
  const acceptedAlternates = JSON.parse(q.accepted_alternates_json) as string[]
  const result = computeAnatomyAnswerResult({ answerText: q.answer_text, acceptedAlternates }, submittedText)
  return { isCorrect: result.isCorrect, correctAnswerText: q.answer_text }
}

// ---------- Lam bai thi ----------

function toPlayable(row: QuestionRow): PlayableAnatomyQuestion {
  return {
    questionId: row.id,
    pageNumber: row.page_number,
    maskBoxes: JSON.parse(row.mask_boxes_json) as Rect[],
    targetBox: JSON.parse(row.target_box_json) as Rect,
    refWidth: row.ref_width,
    refHeight: row.ref_height
  }
}

export function startAttempt(input: StartAnatomyAttemptInput): StartedAnatomyAttempt {
  const db = getDb()

  const picked = db
    .prepare(
      `SELECT * FROM anatomy_questions WHERE attachment_id = ? ORDER BY RANDOM() LIMIT ?`
    )
    .all(input.attachmentId, input.questionCount) as QuestionRow[]

  if (picked.length === 0) {
    throw new Error('Chua co cau hoi giai phau nao duoc xac nhan cho file nay.')
  }

  const attemptId = randomUUID()
  db.prepare(
    `INSERT INTO anatomy_quiz_attempts (id, attachment_id, feedback_mode, question_count)
     VALUES (?, ?, ?, ?)`
  ).run(attemptId, input.attachmentId, input.feedbackMode, picked.length)

  return {
    attemptId,
    feedbackMode: input.feedbackMode,
    questions: picked.map(toPlayable)
  }
}

function buildReview(attempt: AttemptRow, answerRows: AttemptAnswerRow[]): AnatomyAttemptReview {
  const answers: AnatomyAttemptAnswerReview[] = answerRows.map((row) => {
    const q = loadQuestion(row.question_id)
    return {
      questionId: row.question_id,
      pageNumber: q?.page_number ?? 0,
      maskBoxes: q ? (JSON.parse(q.mask_boxes_json) as Rect[]) : [],
      targetBox: q ? (JSON.parse(q.target_box_json) as Rect) : { x0: 0, y0: 0, x1: 0, y1: 0 },
      refWidth: q?.ref_width ?? 0,
      refHeight: q?.ref_height ?? 0,
      submittedText: row.submitted_text,
      correctAnswerText: q?.answer_text ?? '',
      isCorrect: row.is_correct === 1
    }
  })

  return {
    attemptId: attempt.id,
    feedbackMode: attempt.feedback_mode as AnatomyFeedbackMode,
    correctCount: attempt.correct_count ?? 0,
    totalCount: attempt.question_count,
    score: attempt.score ?? 0,
    durationSeconds: attempt.duration_seconds ?? null,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at ?? attempt.started_at,
    answers
  }
}

export function submitAttempt(input: SubmitAnatomyAttemptInput): AnatomyAttemptReview {
  const db = getDb()

  const attempt = db
    .prepare('SELECT * FROM anatomy_quiz_attempts WHERE id = ?')
    .get(input.attemptId) as AttemptRow | undefined
  if (!attempt) throw new Error('Khong tim thay luot thi.')

  let correctCount = 0
  const graded = input.answers.map((a) => {
    const q = loadQuestion(a.questionId)
    const acceptedAlternates = q
      ? (JSON.parse(q.accepted_alternates_json) as string[])
      : []
    const result = computeAnatomyAnswerResult(
      { answerText: q?.answer_text ?? '', acceptedAlternates },
      a.submittedText
    )
    if (result.isCorrect) correctCount += 1
    return { questionId: a.questionId, submittedText: a.submittedText, isCorrect: result.isCorrect }
  })

  const totalCount = attempt.question_count
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) / 10 : 0

  const insertAttemptUpdate = db.prepare(
    `UPDATE anatomy_quiz_attempts
     SET submitted_at = datetime('now'), duration_seconds = ?, correct_count = ?, score = ?
     WHERE id = ?`
  )
  const insertAnswer = db.prepare(
    `INSERT INTO anatomy_quiz_attempt_answers (id, attempt_id, question_id, submitted_text, is_correct)
     VALUES (?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    insertAttemptUpdate.run(input.durationSeconds ?? null, correctCount, score, input.attemptId)
    for (const g of graded) {
      insertAnswer.run(randomUUID(), input.attemptId, g.questionId, g.submittedText, g.isCorrect ? 1 : 0)
    }
  })
  tx()

  const updatedAttempt = db
    .prepare('SELECT * FROM anatomy_quiz_attempts WHERE id = ?')
    .get(input.attemptId) as AttemptRow
  const answerRows = db
    .prepare('SELECT * FROM anatomy_quiz_attempt_answers WHERE attempt_id = ?')
    .all(input.attemptId) as AttemptAnswerRow[]

  return buildReview(updatedAttempt, answerRows)
}

export function getAttemptReview(attemptId: string): AnatomyAttemptReview | null {
  const db = getDb()
  const attempt = db
    .prepare('SELECT * FROM anatomy_quiz_attempts WHERE id = ?')
    .get(attemptId) as AttemptRow | undefined
  if (!attempt) return null

  const answerRows = db
    .prepare('SELECT * FROM anatomy_quiz_attempt_answers WHERE attempt_id = ?')
    .all(attemptId) as AttemptAnswerRow[]

  return buildReview(attempt, answerRows)
}
