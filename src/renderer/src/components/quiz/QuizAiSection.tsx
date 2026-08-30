import { useState } from 'react'
import { Sparkles, Library } from 'lucide-react'
import { useQuestionsByLesson } from '@renderer/queries/questionBank'
import { useAttemptsByLesson, useDeleteAttempt, type QuizScope } from '@renderer/queries/quiz'
import type { LessonWidgetProps } from '../lesson/widgetRegistry'
import QuizGeneratePanel from './QuizGeneratePanel'
import QuizAttemptHistory from './QuizAttemptHistory'
import QuizAttemptReviewModal from './QuizAttemptReviewModal'

function QuizAiSection({
  lesson,
  onStartQuiz,
  onOpenLibrary
}: LessonWidgetProps): React.JSX.Element {
  const scope: QuizScope = { type: 'lesson', lessonId: lesson.id }

  const savedQuestionsQuery = useQuestionsByLesson(lesson.id)
  const attemptsQuery = useAttemptsByLesson(lesson.id)
  const deleteAttempt = useDeleteAttempt(scope)

  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null)

  const savedCount = savedQuestionsQuery.data?.length ?? 0

  return (
    <section className="lesson-widget quiz-ai-section">
      <h3>
        <Sparkles size={16} /> Kiểm tra (bài học này)
      </h3>

      <QuizGeneratePanel scope={scope} />

      <div className="quiz-ai-play">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            onOpenLibrary?.({
              scopeType: 'lesson',
              lessonId: lesson.id,
              topicId: null,
              title: `Ngân hàng câu hỏi: ${lesson.title}`
            })
          }
        >
          <Library size={14} /> Ngân hàng câu hỏi ({savedCount})
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={savedCount === 0 || !onStartQuiz}
          title={savedCount === 0 ? 'Chưa có câu hỏi nào để làm bài' : undefined}
          onClick={() =>
            onStartQuiz?.({
              scopeType: 'lesson',
              lessonId: lesson.id,
              topicId: lesson.topicId,
              lessonIds: [lesson.id],
              title: `Kiểm tra: ${lesson.title}`
            })
          }
        >
          Làm bài kiểm tra
        </button>
      </div>

      <QuizAttemptHistory
        attempts={attemptsQuery.data}
        isLoading={attemptsQuery.isLoading}
        onOpenReview={setReviewAttemptId}
        onDelete={(id) => deleteAttempt.mutate(id)}
      />
      <QuizAttemptReviewModal
        attemptId={reviewAttemptId}
        onClose={() => setReviewAttemptId(null)}
      />
    </section>
  )
}

export default QuizAiSection
