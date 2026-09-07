import type { ProgressSummary } from '@shared/quiz/quizProgress'

interface QuizReviewBeforeSubmitProps {
  summary: ProgressSummary
  onJump: (index: number) => void
  onBack: () => void
  onConfirm: () => void
  submitting: boolean
}

function ChipRow({
  label,
  indexes,
  onJump,
  tone
}: {
  label: string
  indexes: number[]
  onJump: (i: number) => void
  tone: 'warn' | 'flag'
}): React.JSX.Element | null {
  if (indexes.length === 0) return null
  return (
    <div className="lms-presubmit-row">
      <span className="lms-presubmit-row-label">
        {label}: <strong>{indexes.length}</strong>
      </span>
      <div className="lms-presubmit-chips">
        {indexes.map((i) => (
          <button
            key={i}
            type="button"
            className={`lms-presubmit-chip lms-presubmit-chip--${tone}`}
            onClick={() => onJump(i)}
          >
            Câu {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuizReviewBeforeSubmit({
  summary,
  onJump,
  onBack,
  onConfirm,
  submitting
}: QuizReviewBeforeSubmitProps): React.JSX.Element {
  const allDone = summary.unansweredCount === 0

  return (
    <div className="lms-presubmit">
      <h3>Xem lại trước khi nộp</h3>

      {allDone ? (
        <p className="lms-presubmit-ok">Bạn đã trả lời hết {summary.total} câu.</p>
      ) : (
        <p className="lms-presubmit-warn">
          Còn <strong>{summary.unansweredCount}</strong> câu chưa trả lời — nộp bây giờ sẽ tính là
          sai.
        </p>
      )}

      <ChipRow
        label="Chưa trả lời"
        indexes={summary.unansweredIndexes}
        onJump={onJump}
        tone="warn"
      />
      <ChipRow label="Đã đánh dấu" indexes={summary.flaggedIndexes} onJump={onJump} tone="flag" />

      <div className="lms-quiz-footer">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Quay lại làm tiếp
        </button>
        <button type="button" className="btn-primary" disabled={submitting} onClick={onConfirm}>
          {submitting ? 'Đang chấm...' : 'Nộp bài'}
        </button>
      </div>
    </div>
  )
}

export default QuizReviewBeforeSubmit
