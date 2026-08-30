export type ClaudeCliStatus =
  | { status: 'ready'; email?: string; subscriptionType?: string }
  | { status: 'not_found' }
  | { status: 'not_logged_in' }
  | { status: 'error'; message: string }

export interface GenerateQuizFromLessonInput {
  lessonId: string
  numQuestions: number
}

export interface GenerateQuizFromLessonResult {
  ok: boolean
  questions?: import('./question').DraftQuestion[]
  truncated?: boolean
  duplicatesRemoved?: number
  errorMessage?: string
}
