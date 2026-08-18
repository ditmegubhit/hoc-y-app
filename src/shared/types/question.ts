export type QuestionSource = 'ai_generated_from_lesson' | 'extracted_from_exam_file'
export type QuestionStatus = 'draft' | 'reviewed' | 'approved'

export interface QuestionOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface DraftQuestion {
  questionText: string
  options: QuestionOption[]
  explanation: string | null
}

export interface Question extends DraftQuestion {
  id: string
  source: QuestionSource
  lessonId: string | null
  examFileId: string | null
  topicId: string | null
  status: QuestionStatus
  createdAt: string
  updatedAt: string
}
