import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import * as candidatesRepo from './anatomyCandidates.repo'
import { computeAnatomyAnswerResult } from '../../services/anatomy/grading'
import type {
  AnatomyAttemptAnswerReview,
  AnatomyAttemptReview,
  AnatomyAttemptSummary,
  AnatomyFeedbackMode,
  AnatomyQuestionSummary,
  AnatomyStationSet,
  ConfirmAnatomyCandidateInput,
  CreateAnatomyStationSetInput,
  PlayableAnatomyQuestion,
  Rect,
  StartAnatomyAttemptInput,
  StartedAnatomyAttempt,
  SaveAnatomyAttemptProgressInput,
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
  crop_box_json: string | null
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
  station_set_id: string | null
  time_limit_seconds: number
  status: string
  current_index: number
  remaining_ms: number | null
  penalty_debt_ms: number
  attempt_number: number
  saved_history: number
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

function splitSuggestedAnswer(raw: string): { answerText: string; alternates: string[] } {
  const values = raw.split('/').map((part) => part.trim()).filter(Boolean)
  return { answerText: values[0] ?? raw.trim(), alternates: values.slice(1) }
}

function isUsableAutomaticLabel(raw: string): boolean {
  const text = raw.trim()
  if ((text.match(/[\p{L}]/gu) ?? []).length < 2) return false
  // Ma nhom/buoi thuc hanh, khong phai cau truc giai phau.
  if (/^gp\s*\d+[\s._-]*[ivx]*$/iu.test(text)) return false
  return true
}

/** Tao cau hoi dung-duoc-ngay cho moi o OCR; dap an OCR chi la goi y va co
 * the sua trong giao dien. */
export function ensureAutoQuestionsForPage(attachmentId: string, lessonId: string, pageNumber: number): void {
  const db = getDb()
  const candidates = candidatesRepo.listCandidatesForPage(attachmentId, pageNumber)
    .filter((candidate) => candidate.status === 'pending' && isUsableAutomaticLabel(candidate.rawText))
  const insert = db.prepare(
    `INSERT INTO anatomy_questions
      (id, attachment_id, lesson_id, page_number, candidate_id, answer_text,
       accepted_alternates_json, mask_boxes_json, target_box_json, ref_width, ref_height, crop_box_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const masks = candidatesRepo.listAllLabelBoxesForPage(attachmentId, pageNumber)
  const tx = db.transaction(() => {
    for (const candidate of candidates) {
      const exists = db.prepare('SELECT 1 FROM anatomy_questions WHERE candidate_id = ?').get(candidate.id)
      if (exists) continue
      const suggested = splitSuggestedAnswer(candidate.rawText)
      insert.run(
        randomUUID(), attachmentId, lessonId, pageNumber, candidate.id,
        suggested.answerText, JSON.stringify(suggested.alternates), JSON.stringify(masks),
        JSON.stringify(candidate.labelBox), candidate.refWidth, candidate.refHeight,
        candidate.cropBox ? JSON.stringify(candidate.cropBox) : null
      )
      candidatesRepo.setCandidateStatus(candidate.id, 'confirmed')
    }
  })
  tx()
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
       accepted_alternates_json, mask_boxes_json, target_box_json, ref_width, ref_height, crop_box_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      candidate.refHeight,
      candidate.cropBox ? JSON.stringify(candidate.cropBox) : null
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

export function refreshPageQuestionGeometry(attachmentId: string, pageNumber: number): void {
  const masks = candidatesRepo.listAllLabelBoxesForPage(attachmentId, pageNumber)
  const candidates = candidatesRepo.listCandidatesForPage(attachmentId, pageNumber)
  const update = getDb().prepare(
    `UPDATE anatomy_questions SET mask_boxes_json = ?, target_box_json = ?, crop_box_json = ?, updated_at = datetime('now')
     WHERE candidate_id = ?`
  )
  const tx = getDb().transaction(() => {
    for (const candidate of candidates) {
      update.run(
        JSON.stringify(masks), JSON.stringify(candidate.labelBox),
        candidate.cropBox ? JSON.stringify(candidate.cropBox) : null, candidate.id
      )
    }
  })
  tx()
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
  const liveMasks = candidatesRepo.listAllLabelBoxesForPage(row.attachment_id, row.page_number)
  return {
    questionId: row.id,
    pageNumber: row.page_number,
    maskBoxes: liveMasks.length > 0 ? liveMasks : (JSON.parse(row.mask_boxes_json) as Rect[]),
    targetBox: JSON.parse(row.target_box_json) as Rect,
    refWidth: row.ref_width,
    refHeight: row.ref_height,
    cropBox: row.crop_box_json ? (JSON.parse(row.crop_box_json) as Rect) : null
  }
}

export function listQuestionSummaries(attachmentId: string): AnatomyQuestionSummary[] {
  return (getDb().prepare(
    `SELECT q.id, q.page_number, q.answer_text FROM anatomy_questions q
     LEFT JOIN anatomy_page_reviews pr ON pr.attachment_id = q.attachment_id AND pr.page_number = q.page_number
     WHERE q.attachment_id = ? AND COALESCE(pr.excluded, 0) = 0
     ORDER BY q.page_number, q.created_at`
  ).all(attachmentId) as { id: string; page_number: number; answer_text: string }[]).map((row) => ({
    id: row.id, pageNumber: row.page_number, answerText: row.answer_text, selected: true
  }))
}

export function listStationSets(attachmentId: string): AnatomyStationSet[] {
  const rows = getDb().prepare(
    `SELECT s.*, COUNT(sq.question_id) AS question_count,
       COALESCE((SELECT MAX(a.attempt_number) + 1 FROM anatomy_quiz_attempts a WHERE a.station_set_id = s.id), 1) AS next_attempt_number
     FROM anatomy_station_sets s
     LEFT JOIN anatomy_station_set_questions sq ON sq.station_set_id = s.id
     WHERE s.attachment_id = ? GROUP BY s.id ORDER BY s.created_at DESC`
  ).all(attachmentId) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id), attachmentId: String(row.attachment_id), name: String(row.name),
    feedbackMode: row.feedback_mode as AnatomyFeedbackMode,
    timeLimitSeconds: Number(row.time_limit_seconds), questionCount: Number(row.question_count),
    createdAt: String(row.created_at), nextAttemptNumber: Number(row.next_attempt_number)
  }))
}

export function createStationSet(input: CreateAnatomyStationSetInput): AnatomyStationSet {
  const db = getDb()
  const id = randomUUID()
  const sequence = db.prepare('SELECT COUNT(*) AS n FROM anatomy_station_sets WHERE attachment_id = ?')
    .get(input.attachmentId) as { n: number }
  const name = `Thi TH GP – ${input.questionIds.length} câu – ${input.timeLimitSeconds === 0 ? 'không giới hạn' : `${input.timeLimitSeconds} giây`}`
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO anatomy_station_sets (id, attachment_id, name, feedback_mode, time_limit_seconds)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, input.attachmentId, `${name} · Đề ${sequence.n + 1}`, input.feedbackMode, input.timeLimitSeconds)
    const insert = db.prepare(
      'INSERT INTO anatomy_station_set_questions (station_set_id, question_id, position) VALUES (?, ?, ?)'
    )
    input.questionIds.forEach((questionId, index) => insert.run(id, questionId, index))
  })
  tx()
  return listStationSets(input.attachmentId).find((set) => set.id === id)!
}

export function deleteStationSet(stationSetId: string): void {
  getDb().prepare('DELETE FROM anatomy_station_sets WHERE id = ?').run(stationSetId)
}

export function startAttempt(input: StartAnatomyAttemptInput): StartedAnatomyAttempt {
  const db = getDb()
  const set = db.prepare('SELECT * FROM anatomy_station_sets WHERE id = ?').get(input.stationSetId) as
    | { id: string; attachment_id: string; name: string; feedback_mode: AnatomyFeedbackMode; time_limit_seconds: number }
    | undefined
  if (!set) throw new Error('Không tìm thấy đề chạy trạm.')
  const picked = db.prepare(
    `SELECT q.* FROM anatomy_station_set_questions sq
     JOIN anatomy_questions q ON q.id = sq.question_id
     WHERE sq.station_set_id = ? ORDER BY RANDOM()`
  ).all(set.id) as QuestionRow[]

  if (picked.length === 0) {
    throw new Error('Chua co cau hoi giai phau nao duoc xac nhan cho file nay.')
  }

  const attemptId = randomUUID()
  const attemptNoRow = db.prepare(
    'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n FROM anatomy_quiz_attempts WHERE station_set_id = ?'
  ).get(set.id) as { n: number }
  const initialMs = set.time_limit_seconds === 0 ? null : set.time_limit_seconds * 1000
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO anatomy_quiz_attempts
       (id, attachment_id, feedback_mode, question_count, station_set_id, time_limit_seconds,
        current_index, remaining_ms, attempt_number)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(attemptId, set.attachment_id, set.feedback_mode, picked.length, set.id, set.time_limit_seconds, initialMs, attemptNoRow.n)
    const insert = db.prepare(
      'INSERT INTO anatomy_attempt_questions (attempt_id, question_id, position) VALUES (?, ?, ?)'
    )
    picked.forEach((question, index) => insert.run(attemptId, question.id, index))
  })
  tx()

  return {
    attemptId,
    feedbackMode: set.feedback_mode,
    stationSetId: set.id,
    stationSetName: set.name,
    attemptNumber: attemptNoRow.n,
    timeLimitSeconds: set.time_limit_seconds,
    currentIndex: 0,
    remainingMs: initialMs,
    penaltyDebtMs: 0,
    questions: picked.map(toPlayable)
  }
}

export function saveAttemptProgress(input: SaveAnatomyAttemptProgressInput): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE anatomy_quiz_attempts SET current_index = ?, remaining_ms = ?, penalty_debt_ms = ? WHERE id = ?`
    ).run(input.currentIndex, input.remainingMs, input.penaltyDebtMs, input.attemptId)
    db.prepare('DELETE FROM anatomy_quiz_attempt_answers WHERE attempt_id = ?').run(input.attemptId)
    const insert = db.prepare(
      `INSERT INTO anatomy_quiz_attempt_answers (id, attempt_id, question_id, submitted_text, is_correct)
       VALUES (?, ?, ?, ?, 0)`
    )
    input.answers.forEach((answer) => insert.run(randomUUID(), input.attemptId, answer.questionId, answer.submittedText))
  })
  tx()
}

export function resumeAttempt(attemptId: string): StartedAnatomyAttempt | null {
  const db = getDb()
  const attempt = db.prepare('SELECT * FROM anatomy_quiz_attempts WHERE id = ? AND status = ?')
    .get(attemptId, 'in_progress') as AttemptRow | undefined
  if (!attempt || !attempt.station_set_id) return null
  const set = db.prepare('SELECT name FROM anatomy_station_sets WHERE id = ?').get(attempt.station_set_id) as { name: string } | undefined
  const questions = db.prepare(
    `SELECT q.* FROM anatomy_attempt_questions aq JOIN anatomy_questions q ON q.id = aq.question_id
     WHERE aq.attempt_id = ? ORDER BY aq.position`
  ).all(attemptId) as QuestionRow[]
  return {
    attemptId, feedbackMode: attempt.feedback_mode as AnatomyFeedbackMode,
    stationSetId: attempt.station_set_id, stationSetName: set?.name ?? 'Thi TH GP',
    attemptNumber: attempt.attempt_number, timeLimitSeconds: attempt.time_limit_seconds,
    currentIndex: attempt.current_index, remainingMs: attempt.remaining_ms,
    penaltyDebtMs: attempt.penalty_debt_ms, questions: questions.map(toPlayable)
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
      cropBox: q?.crop_box_json ? (JSON.parse(q.crop_box_json) as Rect) : null,
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
    attemptNumber: attempt.attempt_number,
    stationSetName: attempt.station_set_id
      ? ((getDb().prepare('SELECT name FROM anatomy_station_sets WHERE id = ?').get(attempt.station_set_id) as { name: string } | undefined)?.name ?? 'Thi TH GP')
      : 'Thi TH GP',
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
    db.prepare('DELETE FROM anatomy_quiz_attempt_answers WHERE attempt_id = ?').run(input.attemptId)
    insertAttemptUpdate.run(input.durationSeconds ?? null, correctCount, score, input.attemptId)
    db.prepare(
      `UPDATE anatomy_quiz_attempts SET status = 'completed', saved_history = ? WHERE id = ?`
    ).run(attempt.feedback_mode === 'exam' && attempt.time_limit_seconds === 30 ? 1 : 0, input.attemptId)
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

export function listAttemptHistory(attachmentId: string): AnatomyAttemptSummary[] {
  const rows = getDb().prepare(
    `SELECT a.id, a.attempt_number, a.score, a.correct_count, a.question_count, a.submitted_at, s.name
     FROM anatomy_quiz_attempts a
     LEFT JOIN anatomy_station_sets s ON s.id = a.station_set_id
     WHERE a.attachment_id = ? AND a.status = 'completed' AND a.saved_history = 1
     ORDER BY a.submitted_at DESC, a.started_at DESC`
  ).all(attachmentId) as Array<{
    id: string; attempt_number: number; score: number; correct_count: number
    question_count: number; submitted_at: string; name: string | null
  }>
  return rows.map((row) => ({
    attemptId: row.id, stationSetName: row.name ?? 'Thi TH GP', attemptNumber: row.attempt_number,
    score: row.score, correctCount: row.correct_count, totalCount: row.question_count,
    submittedAt: row.submitted_at
  }))
}

export function deleteAttemptHistory(attemptId: string): void {
  getDb().prepare("DELETE FROM anatomy_quiz_attempts WHERE id = ? AND saved_history = 1 AND status = 'completed'").run(attemptId)
}
