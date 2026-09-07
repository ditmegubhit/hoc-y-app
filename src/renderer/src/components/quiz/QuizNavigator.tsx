import { Flag } from 'lucide-react'
import type { QuizCell } from '@shared/quiz/quizProgress'

export type CellResultStatus = 'correct' | 'wrong' | 'skipped'

interface QuizNavigatorProps {
  cells: QuizCell[]
  onJump: (index: number) => void
  // Luyen tap: chi cho nhay TIEN toi index nay (cac o >= gia tri nay khoa lai).
  lockedForwardFrom?: number | null
  mode: 'play' | 'result'
  resultStatus?: (index: number) => CellResultStatus
}

function cellClass(params: {
  cell: QuizCell
  mode: 'play' | 'result'
  status?: CellResultStatus
  locked: boolean
}): string {
  const { cell, mode, status, locked } = params
  const cls = ['lms-nav-cell']
  if (cell.current) cls.push('lms-nav-cell--current')
  if (locked) cls.push('lms-nav-cell--locked')
  if (mode === 'result' && status) {
    cls.push(`lms-nav-cell--${status}`)
  } else {
    cls.push(cell.answered ? 'lms-nav-cell--answered' : 'lms-nav-cell--blank')
  }
  return cls.join(' ')
}

function QuizNavigator({
  cells,
  onJump,
  lockedForwardFrom = null,
  mode,
  resultStatus
}: QuizNavigatorProps): React.JSX.Element {
  const answered = cells.filter((c) => c.answered).length
  const flagged = cells.filter((c) => c.flagged).length

  return (
    <nav className="lms-quiz-navigator" aria-label="Danh sách câu hỏi">
      <div className="lms-nav-legend">
        {mode === 'play' ? (
          <>
            <span>Đã trả lời {answered}</span>
            <span>Chưa {cells.length - answered}</span>
            <span>Đánh dấu {flagged}</span>
          </>
        ) : (
          <span>{cells.length} câu</span>
        )}
      </div>
      <div className="lms-nav-grid">
        {cells.map((cell) => {
          const locked =
            mode === 'play' &&
            lockedForwardFrom != null &&
            cell.index > lockedForwardFrom &&
            !cell.answered
          const status = mode === 'result' ? resultStatus?.(cell.index) : undefined
          return (
            <button
              key={cell.quizQuestionId}
              type="button"
              className={cellClass({ cell, mode, status, locked })}
              disabled={locked}
              aria-current={cell.current ? 'true' : undefined}
              aria-label={`Câu ${cell.index + 1}${cell.answered ? ' · đã trả lời' : ''}${
                cell.flagged ? ' · đã đánh dấu' : ''
              }`}
              onClick={() => !locked && onJump(cell.index)}
            >
              {cell.index + 1}
              {cell.flagged && <Flag size={9} className="lms-nav-cell-flag" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default QuizNavigator
