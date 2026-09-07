import type { AttemptAnswerReview } from '../types/quiz'

// Logic thuan cho giao dien lam bai kieu LMS: dinh dang dong ho, suy ra trang
// thai cac o trong bang dieu huong cau, tom tat tien do, loc cau khi xem lai.
// Khong dung React/Electron -> test bang vitest (giong generationPercent.ts).

/** Mot o trong bang dieu huong cau. `answered` va `flagged` doc lap. */
export interface QuizCell {
  index: number // 0-based
  quizQuestionId: string
  answered: boolean
  flagged: boolean
  current: boolean
}

/** mm:ss khi < 1 gio, h:mm:ss khi >= 1 gio. Am -> 0. Lam tron xuong. */
export function formatClock(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function deriveCells(args: {
  orderedIds: string[]
  currentIndex: number
  answeredIds: ReadonlySet<string>
  flaggedIds: ReadonlySet<string>
}): QuizCell[] {
  return args.orderedIds.map((quizQuestionId, index) => ({
    index,
    quizQuestionId,
    answered: args.answeredIds.has(quizQuestionId),
    flagged: args.flaggedIds.has(quizQuestionId),
    current: index === args.currentIndex
  }))
}

export interface ProgressSummary {
  total: number
  answeredCount: number
  unansweredCount: number
  flaggedCount: number
  unansweredIndexes: number[] // 0-based, cho danh sach nhay o man soat
  flaggedIndexes: number[]
}

export function summarizeProgress(cells: QuizCell[]): ProgressSummary {
  const unansweredIndexes: number[] = []
  const flaggedIndexes: number[] = []
  let answeredCount = 0
  for (const c of cells) {
    if (c.answered) answeredCount += 1
    else unansweredIndexes.push(c.index)
    if (c.flagged) flaggedIndexes.push(c.index)
  }
  return {
    total: cells.length,
    answeredCount,
    unansweredCount: cells.length - answeredCount,
    flaggedCount: flaggedIndexes.length,
    unansweredIndexes,
    flaggedIndexes
  }
}

export type AnswerFilter = 'all' | 'wrong' | 'flagged' | 'skipped'

export function filterAnswers(
  answers: AttemptAnswerReview[],
  filter: AnswerFilter
): AttemptAnswerReview[] {
  switch (filter) {
    case 'wrong':
      return answers.filter((a) => !a.isCorrect)
    case 'flagged':
      return answers.filter((a) => a.flagged)
    case 'skipped':
      return answers.filter((a) => a.selectedOptionId === null)
    case 'all':
    default:
      return answers
  }
}
