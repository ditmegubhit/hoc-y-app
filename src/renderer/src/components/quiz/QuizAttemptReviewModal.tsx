import { useAttemptReview } from '@renderer/queries/quiz'
import QuizQuestionCard from './QuizQuestionCard'

interface QuizAttemptReviewModalProps {
  attemptId: string | null
  onClose: () => void
}

function QuizAttemptReviewModal({
  attemptId,
  onClose
}: QuizAttemptReviewModalProps): React.JSX.Element | null {
  const reviewQuery = useAttemptReview(attemptId)

  if (attemptId === null) return null

  const review = reviewQuery.data

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-header">
          <div>
            <strong>{review?.title ?? 'Xem lại bài kiểm tra'}</strong>
            {review && (
              <span className="viewer-unit-label">
                {review.score.toFixed(1)}/10 — đúng {review.correctCount}/{review.totalCount} câu
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        <div className="viewer-body">
          {reviewQuery.isLoading && <p className="lesson-workspace-empty">Đang tải...</p>}
          {!reviewQuery.isLoading && !review && (
            <p className="lesson-workspace-empty">Không tìm thấy lượt làm bài này.</p>
          )}
          {review && (
            <div className="quiz-results-review">
              {review.answers.map((answer, idx) => (
                <div
                  key={answer.quizQuestionId}
                  className={`quiz-review-item${answer.isCorrect ? '' : ' quiz-review-item--wrong'}`}
                >
                  <QuizQuestionCard
                    questionText={answer.questionText}
                    options={answer.options}
                    explanation={answer.explanation}
                    index={idx}
                    total={review.totalCount}
                    selectedOptionId={answer.selectedOptionId}
                    reveal
                  />
                  {answer.selectedOptionId === null && (
                    <p className="quiz-review-skipped">Bạn chưa trả lời câu này.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="viewer-actions">
          <button type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuizAttemptReviewModal
