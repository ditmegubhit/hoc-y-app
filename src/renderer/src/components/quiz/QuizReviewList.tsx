import { Flag } from 'lucide-react'
import type { AttemptAnswerReview } from '@shared/types/quiz'
import QuizQuestionCard from './QuizQuestionCard'

interface QuizReviewListProps {
  answers: AttemptAnswerReview[]
  total: number
  // Map quizQuestionId -> so thu tu goc (1-based) trong ca bo, de loc van giu so dung.
  numberOf?: (quizQuestionId: string) => number
}

function QuizReviewList({ answers, total, numberOf }: QuizReviewListProps): React.JSX.Element {
  if (answers.length === 0) {
    return <p className="lms-review-empty">Không có câu nào khớp bộ lọc này.</p>
  }
  return (
    <div className="lms-review-list">
      {answers.map((answer, i) => {
        const displayIndex = (numberOf ? numberOf(answer.quizQuestionId) : i + 1) - 1
        return (
          <div
            key={answer.quizQuestionId}
            id={`lms-review-${answer.quizQuestionId}`}
            className={`lms-review-item${answer.isCorrect ? '' : ' lms-review-item--wrong'}`}
          >
            {answer.flagged && (
              <span className="lms-review-flag">
                <Flag size={11} /> Đã đánh dấu
              </span>
            )}
            <QuizQuestionCard
              questionText={answer.questionText}
              options={answer.options}
              explanation={answer.explanation}
              index={displayIndex}
              total={total}
              selectedOptionId={answer.selectedOptionId}
              reveal
            />
            {answer.selectedOptionId === null && (
              <p className="quiz-review-skipped">Bạn chưa trả lời câu này.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default QuizReviewList
