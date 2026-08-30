import { useState } from 'react'
import type { AttemptReview } from '@shared/types/quiz'
import QuizQuestionCard from './QuizQuestionCard'

interface QuizResultsScreenProps {
  review: AttemptReview
  onExit: () => void
}

function scoreTone(score: number): string {
  if (score >= 8) return 'quiz-results-score--good'
  if (score >= 5) return 'quiz-results-score--mid'
  return 'quiz-results-score--low'
}

function QuizResultsScreen({ review, onExit }: QuizResultsScreenProps): React.JSX.Element {
  const wrongCount = review.totalCount - review.correctCount
  const isExam = review.feedbackMode === 'exam'
  const [showAll, setShowAll] = useState(!isExam)

  const numbered = review.answers.map((answer, originalIndex) => ({ answer, originalIndex }))
  const visibleAnswers =
    showAll || !isExam ? numbered : numbered.filter((x) => !x.answer.isCorrect)

  return (
    <div className="quiz-results">
      <div className={`quiz-results-score ${scoreTone(review.score)}`}>
        <span className="quiz-results-score-number">{review.score.toFixed(1)}</span>
        <span className="quiz-results-score-scale">/10</span>
      </div>
      <p className="quiz-results-summary">
        Đúng <strong>{review.correctCount}</strong>/{review.totalCount} câu
        {wrongCount > 0 && ` — sai ${wrongCount} câu`}
      </p>

      {isExam && wrongCount > 0 && (
        <button
          type="button"
          className="btn-secondary quiz-results-toggle"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Chỉ xem câu sai' : 'Xem tất cả câu'}
        </button>
      )}

      <div className="quiz-results-review">
        {visibleAnswers.map(({ answer, originalIndex }) => (
          <div
            key={answer.quizQuestionId}
            className={`quiz-review-item${answer.isCorrect ? '' : ' quiz-review-item--wrong'}`}
          >
            <QuizQuestionCard
              questionText={answer.questionText}
              options={answer.options}
              explanation={answer.explanation}
              index={originalIndex}
              total={review.totalCount}
              selectedOptionId={answer.selectedOptionId}
              reveal
            />
            {answer.selectedOptionId === null && (
              <p className="quiz-review-skipped">Bạn chưa trả lời câu này.</p>
            )}
          </div>
        ))}
        {visibleAnswers.length === 0 && (
          <p className="quiz-results-perfect">Tuyệt vời — bạn làm đúng tất cả! 🎉</p>
        )}
      </div>

      <div className="quiz-play-nav">
        <button type="button" className="btn-primary" onClick={onExit}>
          Thoát
        </button>
      </div>
    </div>
  )
}

export default QuizResultsScreen
