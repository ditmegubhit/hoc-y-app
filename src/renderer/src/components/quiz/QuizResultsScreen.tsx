import { useMemo, useState } from 'react'
import { Check, X, Minus, Clock } from 'lucide-react'
import type { AttemptReview } from '@shared/types/quiz'
import { filterAnswers, formatClock, type AnswerFilter } from '@shared/quiz/quizProgress'
import QuizScoreRing from './QuizScoreRing'
import QuizReviewList from './QuizReviewList'

interface QuizResultsScreenProps {
  review: AttemptReview
  onExit: () => void
}

function scoreWord(score: number): string {
  if (score >= 8) return 'Giỏi'
  if (score >= 5) return 'Khá'
  return 'Cần cố gắng'
}

const FILTERS: { key: AnswerFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'wrong', label: 'Sai' },
  { key: 'flagged', label: 'Đánh dấu' },
  { key: 'skipped', label: 'Bỏ trống' }
]

function QuizResultsScreen({ review, onExit }: QuizResultsScreenProps): React.JSX.Element {
  const skipped = review.answers.filter((a) => a.selectedOptionId === null).length
  const wrong = review.totalCount - review.correctCount - skipped
  const isExam = review.feedbackMode === 'exam'

  const [filter, setFilter] = useState<AnswerFilter>(isExam ? 'wrong' : 'all')

  const numberOf = useMemo(() => {
    const map = new Map(review.answers.map((a, i) => [a.quizQuestionId, i + 1]))
    return (id: string): number => map.get(id) ?? 1
  }, [review.answers])

  const counts: Record<AnswerFilter, number> = {
    all: review.answers.length,
    wrong: review.answers.filter((a) => !a.isCorrect).length,
    flagged: review.answers.filter((a) => a.flagged).length,
    skipped
  }

  const timeText = review.durationSeconds == null ? '—' : formatClock(review.durationSeconds)
  const timeSuffix =
    review.timeLimitSeconds != null ? ` / ${formatClock(review.timeLimitSeconds)}` : ''

  return (
    <div className="lms-results">
      <div className="lms-results-hero">
        <QuizScoreRing score={review.score} />
        <div className="lms-results-hero-text">
          <strong>{scoreWord(review.score)}</strong>
          <span>
            Đúng {review.correctCount}/{review.totalCount} câu
          </span>
        </div>
      </div>

      <div className="lms-stat-tiles">
        <div className="lms-stat-tile">
          <Check size={16} className="lms-stat-icon lms-stat-icon--ok" />
          <span className="lms-stat-label">Đúng</span>
          <span className="lms-stat-value">{review.correctCount}</span>
        </div>
        <div className="lms-stat-tile">
          <X size={16} className="lms-stat-icon lms-stat-icon--bad" />
          <span className="lms-stat-label">Sai</span>
          <span className="lms-stat-value">{wrong}</span>
        </div>
        <div className="lms-stat-tile">
          <Minus size={16} className="lms-stat-icon lms-stat-icon--muted" />
          <span className="lms-stat-label">Bỏ trống</span>
          <span className="lms-stat-value">{skipped}</span>
        </div>
        <div className="lms-stat-tile">
          <Clock size={16} className="lms-stat-icon" />
          <span className="lms-stat-label">Thời gian</span>
          <span className="lms-stat-value">
            {timeText}
            {timeSuffix}
          </span>
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
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      <QuizReviewList
        answers={filterAnswers(review.answers, filter)}
        total={review.totalCount}
        numberOf={numberOf}
      />

      <div className="lms-quiz-footer">
        <button type="button" className="btn-primary" onClick={onExit}>
          Thoát
        </button>
      </div>
    </div>
  )
}

export default QuizResultsScreen
