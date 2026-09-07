import { useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import type { QuizAttemptSummary } from '@shared/types/quiz'
import { formatClock } from '@shared/quiz/quizProgress'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import QuizScoreTrend from './QuizScoreTrend'

interface QuizAttemptHistoryProps {
  attempts: QuizAttemptSummary[] | undefined
  isLoading: boolean
  onOpenReview: (attemptId: string) => void
  onDelete: (attemptId: string) => void
}

function formatDateTime(sqliteDatetime: string): string {
  const d = new Date(`${sqliteDatetime.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? sqliteDatetime : d.toLocaleString('vi-VN')
}

const MODE_LABEL: Record<string, string> = { practice: 'Luyện tập', exam: 'Thi thử' }

function scoreTone(score: number): string {
  if (score >= 8) return 'lms-gradebook-score--good'
  if (score >= 5) return 'lms-gradebook-score--mid'
  return 'lms-gradebook-score--low'
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

  const best = attempts.reduce((m, a) => Math.max(m, a.score), 0)
  const avg = attempts.reduce((s, a) => s + a.score, 0) / attempts.length
  // attempts đến từ query theo submitted_at DESC -> đảo lại để biểu đồ cũ→mới
  const trendPoints = [...attempts]
    .reverse()
    .map((a) => ({ score: a.score, submittedAt: a.submittedAt }))

  return (
    <div className="lms-gradebook">
      <h4>
        <History size={14} /> Lịch sử làm bài
      </h4>

      <div className="lms-gradebook-summary">
        <span>
          Điểm cao nhất <strong>{best.toFixed(1)}</strong>
        </span>
        <span>
          Điểm trung bình <strong>{avg.toFixed(1)}</strong>
        </span>
        <span>
          Số lượt <strong>{attempts.length}</strong>
        </span>
      </div>

      {trendPoints.length >= 2 && <QuizScoreTrend points={trendPoints} />}

      <div className="lms-gradebook-tablewrap">
        <table className="lms-gradebook-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Chế độ</th>
              <th>Điểm</th>
              <th>Đúng/Tổng</th>
              <th className="lms-gradebook-col-time">Thời gian</th>
              <th aria-label="Hành động" />
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.attemptId} onClick={() => onOpenReview(a.attemptId)}>
                <td>{formatDateTime(a.submittedAt)}</td>
                <td>{MODE_LABEL[a.feedbackMode] ?? a.feedbackMode}</td>
                <td className={scoreTone(a.score)}>{a.score.toFixed(1)}</td>
                <td>
                  {a.correctCount}/{a.totalCount}
                </td>
                <td className="lms-gradebook-col-time">
                  {a.durationSeconds == null ? '—' : formatClock(a.durationSeconds)}
                </td>
                <td>
                  <button
                    type="button"
                    className="lms-gradebook-del"
                    title="Xoá"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingDelete(a.attemptId)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
