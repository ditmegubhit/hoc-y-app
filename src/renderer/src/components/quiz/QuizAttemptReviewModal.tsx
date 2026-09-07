import { useMemo, useState } from 'react'
import { useAttemptReview } from '@renderer/queries/quiz'
import { filterAnswers, formatClock, type AnswerFilter } from '@shared/quiz/quizProgress'
import QuizScoreRing from './QuizScoreRing'
import QuizReviewList from './QuizReviewList'

interface QuizAttemptReviewModalProps {
  attemptId: string | null
  onClose: () => void
}

const FILTERS: { key: AnswerFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'wrong', label: 'Sai' },
  { key: 'flagged', label: 'Đánh dấu' },
  { key: 'skipped', label: 'Bỏ trống' }
]

function QuizAttemptReviewModal({
  attemptId,
  onClose
}: QuizAttemptReviewModalProps): React.JSX.Element | null {
  const reviewQuery = useAttemptReview(attemptId)
  const [filter, setFilter] = useState<AnswerFilter>('all')
  const review = reviewQuery.data

  const numberOf = useMemo(() => {
    const map = new Map((review?.answers ?? []).map((a, i) => [a.quizQuestionId, i + 1]))
    return (id: string): number => map.get(id) ?? 1
  }, [review])

  if (attemptId === null) return null

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-header">
          <strong>{review?.title ?? 'Xem lại bài kiểm tra'}</strong>
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
            <>
              <div className="lms-results-hero lms-results-hero--compact">
                <QuizScoreRing score={review.score} size={88} />
                <div className="lms-results-hero-text">
                  <span>
                    Đúng {review.correctCount}/{review.totalCount} câu
                  </span>
                  {review.durationSeconds != null && (
                    <span>Thời gian {formatClock(review.durationSeconds)}</span>
                  )}
                </div>
              </div>

              <div className="lms-filter-chips" role="group" aria-label="Lọc câu xem lại">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`lms-filter-chip${filter === f.key ? ' lms-filter-chip--active' : ''}`}
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <QuizReviewList
                answers={filterAnswers(review.answers, filter)}
                total={review.totalCount}
                numberOf={numberOf}
              />
            </>
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
