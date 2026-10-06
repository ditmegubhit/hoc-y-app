// Logic thuan cua giao dien bai thi khu Thuc hanh GP (tao de, lam bai, lich su).
// Khong phu thuoc DOM/Electron nen test duoc bang vitest.

import type { PracticeFeedbackMode, PracticeAttemptSummary, PracticeQuestionSummary } from '../types/practice'

/** Diem dat (thang 10) - giu nhu ban cu. */
export const PASS_SCORE = 4
/** Phat khi roi phong thi roi quay lai lam tiep (ms). */
export const PENALTY_ON_RESUME_MS = 3000
/** Phat khi bam "Tiep tuc" sau khi tam dung (ms). */
export const PENALTY_ON_PAUSE_MS = 1000
export const MAX_TIME_LIMIT_SECONDS = 300

// ---------- Dinh dang ----------

/** "45 giây", "2 phút 05 giây", "—" khi khong co. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes === 0) return `${rest} giây`
  return `${minutes} phút ${String(rest).padStart(2, '0')} giây`
}

/** Diem thang 10 hien thi kieu Viet: 7.5 -> "7,5", 10 -> "10". */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '0'
  const rounded = Math.round(score * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

export function scorePercent(correct: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((correct / total) * 100)
}

export function isPassed(score: number): boolean {
  return score >= PASS_SCORE
}

/** Thoi diem SQLite datetime('now') (UTC, dang "YYYY-MM-DD HH:MM:SS") -> Date. */
export function parseSqliteUtc(text: string): Date {
  const trimmed = text.trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) return new Date(trimmed.replace(' ', 'T'))
  return new Date(`${trimmed.replace(' ', 'T')}Z`)
}

export function formatDateTime(text: string): string {
  const date = parseSqliteUtc(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('vi-VN', { hour12: false })
}

/** Bo tien to "Error invoking remote method '...': Error: " cua Electron khoi thong bao loi. */
export function stripIpcError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '').trim()
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return stripIpcError(error.message) || fallback
  return fallback
}

// ---------- Phat delay ----------

export interface TimePenaltyInput {
  index: number
  remainingMs: number
  penaltyMs: number
  timeLimitMs: number
  lastIndex: number
}

export interface TimePenaltyResult {
  index: number
  remainingMs: number
  /** Cac cau bi het gio vi khoan phat (theo thu tu). */
  expiredIndices: number[]
}

/**
 * Tru thoi gian phat vao cau hien tai; neu khoan phat >= thoi gian con lai thi
 * cau do het gio, phan du tru tiep sang cau ke (moi cau co du timeLimitMs).
 * Dang o cau cuoi ma het gio -> tra remainingMs = 0 (nguoi goi se nop bai).
 */
export function applyTimePenalty(input: TimePenaltyInput): TimePenaltyResult {
  let { index, remainingMs } = input
  let debt = Math.max(0, input.penaltyMs)
  const expiredIndices: number[] = []
  if (debt === 0) return { index, remainingMs, expiredIndices }
  while (debt >= remainingMs) {
    expiredIndices.push(index)
    debt -= remainingMs
    if (index >= input.lastIndex) return { index, remainingMs: 0, expiredIndices }
    index += 1
    remainingMs = input.timeLimitMs
  }
  return { index, remainingMs: remainingMs - debt, expiredIndices }
}

// ---------- Tao de ----------

/** Thong bao loi neu thoi gian moi cau khong hop le, null neu hop le. */
export function validateTimeLimit(mode: PracticeFeedbackMode, seconds: number): string | null {
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return 'Thời gian phải là số nguyên (giây).'
  if (seconds < 0 || seconds > MAX_TIME_LIMIT_SECONDS) return 'Thời gian mỗi câu tối đa 300 giây.'
  if (mode === 'exam' && seconds < 1) return 'Thi thử phải có thời gian từ 1 đến 300 giây.'
  return null
}

export interface PageGroup {
  pageNumber: number
  questions: PracticeQuestionSummary[]
}

export function groupQuestionsByPage(questions: readonly PracticeQuestionSummary[]): PageGroup[] {
  const byPage = new Map<number, PracticeQuestionSummary[]>()
  for (const question of questions) {
    const list = byPage.get(question.pageNumber)
    if (list) list.push(question)
    else byPage.set(question.pageNumber, [question])
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([pageNumber, list]) => ({ pageNumber, questions: list }))
}

/** toPage null = khong gioi han tren; fromPage null = tu trang 1. */
export function questionsInRange(
  questions: readonly PracticeQuestionSummary[],
  fromPage: number | null,
  toPage: number | null
): PracticeQuestionSummary[] {
  const lo = fromPage ?? 1
  const hi = toPage ?? Number.MAX_SAFE_INTEGER
  return questions.filter((q) => q.pageNumber >= lo && q.pageNumber <= hi)
}

/** Cau duoc chon thuc su: nam trong khoang trang va (neu da tick tay) nam trong tap tick. */
export function effectiveSelection(
  questions: readonly PracticeQuestionSummary[],
  fromPage: number | null,
  toPage: number | null,
  manual: ReadonlySet<string> | null
): PracticeQuestionSummary[] {
  return questionsInRange(questions, fromPage, toPage).filter((q) => manual === null || manual.has(q.id))
}

// ---------- Bieu do diem ----------

export interface ScoreChartPoint {
  attemptId: string
  x: number
  y: number
  score: number
  label: string
  submittedAt: string
}

export interface ScoreChartLayout {
  width: number
  height: number
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
}

/** Diem theo thoi gian tang dan, rai deu theo thu tu (1 diem thi nam giua). */
export function buildScoreSeries(
  history: readonly PracticeAttemptSummary[],
  layout: ScoreChartLayout
): ScoreChartPoint[] {
  const sorted = [...history].sort((a, b) => {
    const ta = parseSqliteUtc(a.submittedAt).getTime()
    const tb = parseSqliteUtc(b.submittedAt).getTime()
    if (ta !== tb) return ta - tb
    return a.attemptNumber - b.attemptNumber
  })
  const innerW = layout.width - layout.padLeft - layout.padRight
  const innerH = layout.height - layout.padTop - layout.padBottom
  return sorted.map((item, i) => {
    const clamped = Math.min(10, Math.max(0, item.score))
    return {
      attemptId: item.attemptId,
      x: sorted.length === 1 ? layout.padLeft + innerW / 2 : layout.padLeft + (i / (sorted.length - 1)) * innerW,
      y: layout.padTop + innerH * (1 - clamped / 10),
      score: item.score,
      label: `${item.stationSetName} · Lần ${item.attemptNumber}`,
      submittedAt: item.submittedAt
    }
  })
}
