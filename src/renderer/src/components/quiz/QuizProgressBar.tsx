interface QuizProgressBarProps {
  answered: number
  total: number
  index: number
}

function QuizProgressBar({ answered, total, index }: QuizProgressBarProps): React.JSX.Element {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0
  return (
    <div className="lms-quiz-progress">
      <div
        className="lms-quiz-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label={`Đã trả lời ${answered} trên ${total} câu`}
      >
        <div className="lms-quiz-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="lms-quiz-progress-label">
        Câu {index + 1}/{total} · đã trả lời {answered}
      </span>
    </div>
  )
}

export default QuizProgressBar
