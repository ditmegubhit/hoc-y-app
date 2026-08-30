import type { QuestionOption } from '@shared/types/question'

interface QuizQuestionCardProps {
  questionText: string
  options: QuestionOption[]
  explanation: string | null
  index: number
  total: number
  selectedOptionId: string | null
  // reveal = hien dap an dung + giai thich (Luyen tap sau khi chon, hoac man review)
  reveal: boolean
  // co onSelect = dang lam bai; khong co = chi doc (review)
  onSelect?: (optionId: string) => void
}

function optionClass(params: {
  option: QuestionOption
  selectedOptionId: string | null
  reveal: boolean
}): string {
  const { option, selectedOptionId, reveal } = params
  const classes = ['quiz-option']
  const isSelected = option.id === selectedOptionId
  if (reveal) {
    classes.push('quiz-option--disabled')
    if (option.isCorrect) classes.push('quiz-option--correct')
    else if (isSelected) classes.push('quiz-option--wrong')
  } else if (isSelected) {
    classes.push('quiz-option--selected')
  }
  return classes.join(' ')
}

function QuizQuestionCard({
  questionText,
  options,
  explanation,
  index,
  total,
  selectedOptionId,
  reveal,
  onSelect
}: QuizQuestionCardProps): React.JSX.Element {
  const locked = reveal || !onSelect

  return (
    <div className="quiz-question-card">
      <p className="quiz-question-text">
        <strong>
          Câu {index + 1}/{total}.
        </strong>{' '}
        {questionText}
      </p>
      <ul className="quiz-option-list">
        {options.map((option, optIdx) => (
          <li key={option.id}>
            <button
              type="button"
              className={optionClass({ option, selectedOptionId, reveal })}
              disabled={locked}
              onClick={() => onSelect?.(option.id)}
            >
              <span className="quiz-option-letter">
                {String.fromCharCode(65 + optIdx)}
              </span>
              <span className="quiz-option-text">{option.text}</span>
              {reveal && option.isCorrect && <span className="quiz-option-mark">✓</span>}
              {reveal && !option.isCorrect && option.id === selectedOptionId && (
                <span className="quiz-option-mark">✗</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {reveal && explanation && (
        <p className="quiz-explanation">
          <strong>Giải thích:</strong> {explanation}
        </p>
      )}
    </div>
  )
}

export default QuizQuestionCard
