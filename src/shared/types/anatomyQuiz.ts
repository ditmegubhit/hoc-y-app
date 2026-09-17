export type AnatomyCandidateStatus = 'pending' | 'confirmed' | 'rejected'
export type AnatomyFeedbackMode = 'practice' | 'exam' // Luyen tap | Thi thu, giong QuizFeedbackMode

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// ---------- Soan cau hoi (authoring) ----------
//
// Thiet ke: tu dong do O CHU (PaddleOCR, xem detectPage.ts) de biet vi tri
// can CHE khi thi, nhung tac gia TU CHON 1 o trong so do (hoac tu ve 1 o
// moi) lam "cau hoi" roi go dap an - KHONG con doan vi tri tham chieu toi
// cau truc giai phau (bo han khai niem "mui ten").

export interface AnatomyLabelCandidate {
  id: string
  attachmentId: string
  pageNumber: number
  rawText: string
  labelBox: Rect
  status: AnatomyCandidateStatus
  refWidth: number
  refHeight: number
  // Dap an da luu (chi co khi status='confirmed') - dung nap san form khi lui
  // lai xem/sua 1 vung da xong. null neu chua confirmed.
  answerText: string | null
  acceptedAlternates: string[] | null
}

export interface CreateManualCandidateInput {
  attachmentId: string
  pageNumber: number
  rawText: string
  labelBox: Rect
  refWidth: number
  refHeight: number
}

export interface ConfirmAnatomyCandidateInput {
  candidateId: string
  lessonId: string
  answerText: string
  acceptedAlternates: string[]
}

// Sua dap an cua 1 candidate DA confirmed (khong tao cau hoi moi) - dap an
// phu go moi THAY THE HAN danh sach cu, khong gop.
export interface UpdateQuestionAnswerInput {
  candidateId: string
  answerText: string
  acceptedAlternates: string[]
}

export interface UpdateAnatomyCandidateInput {
  candidateId: string
  rawText?: string
  labelBox?: Rect
}

// ---------- Lam bai thi ----------

// Gui xuong renderer LUC LAM BAI - KHONG mang answerText/acceptedAlternates,
// cham diem hoan toan o main de khong lo dap an qua devtools.
export interface PlayableAnatomyQuestion {
  questionId: string
  pageNumber: number
  maskBoxes: Rect[]
  targetBox: Rect
  refWidth: number
  refHeight: number
}

export interface StartAnatomyAttemptInput {
  attachmentId: string
  feedbackMode: AnatomyFeedbackMode
  questionCount: number
}

export interface StartedAnatomyAttempt {
  attemptId: string
  feedbackMode: AnatomyFeedbackMode
  questions: PlayableAnatomyQuestion[]
}

export interface AnatomyAttemptAnswerInput {
  questionId: string
  submittedText: string
}

export interface SubmitAnatomyAttemptInput {
  attemptId: string
  durationSeconds: number | null
  answers: AnatomyAttemptAnswerInput[]
}

export interface AnatomyAttemptAnswerReview {
  questionId: string
  pageNumber: number
  maskBoxes: Rect[]
  targetBox: Rect
  refWidth: number
  refHeight: number
  submittedText: string
  correctAnswerText: string
  isCorrect: boolean
}

export interface AnatomyAttemptReview {
  attemptId: string
  feedbackMode: AnatomyFeedbackMode
  correctCount: number
  totalCount: number
  score: number
  durationSeconds: number | null
  startedAt: string
  submittedAt: string
  answers: AnatomyAttemptAnswerReview[]
}
