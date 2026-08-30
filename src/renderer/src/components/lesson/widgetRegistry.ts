import type { ComponentType } from 'react'
import type { Lesson, LessonWidgetKind } from '@shared/types/lesson'
import type { QuizLaunchRequest, QuizLibraryRequest } from '@shared/types/quiz'
import NotesWidget from './widgets/NotesWidget'
import QuizAiSection from '../quiz/QuizAiSection'

export interface LessonWidgetProps {
  lesson: Lesson
  onStartQuiz?: (req: QuizLaunchRequest) => void
  onOpenLibrary?: (req: QuizLibraryRequest) => void
}

// 'attachments' khong nam trong registry generic nay - no duoc render rieng
// trong LessonWorkspacePage vi can them props (activeAttachmentId/onOpenAttachment)
// ma cac widget khac khong dung toi. Diem mo rong: them widget moi (vd
// 'flashcards', 'timer') chi can viet component + dang ky vao day + them vao
// defaultLessonLayout.
export const lessonWidgetRegistry: Record<
  Exclude<LessonWidgetKind, 'attachments'>,
  ComponentType<LessonWidgetProps>
> = {
  notes: NotesWidget,
  quizAi: QuizAiSection
}

export const defaultLessonLayout: Exclude<LessonWidgetKind, 'attachments'>[] = [
  'notes',
  'quizAi'
]
