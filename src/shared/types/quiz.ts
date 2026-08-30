import type { QuestionOption } from './question'

export type QuizFeedbackMode = 'practice' | 'exam' // Luyen tap | Thi thu
export type QuizScopeType = 'lesson' | 'topic'

// Chi dung o renderer: App -> QuizPlayOverlay
export interface QuizLaunchRequest {
  scopeType: QuizScopeType
  lessonId: string | null
  topicId: string | null
  lessonIds: string[]
  title: string
}

// Chi dung o renderer: App -> QuizLibraryOverlay
export interface QuizLibraryRequest {
  scopeType: QuizScopeType
  lessonId: string | null
  topicId: string | null
  title: string
}

export interface PlayableQuestion {
  quizQuestionId: string // quiz_questions.id (hang snapshot)
  questionId: string | null // question_bank.id goc
  questionText: string
  options: QuestionOption[] // co kem isCorrect - cham diem van o main
  explanation: string | null
  sortOrder: number
}

export interface CreateQuizInput {
  scopeType: QuizScopeType
  lessonId?: string | null
  topicId?: string | null
  lessonIds: string[]
  feedbackMode: QuizFeedbackMode
  questionIds: string[] // tap con question_bank.id, da theo thu tu choi
  title: string
}

export interface CreatedQuiz {
  quizId: string
  feedbackMode: QuizFeedbackMode
  questions: PlayableQuestion[]
}

export interface AttemptAnswerInput {
  quizQuestionId: string
  selectedOptionId: string | null
}

export interface SubmitAttemptInput {
  quizId: string
  feedbackMode: QuizFeedbackMode
  answers: AttemptAnswerInput[]
}

export interface AttemptAnswerReview {
  quizQuestionId: string
  questionText: string
  options: QuestionOption[]
  explanation: string | null
  selectedOptionId: string | null
  correctOptionId: string
  isCorrect: boolean
}

export interface AttemptReview {
  attemptId: string
  quizId: string
  title: string
  feedbackMode: QuizFeedbackMode
  correctCount: number
  totalCount: number
  score: number // 0..10, 1 chu so thap phan
  startedAt: string
  submittedAt: string
  answers: AttemptAnswerReview[]
}

export interface QuizAttemptSummary {
  attemptId: string
  quizId: string
  title: string
  scopeType: QuizScopeType
  feedbackMode: QuizFeedbackMode
  correctCount: number
  totalCount: number
  score: number
  submittedAt: string
}
