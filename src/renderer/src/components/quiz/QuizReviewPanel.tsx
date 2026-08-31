import { useState } from 'react'
import type { ReviewedQuestion } from '@shared/types/question'
import {
  recordLearningExamples,
  useUpdateQuestion,
  type QuizScope
} from '@renderer/queries/quiz'

function scopeIds(scope: QuizScope): { lessonId: string | null; topicId: string | null } {
  return scope.type === 'lesson'
    ? { lessonId: scope.lessonId, topicId: null }
    : { lessonId: null, topicId: scope.topicId }
}

interface QuizReviewPanelProps {
  results: ReviewedQuestion[]
  scope: QuizScope
  onClose: () => void
}

function ReviewItem({
  item,
  applied,
  dismissed,
  busy,
  onApply,
  onDismiss
}: {
  item: ReviewedQuestion
  applied: boolean
  dismissed: boolean
  busy: boolean
  onApply: () => void
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div
      className={`quiz-library-item quiz-review-panel-item${
        applied ? ' quiz-review-panel-item--applied' : ''
      }${dismissed ? ' quiz-review-panel-item--dismissed' : ''}`}
    >
      <p className="quiz-review-old">
        <span className="quiz-review-old-label">Cũ:</span> {item.original.questionText}
      </p>
      <p className="quiz-question-text">{item.improved.questionText}</p>
      <ul className="quiz-option-list">
        {item.improved.options.map((opt, idx) => (
          <li key={opt.id}>
            <div className={`quiz-option${opt.isCorrect ? ' quiz-option--correct' : ''}`}>
              <span className="quiz-option-letter">{String.fromCharCode(65 + idx)}</span>
              <span className="quiz-option-text">{opt.text}</span>
              {opt.isCorrect && <span className="quiz-option-mark">✓</span>}
            </div>
          </li>
        ))}
      </ul>
      {item.improved.explanation && (
        <p className="quiz-explanation">
          <strong>Giải thích:</strong> {item.improved.explanation}
        </p>
      )}
      <div className="quiz-library-item-actions">
        {applied ? (
          <span className="quiz-review-status">Đã áp dụng ✓</span>
        ) : dismissed ? (
          <span className="quiz-review-status">Đã bỏ qua</span>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={onApply}
            >
              Áp dụng
            </button>
            <button type="button" disabled={busy} onClick={onDismiss}>
              Bỏ qua
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function QuizReviewPanel({ results, scope, onClose }: QuizReviewPanelProps): React.JSX.Element {
  const updateMutation = useUpdateQuestion(scope)
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [applyingAll, setApplyingAll] = useState(false)

  const changed = results.filter((r) => r.changed)
  const unchangedCount = results.length - changed.length

  const applyOne = async (item: ReviewedQuestion): Promise<void> => {
    await updateMutation.mutateAsync({
      id: item.id,
      questionText: item.improved.questionText,
      options: item.improved.options,
      explanation: item.improved.explanation
    })
    // Cap "cau chua dat -> cau Claude sua" -> vi du few-shot cho Ollama hoc dan.
    recordLearningExamples([
      { kind: 'claude_fix', before: item.original, after: item.improved, ...scopeIds(scope) }
    ])
    setApplied((s) => new Set(s).add(item.id))
  }

  const applyAll = async (): Promise<void> => {
    setApplyingAll(true)
    for (const item of changed) {
      if (applied.has(item.id) || dismissed.has(item.id)) continue
      try {
        await applyOne(item)
      } catch {
        // bo qua cau loi, tiep tuc
      }
    }
    setApplyingAll(false)
  }

  const busy = updateMutation.isPending || applyingAll

  return (
    <div className="quiz-review-panel">
      <div className="quiz-review-panel-head">
        <p>
          <strong>{changed.length}</strong> câu được đề xuất chỉnh
          {unchangedCount > 0 && ` · ${unchangedCount} câu giữ nguyên`}
        </p>
        <div className="quiz-library-item-actions">
          {changed.length > 0 && (
            <button type="button" className="btn-primary" disabled={busy} onClick={applyAll}>
              {applyingAll ? 'Đang áp dụng...' : 'Áp dụng tất cả'}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Đóng đề xuất
          </button>
        </div>
      </div>

      {changed.length === 0 && (
        <p className="quiz-library-empty">
          AI không đề xuất chỉnh gì — các câu hiện tại đã ổn.
        </p>
      )}

      <div className="quiz-library-list">
        {changed.map((item) => (
          <ReviewItem
            key={item.id}
            item={item}
            applied={applied.has(item.id)}
            dismissed={dismissed.has(item.id)}
            busy={busy}
            onApply={() => void applyOne(item)}
            onDismiss={() => setDismissed((s) => new Set(s).add(item.id))}
          />
        ))}
      </div>
    </div>
  )
}

export default QuizReviewPanel
