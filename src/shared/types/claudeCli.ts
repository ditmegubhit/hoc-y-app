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
  // Con thieu bao nhieu cau so voi so yeu cau (nguon khong du de sinh bu). 0/undef = du.
  shortfall?: number
  errorMessage?: string
}

// Bao tien do sinh cau (main -> renderer qua IPC event).
export interface QuizGenProgress {
  phase: 'generating' | 'refining' | 'topping_up'
  round: number
  target: number
  kept: number
  // So cau model dang viet ra trong vong hien tai (chi khi Ollama stream).
  streaming?: number
  // Khoa pham vi (renderer gan de dinh tuyen event ve dung o soan). Main chi
  // echo lai, khong dung.
  key?: string
}
