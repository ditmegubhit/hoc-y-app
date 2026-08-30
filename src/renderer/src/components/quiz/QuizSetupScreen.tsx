import { useState } from 'react'
import type { QuizFeedbackMode } from '@shared/types/quiz'

interface QuizSetupScreenProps {
  availableCount: number
  isLoading: boolean
  starting: boolean
  errorMessage: string | null
  onStart: (opts: { numQuestions: number; feedbackMode: QuizFeedbackMode }) => void
  onExit: () => void
}

const MODE_INFO: { mode: QuizFeedbackMode; label: string; desc: string }[] = [
  {
    mode: 'practice',
    label: 'Luyện tập',
    desc: 'Báo đúng/sai và hiện giải thích ngay sau mỗi câu.'
  },
  {
    mode: 'exam',
    label: 'Thi thử',
    desc: 'Làm hết rồi mới chấm điểm, sau đó xem lại câu sai.'
  }
]

function QuizSetupScreen({
  availableCount,
  isLoading,
  starting,
  errorMessage,
  onStart,
  onExit
}: QuizSetupScreenProps): React.JSX.Element {
  const defaultCount = Math.min(availableCount, 10)
  const [numQuestions, setNumQuestions] = useState(defaultCount)
  const [feedbackMode, setFeedbackMode] = useState<QuizFeedbackMode>('practice')

  if (isLoading) {
    return <p className="quiz-setup-loading">Đang tải câu hỏi...</p>
  }

  if (availableCount === 0) {
    return (
      <div className="quiz-setup">
        <p className="quiz-ai-warning">
          Chưa có câu hỏi nào để làm bài. Hãy dùng &quot;Soạn câu hỏi&quot; để tạo trước.
        </p>
        <div className="quiz-play-nav">
          <button type="button" className="btn-secondary" onClick={onExit}>
            Thoát
          </button>
        </div>
      </div>
    )
  }

  const clampedCount = Math.max(1, Math.min(numQuestions || 1, availableCount))

  return (
    <div className="quiz-setup">
      <p className="quiz-setup-available">
        Có <strong>{availableCount}</strong> câu hỏi trong phạm vi này.
      </p>

      <label className="quiz-setup-count">
        Số câu muốn làm:
        <input
          type="number"
          min={1}
          max={availableCount}
          value={numQuestions}
          onChange={(e) => setNumQuestions(Number(e.target.value))}
        />
      </label>

      <div className="quiz-setup-modes">
        {MODE_INFO.map((info) => (
          <button
            key={info.mode}
            type="button"
            className={`quiz-mode-card${feedbackMode === info.mode ? ' quiz-mode-card--active' : ''}`}
            onClick={() => setFeedbackMode(info.mode)}
          >
            <strong>{info.label}</strong>
            <span>{info.desc}</span>
          </button>
        ))}
      </div>

      {errorMessage && <p className="quiz-ai-error">{errorMessage}</p>}

      <div className="quiz-play-nav">
        <button type="button" className="btn-secondary" onClick={onExit}>
          Thoát
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={starting}
          onClick={() => onStart({ numQuestions: clampedCount, feedbackMode })}
        >
          {starting ? 'Đang chuẩn bị...' : 'Bắt đầu'}
        </button>
      </div>
    </div>
  )
}

export default QuizSetupScreen
