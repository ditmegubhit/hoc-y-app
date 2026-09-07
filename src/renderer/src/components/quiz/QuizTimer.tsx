import { Clock } from 'lucide-react'
import { formatClock } from '@shared/quiz/quizProgress'

interface QuizTimerProps {
  elapsedSeconds: number
  remainingSeconds: number | null
}

function QuizTimer({ elapsedSeconds, remainingSeconds }: QuizTimerProps): React.JSX.Element {
  const counting = remainingSeconds != null
  const value = counting ? remainingSeconds : elapsedSeconds
  const danger = counting && remainingSeconds <= 60

  return (
    <span
      className={`lms-quiz-timer${danger ? ' lms-quiz-timer--danger' : ''}`}
      role="timer"
      aria-label={counting ? `Còn ${formatClock(value)}` : `Đã làm ${formatClock(value)}`}
    >
      <Clock size={14} />
      <span className="lms-quiz-timer-value">{formatClock(value)}</span>
      {counting && (remainingSeconds === 60 || remainingSeconds === 10) && (
        <span aria-live="assertive" className="sr-only">
          Còn {formatClock(value)}
        </span>
      )}
    </span>
  )
}

export default QuizTimer
