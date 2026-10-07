import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import { computeAnatomyAnswerResult } from '../../services/anatomy/grading'
import { shuffle, type Rng } from '../../services/practice/randomPick'
import { resolveRegionMaskColor } from '../../../shared/practice/maskColor'
import { normalizeForAnswerMatch } from '../../../shared/text/normalizeVietnamese'
import { getRegion, updateRegion } from './practiceRegions.repo'
import type { AnatomyFeedbackMode } from '../../../shared/types/anatomyQuiz'
import type {
  CheckPracticeAnswerInput,
  CreatePracticeStationSetInput,
  PlayablePracticeQuestion,
  PracticeAnswerReportKind,
  PracticeAttemptAnswerReview,
  PracticeAttemptReview,
  PracticeAttemptSummary,
  PracticeMaskBox,
  PracticeQuestionSummary,
  PracticeStationSet,
  Rect,
  ReportPracticeAnswerInput,
  ReportPracticeAnswerResult,
  SavePracticeAttemptProgressInput,
  StartedPracticeAttempt,
  StartPracticeAttemptInput,
  SubmitPracticeAttemptInput
} from '../../../shared/types/practice'

interface AttemptRow {
  id: string
  file_id: string
  station_set_id: string | null
  station_set_name: string
  feedback_mode: AnatomyFeedbackMode
  question_count: number
  started_at: string
  submitted_at: string | null
  duration_seconds: number | null
  correct_count: number | null
  score: number | null
  time_limit_seconds: number
  status: 'in_progress' | 'completed'
  current_index: number
  remaining_ms: number | null
  penalty_debt_ms: number
  attempt_number: number
  saved_history: number
}

interface AttemptQuestionRow {
  attempt_id: string
  region_id: string
  position: number
  page_number: number
  answer_text: string
  alternates_json: string
  label_box_json: string
  crop_box_json: string | null
  ref_width: number
  ref_height: number
  masks_json: string
}

interface AnswerRow {
  id: string
  attempt_id: string
  region_id: string
  submitted_text: string
  is_correct: number
}

interface RegionForSet {
  id: string
  page_number: number
  status: string
  answer_text: string | null
  alternates_json: string
  label_box_json: string
  crop_box_json: string | null
  ref_width: number
  ref_height: number
  color_override: string | null
}

// ---------- Danh sach cau ----------

/** Cac cau (vung 'confirmed' co dap an) tren trang KHONG bi loai khoi bai thi. */
export function listQuestionSummaries(fileId: string): PracticeQuestionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.page_number, r.answer_text FROM practice_regions r
       LEFT JOIN practice_page_reviews pr ON pr.file_id = r.file_id AND pr.page_number = r.page_number
       WHERE r.file_id = ? AND r.status = 'confirmed' AND TRIM(COALESCE(r.answer_text, '')) != ''
         AND COALESCE(pr.excluded, 0) = 0
       ORDER BY r.page_number, r.created_at, r.rowid`
    )
    .all(fileId) as { id: string; page_number: number; answer_text: string }[]
  return rows.map((r) => ({ id: r.id, pageNumber: r.page_number, answerText: r.answer_text }))
}

// ---------- De (station set) ----------

function mapSet(row: Record<string, unknown>): PracticeStationSet {
  return {
    id: String(row.id),
    fileId: String(row.file_id),
    name: String(row.name),
    feedbackMode: row.feedback_mode as AnatomyFeedbackMode,
    timeLimitSeconds: Number(row.time_limit_seconds),
    questionCount: Number(row.question_count),
    isReviewSet: row.source_attempt_id !== null && row.source_attempt_id !== undefined,
    createdAt: String(row.created_at),
    nextAttemptNumber: Number(row.next_attempt_number)
  }
}

const SET_SELECT = `
  SELECT s.*, COUNT(sq.region_id) AS question_count,
    COALESCE((SELECT MAX(a.attempt_number) + 1 FROM practice_attempts a WHERE a.station_set_id = s.id), 1) AS next_attempt_number
  FROM practice_station_sets s
  LEFT JOIN practice_station_set_questions sq ON sq.station_set_id = s.id`

export function listStationSets(fileId: string): PracticeStationSet[] {
  const rows = getDb()
    .prepare(`${SET_SELECT} WHERE s.file_id = ? GROUP BY s.id ORDER BY s.created_at DESC, s.rowid DESC`)
    .all(fileId) as Record<string, unknown>[]
  return rows.map(mapSet)
}

function getStationSet(id: string): PracticeStationSet | null {
  const row = getDb().prepare(`${SET_SELECT} WHERE s.id = ? GROUP BY s.id`).get(id) as Record<string, unknown> | undefined
  return row ? mapSet(row) : null
}

function assertTimeLimit(feedbackMode: AnatomyFeedbackMode, seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300) {
    throw new Error('Thời gian mỗi câu phải từ 0 đến 300 giây.')
  }
  if (feedbackMode === 'exam' && seconds < 1) throw new Error('Thi thử phải có thời gian từ 1 đến 300 giây.')
}

function insertStationSet(input: {
  fileId: string
  name: string
  feedbackMode: AnatomyFeedbackMode
  timeLimitSeconds: number
  regionIds: string[]
  sourceAttemptId: string | null
}): PracticeStationSet {
  assertTimeLimit(input.feedbackMode, input.timeLimitSeconds)
  const db = getDb()
  const unique = [...new Set(input.regionIds)]
  const valid: string[] = []
  const lookup = db.prepare(
    "SELECT id FROM practice_regions WHERE id = ? AND file_id = ? AND status = 'confirmed' AND TRIM(COALESCE(answer_text, '')) != ''"
  )
  for (const regionId of unique) {
    if (lookup.get(regionId, input.fileId)) valid.push(regionId)
  }
  if (valid.length === 0) throw new Error('Chưa có câu hỏi nào hợp lệ để tạo bài thi.')

  const id = randomUUID()
  const count = db.prepare('SELECT COUNT(*) AS n FROM practice_station_sets WHERE file_id = ?').get(input.fileId) as { n: number }
  const name = input.name.trim() || `Đề ${count.n + 1}`
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO practice_station_sets (id, file_id, name, feedback_mode, time_limit_seconds, source_attempt_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.fileId, name, input.feedbackMode, input.timeLimitSeconds, input.sourceAttemptId)
    const ins = db.prepare('INSERT INTO practice_station_set_questions (station_set_id, region_id, position) VALUES (?, ?, ?)')
    valid.forEach((regionId, index) => ins.run(id, regionId, index))
  })
  tx()
  return getStationSet(id) as PracticeStationSet
}

export function createStationSet(input: CreatePracticeStationSetInput): PracticeStationSet {
  return insertStationSet({ ...input, sourceAttemptId: null })
}

export function deleteStationSet(stationSetId: string): void {
  getDb().prepare('DELETE FROM practice_station_sets WHERE id = ?').run(stationSetId)
}

/** Tao bo "on cau sai" tu 1 luot da nop: cac cau sai/bo trong con ton tai va con hop le. */
export function createReviewSet(attemptId: string): PracticeStationSet {
  const db = getDb()
  const attempt = db.prepare('SELECT * FROM practice_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined
  if (!attempt) throw new Error('Không tìm thấy lượt thi.')
  if (attempt.status !== 'completed') throw new Error('Lượt thi chưa nộp bài nên chưa ôn câu sai được.')
  const wrong = db
    .prepare(
      `SELECT q.region_id FROM practice_attempt_questions q
       LEFT JOIN practice_attempt_answers a ON a.attempt_id = q.attempt_id AND a.region_id = q.region_id
       WHERE q.attempt_id = ? AND COALESCE(a.is_correct, 0) = 0
       ORDER BY q.position`
    )
    .all(attemptId) as { region_id: string }[]
  if (wrong.length === 0) throw new Error('Lượt thi này không có câu sai.')
  const baseName = attempt.station_set_name || 'Đề'
  return insertStationSet({
    fileId: attempt.file_id,
    name: `Ôn câu sai – ${baseName} · lần ${attempt.attempt_number}`,
    feedbackMode: 'practice',
    timeLimitSeconds: attempt.time_limit_seconds,
    regionIds: wrong.map((w) => w.region_id),
    sourceAttemptId: attemptId
  })
}

// ---------- Lam bai ----------

function toPlayable(row: AttemptQuestionRow): PlayablePracticeQuestion {
  return {
    regionId: row.region_id,
    pageNumber: row.page_number,
    masks: JSON.parse(row.masks_json) as PracticeMaskBox[],
    targetBox: JSON.parse(row.label_box_json) as Rect,
    refWidth: row.ref_width,
    refHeight: row.ref_height,
    cropBox: row.crop_box_json ? (JSON.parse(row.crop_box_json) as Rect) : null
  }
}

function loadAttemptQuestions(attemptId: string): AttemptQuestionRow[] {
  return getDb()
    .prepare('SELECT * FROM practice_attempt_questions WHERE attempt_id = ? ORDER BY position')
    .all(attemptId) as AttemptQuestionRow[]
}

function loadAnswers(attemptId: string): AnswerRow[] {
  return getDb().prepare('SELECT * FROM practice_attempt_answers WHERE attempt_id = ?').all(attemptId) as AnswerRow[]
}

/** Bat dau 1 luot: chup (snapshot) dap an, o hoi va lop che cua tung cau, xao thu tu moi luot. */
export function startAttempt(input: StartPracticeAttemptInput, rng: Rng = Math.random): StartedPracticeAttempt {
  const db = getDb()
  const set = db.prepare('SELECT * FROM practice_station_sets WHERE id = ?').get(input.stationSetId) as
    | { id: string; file_id: string; name: string; feedback_mode: AnatomyFeedbackMode; time_limit_seconds: number }
    | undefined
  if (!set) throw new Error('Không tìm thấy đề thi.')

  const regions = db
    .prepare(
      `SELECT r.* FROM practice_station_set_questions sq
       JOIN practice_regions r ON r.id = sq.region_id
       WHERE sq.station_set_id = ? AND r.status = 'confirmed' AND TRIM(COALESCE(r.answer_text, '')) != ''
       ORDER BY sq.position`
    )
    .all(set.id) as RegionForSet[]
  if (regions.length === 0) throw new Error('Đề này chưa còn câu hỏi hợp lệ nào.')
  const picked = shuffle(regions, rng)

  const fileColor = (db.prepare('SELECT mask_color FROM practice_files WHERE node_id = ?').get(set.file_id) as
    | { mask_color: string }
    | undefined)?.mask_color
  const masksByPage = new Map<number, PracticeMaskBox[]>()
  const masksFor = (page: number): PracticeMaskBox[] => {
    const cached = masksByPage.get(page)
    if (cached) return cached
    const rows = db
      .prepare('SELECT label_box_json, color_override FROM practice_regions WHERE file_id = ? AND page_number = ? ORDER BY created_at, rowid')
      .all(set.file_id, page) as { label_box_json: string; color_override: string | null }[]
    const masks = rows.map((r) => ({
      box: JSON.parse(r.label_box_json) as Rect,
      color: resolveRegionMaskColor(r.color_override, fileColor)
    }))
    masksByPage.set(page, masks)
    return masks
  }

  const attemptId = randomUUID()
  const attemptNo = (db
    .prepare('SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n FROM practice_attempts WHERE station_set_id = ?')
    .get(set.id) as { n: number }).n
  const initialMs = set.time_limit_seconds === 0 ? null : set.time_limit_seconds * 1000

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO practice_attempts
        (id, file_id, station_set_id, station_set_name, feedback_mode, question_count, time_limit_seconds,
         current_index, remaining_ms, attempt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(attemptId, set.file_id, set.id, set.name, set.feedback_mode, picked.length, set.time_limit_seconds, initialMs, attemptNo)
    const ins = db.prepare(
      `INSERT INTO practice_attempt_questions
        (attempt_id, region_id, position, page_number, answer_text, alternates_json, label_box_json,
         crop_box_json, ref_width, ref_height, masks_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    picked.forEach((r, index) =>
      ins.run(
        attemptId, r.id, index, r.page_number, (r.answer_text ?? '').trim(), r.alternates_json,
        r.label_box_json, r.crop_box_json, r.ref_width, r.ref_height, JSON.stringify(masksFor(r.page_number))
      ))
  })
  tx()

  return {
    attemptId,
    fileId: set.file_id,
    feedbackMode: set.feedback_mode,
    stationSetId: set.id,
    stationSetName: set.name,
    attemptNumber: attemptNo,
    timeLimitSeconds: set.time_limit_seconds,
    currentIndex: 0,
    remainingMs: initialMs,
    penaltyDebtMs: 0,
    questions: loadAttemptQuestions(attemptId).map(toPlayable),
    answers: []
  }
}

export function saveAttemptProgress(input: SavePracticeAttemptProgressInput): void {
  const db = getDb()
  const attempt = db.prepare('SELECT status FROM practice_attempts WHERE id = ?').get(input.attemptId) as
    | { status: string }
    | undefined
  if (!attempt || attempt.status !== 'in_progress') return
  const valid = new Set(loadAttemptQuestions(input.attemptId).map((q) => q.region_id))
  const tx = db.transaction(() => {
    db.prepare('UPDATE practice_attempts SET current_index = ?, remaining_ms = ?, penalty_debt_ms = ? WHERE id = ?')
      .run(input.currentIndex, input.remainingMs, input.penaltyDebtMs, input.attemptId)
    db.prepare('DELETE FROM practice_attempt_answers WHERE attempt_id = ?').run(input.attemptId)
    const ins = db.prepare(
      'INSERT INTO practice_attempt_answers (id, attempt_id, region_id, submitted_text, is_correct) VALUES (?, ?, ?, ?, 0)'
    )
    for (const answer of input.answers) {
      if (valid.has(answer.regionId)) ins.run(randomUUID(), input.attemptId, answer.regionId, answer.submittedText)
    }
  })
  tx()
}

export function resumeAttempt(attemptId: string): StartedPracticeAttempt | null {
  const attempt = getDb()
    .prepare("SELECT * FROM practice_attempts WHERE id = ? AND status = 'in_progress'")
    .get(attemptId) as AttemptRow | undefined
  if (!attempt) return null
  return {
    attemptId,
    fileId: attempt.file_id,
    feedbackMode: attempt.feedback_mode,
    stationSetId: attempt.station_set_id,
    stationSetName: attempt.station_set_name,
    attemptNumber: attempt.attempt_number,
    timeLimitSeconds: attempt.time_limit_seconds,
    currentIndex: attempt.current_index,
    remainingMs: attempt.remaining_ms,
    penaltyDebtMs: attempt.penalty_debt_ms,
    questions: loadAttemptQuestions(attemptId).map(toPlayable),
    answers: loadAnswers(attemptId).map((a) => ({ regionId: a.region_id, submittedText: a.submitted_text }))
  }
}

/** Luot dang lam do gan nhat cua file (de hoi "tiep tuc?"), null neu khong co. */
export function findActiveAttempt(fileId: string): string | null {
  const row = getDb()
    .prepare("SELECT id FROM practice_attempts WHERE file_id = ? AND status = 'in_progress' ORDER BY started_at DESC, rowid DESC LIMIT 1")
    .get(fileId) as { id: string } | undefined
  return row?.id ?? null
}

function gradeOne(question: AttemptQuestionRow | undefined, submittedText: string): boolean {
  if (!question) return false
  return computeAnatomyAnswerResult(
    { answerText: question.answer_text, acceptedAlternates: JSON.parse(question.alternates_json) as string[] },
    submittedText
  ).isCorrect
}

/** Cham tuc thi 1 cau (che do luyen tap) theo ban chup cua luot; khong ghi DB. */
export function checkAnswer(input: CheckPracticeAnswerInput): { isCorrect: boolean; correctAnswerText: string } {
  const question = getDb()
    .prepare('SELECT * FROM practice_attempt_questions WHERE attempt_id = ? AND region_id = ?')
    .get(input.attemptId, input.regionId) as AttemptQuestionRow | undefined
  if (!question) throw new Error('Không tìm thấy câu hỏi trong lượt thi.')
  return { isCorrect: gradeOne(question, input.submittedText), correctAnswerText: question.answer_text }
}

/** Ap dung 1 thao tac bao cao len (dap an, dap an chap nhan duoc): them dap an dung hoac thay dap an goc. */
function applyAnswerReport(
  answerText: string,
  alternates: string[],
  kind: PracticeAnswerReportKind,
  text: string
): { answerText: string; alternates: string[] } {
  if (kind === 'add') {
    const known = new Set([answerText, ...alternates].map(normalizeForAnswerMatch))
    return { answerText, alternates: known.has(normalizeForAnswerMatch(text)) ? alternates : [...alternates, text] }
  }
  return { answerText: text, alternates: alternates.filter((a) => normalizeForAnswerMatch(a) !== normalizeForAnswerMatch(text)) }
}

/**
 * Nguoi dung bao cham sai: bo sung dap an dung ('add') hoac sua dap an goc ('replace').
 * Ghi vao vung goc (luot sau dung ngay) va vao ban chup cua luot nay; luot da nop duoc cham lai
 * cau do, cap nhat so cau dung va diem. Thi thu dang lam bi khoa de khong lo dap an giua chung.
 */
export function reportAnswerIssue(input: ReportPracticeAnswerInput): ReportPracticeAnswerResult {
  const db = getDb()
  const text = input.text.trim()
  if (text === '') throw new Error('Đáp án không được để trống.')
  const attempt = db.prepare('SELECT * FROM practice_attempts WHERE id = ?').get(input.attemptId) as AttemptRow | undefined
  if (!attempt) throw new Error('Không tìm thấy lượt thi.')
  if (attempt.status === 'in_progress' && attempt.feedback_mode === 'exam') {
    throw new Error('Thi thử chỉ báo cáo sai sót được sau khi nộp bài.')
  }
  const snapshot = db
    .prepare('SELECT * FROM practice_attempt_questions WHERE attempt_id = ? AND region_id = ?')
    .get(input.attemptId, input.regionId) as AttemptQuestionRow | undefined
  if (!snapshot) throw new Error('Không tìm thấy câu hỏi trong lượt thi.')
  const region = getRegion(input.regionId)
  if (!region) throw new Error('Câu hỏi này không còn trong file nên không sửa được đáp án.')

  let review: PracticeAttemptReview | null = null
  let regraded: AttemptQuestionRow = snapshot
  let isCorrect = false
  const tx = db.transaction(() => {
    const live = applyAnswerReport(region.answerText ?? '', region.alternates, input.kind, text)
    updateRegion(region.id, { answerText: live.answerText, alternates: live.alternates })
    const frozen = applyAnswerReport(snapshot.answer_text, JSON.parse(snapshot.alternates_json) as string[], input.kind, text)
    db.prepare('UPDATE practice_attempt_questions SET answer_text = ?, alternates_json = ? WHERE attempt_id = ? AND region_id = ?')
      .run(frozen.answerText, JSON.stringify(frozen.alternates), input.attemptId, input.regionId)
    regraded = { ...snapshot, answer_text: frozen.answerText, alternates_json: JSON.stringify(frozen.alternates) }

    if (attempt.status !== 'completed') {
      isCorrect = gradeOne(regraded, input.submittedText)
      return
    }
    const stored = db.prepare('SELECT * FROM practice_attempt_answers WHERE attempt_id = ? AND region_id = ?')
      .get(input.attemptId, input.regionId) as AnswerRow | undefined
    isCorrect = gradeOne(regraded, stored?.submitted_text ?? '')
    if (stored) db.prepare('UPDATE practice_attempt_answers SET is_correct = ? WHERE id = ?').run(isCorrect ? 1 : 0, stored.id)
    const correctCount = (db.prepare('SELECT COUNT(*) AS n FROM practice_attempt_answers WHERE attempt_id = ? AND is_correct = 1')
      .get(input.attemptId) as { n: number }).n
    const score = attempt.question_count > 0 ? Math.round((correctCount / attempt.question_count) * 100) / 10 : 0
    db.prepare('UPDATE practice_attempts SET correct_count = ?, score = ? WHERE id = ?').run(correctCount, score, input.attemptId)
  })
  tx()
  if (attempt.status === 'completed') {
    review = buildReview(db.prepare('SELECT * FROM practice_attempts WHERE id = ?').get(input.attemptId) as AttemptRow)
  }
  return { isCorrect, correctAnswerText: regraded.answer_text, review }
}

function buildReview(attempt: AttemptRow): PracticeAttemptReview {
  const answers = new Map(loadAnswers(attempt.id).map((a) => [a.region_id, a]))
  const reviews: PracticeAttemptAnswerReview[] = loadAttemptQuestions(attempt.id).map((q) => {
    const answer = answers.get(q.region_id)
    return {
      regionId: q.region_id,
      pageNumber: q.page_number,
      masks: JSON.parse(q.masks_json) as PracticeMaskBox[],
      targetBox: JSON.parse(q.label_box_json) as Rect,
      refWidth: q.ref_width,
      refHeight: q.ref_height,
      cropBox: q.crop_box_json ? (JSON.parse(q.crop_box_json) as Rect) : null,
      submittedText: answer?.submitted_text ?? '',
      correctAnswerText: q.answer_text,
      isCorrect: answer?.is_correct === 1
    }
  })
  return {
    attemptId: attempt.id,
    fileId: attempt.file_id,
    feedbackMode: attempt.feedback_mode,
    correctCount: attempt.correct_count ?? 0,
    totalCount: attempt.question_count,
    score: attempt.score ?? 0,
    durationSeconds: attempt.duration_seconds,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at ?? attempt.started_at,
    attemptNumber: attempt.attempt_number,
    stationSetName: attempt.station_set_name,
    answers: reviews
  }
}

/** Nop bai: cham theo ban chup, luu cau tra loi + diem (thang 10). Nop lai luot da nop chi tra ket qua cu. */
export function submitAttempt(input: SubmitPracticeAttemptInput): PracticeAttemptReview {
  const db = getDb()
  const attempt = db.prepare('SELECT * FROM practice_attempts WHERE id = ?').get(input.attemptId) as AttemptRow | undefined
  if (!attempt) throw new Error('Không tìm thấy lượt thi.')
  if (attempt.status === 'completed') return buildReview(attempt)

  const questions = new Map(loadAttemptQuestions(input.attemptId).map((q) => [q.region_id, q]))
  const submitted = new Map<string, string>()
  for (const answer of input.answers) {
    if (questions.has(answer.regionId)) submitted.set(answer.regionId, answer.submittedText)
  }

  let correctCount = 0
  const graded: { regionId: string; submittedText: string; isCorrect: boolean }[] = []
  for (const regionId of questions.keys()) {
    const submittedText = submitted.get(regionId) ?? ''
    const isCorrect = gradeOne(questions.get(regionId), submittedText)
    if (isCorrect) correctCount += 1
    graded.push({ regionId, submittedText, isCorrect })
  }
  const total = attempt.question_count
  const score = total > 0 ? Math.round((correctCount / total) * 100) / 10 : 0

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM practice_attempt_answers WHERE attempt_id = ?').run(input.attemptId)
    const ins = db.prepare(
      'INSERT INTO practice_attempt_answers (id, attempt_id, region_id, submitted_text, is_correct) VALUES (?, ?, ?, ?, ?)'
    )
    for (const g of graded) ins.run(randomUUID(), input.attemptId, g.regionId, g.submittedText, g.isCorrect ? 1 : 0)
    db.prepare(
      `UPDATE practice_attempts SET submitted_at = datetime('now'), duration_seconds = ?, correct_count = ?, score = ?,
         status = 'completed', saved_history = ? WHERE id = ?`
    ).run(input.durationSeconds, correctCount, score, attempt.feedback_mode === 'exam' ? 1 : 0, input.attemptId)
  })
  tx()
  return buildReview(db.prepare('SELECT * FROM practice_attempts WHERE id = ?').get(input.attemptId) as AttemptRow)
}

export function getAttemptReview(attemptId: string): PracticeAttemptReview | null {
  const attempt = getDb()
    .prepare("SELECT * FROM practice_attempts WHERE id = ? AND status = 'completed'")
    .get(attemptId) as AttemptRow | undefined
  return attempt ? buildReview(attempt) : null
}

/** Lich su: cac luot da nop o che do thi thu (luyen tap khong luu lich su). */
export function listAttemptHistory(fileId: string): PracticeAttemptSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, station_set_name, attempt_number, feedback_mode, score, correct_count, question_count, submitted_at
       FROM practice_attempts
       WHERE file_id = ? AND status = 'completed' AND saved_history = 1
       ORDER BY submitted_at DESC, started_at DESC, rowid DESC`
    )
    .all(fileId) as {
      id: string; station_set_name: string; attempt_number: number; feedback_mode: AnatomyFeedbackMode
      score: number; correct_count: number; question_count: number; submitted_at: string
    }[]
  return rows.map((r) => ({
    attemptId: r.id,
    stationSetName: r.station_set_name,
    attemptNumber: r.attempt_number,
    feedbackMode: r.feedback_mode,
    score: r.score,
    correctCount: r.correct_count,
    totalCount: r.question_count,
    submittedAt: r.submitted_at
  }))
}

export function deleteAttemptHistory(attemptId: string): void {
  getDb()
    .prepare("DELETE FROM practice_attempts WHERE id = ? AND saved_history = 1 AND status = 'completed'")
    .run(attemptId)
}
