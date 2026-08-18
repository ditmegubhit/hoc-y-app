import type { ComponentType } from 'react'
import type { Lesson, LessonWidgetKind } from '@shared/types/lesson'
import NotesWidget from './widgets/NotesWidget'
import AttachmentsWidget from './widgets/AttachmentsWidget'
import QuizAiSection from '../quiz/QuizAiSection'

export interface LessonWidgetProps {
  lesson: Lesson
}

// Diem mo rong giao dien bai hoc: them widget moi (vd 'flashcards', 'timer')
// chi can viet component + dang ky vao day + them vao defaultLessonLayout.
export const lessonWidgetRegistry: Record<LessonWidgetKind, ComponentType<LessonWidgetProps>> = {
  attachments: AttachmentsWidget,
  notes: NotesWidget,
  quizAi: QuizAiSection
}

export const defaultLessonLayout: LessonWidgetKind[] = ['attachments', 'notes', 'quizAi']
