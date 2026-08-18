export interface LessonSummary {
  id: string
  topicId: string
  title: string
  sortOrder: number
}

export interface Lesson extends LessonSummary {
  notesJson: string | null
  notesText: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateLessonInput {
  topicId: string
  title: string
}

export interface UpdateLessonInput {
  id: string
  title?: string
  notesJson?: string | null
  notesText?: string | null
  topicId?: string
  sortOrder?: number
}

// Diem mo rong giao dien bai hoc (M1 plan): them widget moi sau nay
// chi can dang ky vao widgetRegistry, khong sua kien truc chinh.
export type LessonWidgetKind = 'attachments' | 'notes'
