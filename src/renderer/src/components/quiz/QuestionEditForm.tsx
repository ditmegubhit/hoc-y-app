import { useState } from 'react'
import type { Question, QuestionOption } from '@shared/types/question'
import { useUpdateQuestion, type QuizScope } from '@renderer/queries/quiz'

interface QuestionEditFormProps {
  question: Question
  scope: QuizScope
  onDone: () => void
}

function QuestionEditForm({ question, scope, onDone }: QuestionEditFormProps): React.JSX.Element {
  const updateMutation = useUpdateQuestion(scope)

  const [questionText, setQuestionText] = useState(question.questionText)
  const [options, setOptions] = useState<QuestionOption[]>(question.options)
  const [explanation, setExplanation] = useState(question.explanation ?? '')
  const [error, setError] = useState<string | null>(null)

  const setOptionText = (id: string, text: string): void =>
    setOptions((opts) => opts.map((o) => (o.id === id ? { ...o, text } : o)))

  const setCorrect = (id: string): void =>
    setOptions((opts) => opts.map((o) => ({ ...o, isCorrect: o.id === id })))

  const handleSave = (): void => {
    if (!questionText.trim()) {
      setError('Nội dung câu hỏi không được để trống.')
      return
    }
    if (options.some((o) => !o.text.trim())) {
      setError('Mọi đáp án phải có nội dung.')
      return
    }
    if (options.filter((o) => o.isCorrect).length !== 1) {
      setError('Phải chọn đúng một đáp án đúng.')
      return
    }
    setError(null)
    updateMutation.mutate(
      {
        id: question.id,
        questionText: questionText.trim(),
        options: options.map((o) => ({ ...o, text: o.text.trim() })),
        explanation: explanation.trim() ? explanation.trim() : null
      },
      { onSuccess: () => onDone() }
    )
  }

  return (
    <div className="question-edit-form">
      <label>
        Câu hỏi
        <textarea
          rows={2}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
        />
      </label>

      <div className="question-edit-options">
        {options.map((opt, idx) => (
          <div key={opt.id} className="question-edit-option">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={opt.isCorrect}
              onChange={() => setCorrect(opt.id)}
              title="Đáp án đúng"
            />
            <span className="quiz-option-letter">{String.fromCharCode(65 + idx)}</span>
            <input
              type="text"
              value={opt.text}
              onChange={(e) => setOptionText(opt.id, e.target.value)}
            />
          </div>
        ))}
      </div>

      <label>
        Giải thích (không bắt buộc)
        <textarea
          rows={2}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
      </label>

      {error && <p className="quiz-ai-error">{error}</p>}

      <div className="quiz-play-nav">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Huỷ
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={updateMutation.isPending}
          onClick={handleSave}
        >
          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  )
}

export default QuestionEditForm
