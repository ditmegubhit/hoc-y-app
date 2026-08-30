import { useState } from 'react'
import { History } from 'lucide-react'
import type { QuizAttemptSummary } from '@shared/types/quiz'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'

interface QuizAttemptHistoryProps {
  attempts: QuizAttemptSummary[] | undefined
  isLoading: boolean
  onOpenReview: (attemptId: string) => void
  onDelete: (attemptId: string) => void
}

function formatDateTime(sqliteDatetime: string): string {
  const iso = `${sqliteDatetime.replace(' ', 'T')}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? sqliteDatetime : d.toLocaleString('vi-VN')
}

const MODE_LABEL: Record<string, string> = {
  practice: 'Luyện tập',
  exam: 'Thi thử'
}

function QuizAttemptHistory({
  attempts,
  isLoading,
  onOpenReview,
  onDelete
}: QuizAttemptHistoryProps): React.JSX.Element | null {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  if (isLoading) return null
  if (!attempts || attempts.length === 0) return null

  return (
    <div className="quiz-attempt-history">
      <h4>
        <History size={14} /> Lịch sử làm bài
      </h4>
      {attempts.map((a) => (
        <div key={a.attemptId} className="quiz-attempt-row">
          <button
            type="button"
            className="quiz-attempt-row-main"
            onClick={() => onOpenReview(a.attemptId)}
          >
            <span className="quiz-attempt-row-score">{a.score.toFixed(1)}</span>
            <span className="quiz-attempt-row-meta">
              đúng {a.correctCount}/{a.totalCount} · {MODE_LABEL[a.feedbackMode] ?? a.feedbackMode} ·{' '}
              {formatDateTime(a.submittedAt)}
            </span>
          </button>
          <button type="button" title="Xoá" onClick={() => setPendingDelete(a.attemptId)}>
            Xoá
          </button>
        </div>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xác nhận xoá"
        message="Xoá lượt làm bài này khỏi lịch sử?"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

export default QuizAttemptHistory
