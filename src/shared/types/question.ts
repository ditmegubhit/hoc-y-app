export type QuestionSource = 'ai_generated_from_lesson' | 'extracted_from_exam_file'
export type QuestionStatus = 'draft' | 'reviewed' | 'approved'
// Engine da sinh ra cau hoi (null = cau cu, truoc khi phan biet provider).
export type QuestionGenerator = 'claude' | 'ollama' | null

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

export interface UpdateQuestionInput {
  id: string
  questionText: string
  options: QuestionOption[]
  explanation: string | null
}

export interface QuestionDraftContent {
  questionText: string
  options: QuestionOption[]
  explanation: string | null
}

// Ket qua luot "Ra soat & cai tien" cho 1 cau da luu
export interface ReviewedQuestion {
  id: string
  changed: boolean
  original: QuestionDraftContent
  improved: QuestionDraftContent
}

export interface Question extends DraftQuestion {
  id: string
  source: QuestionSource
  generator: QuestionGenerator
  lessonId: string | null
  examFileId: string | null
  topicId: string | null
  status: QuestionStatus
  markedGood: boolean
  createdAt: string
  updatedAt: string
}

// Cac loai vi du hoc cho Ollama:
// - claude_fix   : Claude sua khi ra soat (co before)
// - ollama_fixed : user tu sua tay cau Ollama (co before)
// - marked_good  : user danh dau 1 cau la mau tot (khong co before)
export type LearningExampleKind = 'claude_fix' | 'ollama_fixed' | 'marked_good'

// 1 vi du few-shot cho Ollama hoc dan. `before` = null voi loai 'marked_good'.
export interface LearningExampleInput {
  kind: LearningExampleKind
  before: QuestionDraftContent | null
  after: QuestionDraftContent
  lessonId: string | null
  topicId: string | null
  // Chi dung voi kind 'marked_good' - de ghi nhan trang thai marked_good tren
  // chinh cau hoi (question_bank), khong luu vao quiz_learning_examples.
  questionId?: string
}
