import { useState } from 'react'
import { Wand2, Cpu, Cloud } from 'lucide-react'
import type { Question, ReviewedQuestion } from '@shared/types/question'
import type { QuizLibraryRequest } from '@shared/types/quiz'
import type { AiProvider } from '@shared/types/ai'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import { useQuestionsByLesson, useQuestionsUnderTopic } from '@renderer/queries/questionBank'
import {
  useDeleteQuestion,
  useOllamaStatus,
  useReviewQuestions,
  type QuizScope
} from '@renderer/queries/quiz'
import { useRecentQuestionsStore } from '@renderer/stores/recentQuestionsStore'
import QuestionEditForm from './QuestionEditForm'
import QuizReviewPanel from './QuizReviewPanel'

interface QuizLibraryOverlayProps {
  request: QuizLibraryRequest
  onClose: () => void
}

function QuestionLibraryItem({
  question,
  scope,
  isNew
}: {
  question: Question
  scope: QuizScope
  isNew: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteMutation = useDeleteQuestion(scope)

  const cls = `quiz-library-item${isNew ? ' quiz-library-item--new' : ''}`

  if (editing) {
    return (
      <div className={cls}>
        <QuestionEditForm question={question} scope={scope} onDone={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className={cls}>
      <p className="quiz-question-text">{question.questionText}</p>
      <ul className="quiz-option-list">
        {question.options.map((opt, idx) => (
          <li key={opt.id}>
            <div className={`quiz-option${opt.isCorrect ? ' quiz-option--correct' : ''}`}>
              <span className="quiz-option-letter">{String.fromCharCode(65 + idx)}</span>
              <span className="quiz-option-text">{opt.text}</span>
              {opt.isCorrect && <span className="quiz-option-mark">✓</span>}
            </div>
          </li>
        ))}
      </ul>
      {question.explanation && (
        <p className="quiz-explanation">
          <strong>Giải thích:</strong> {question.explanation}
        </p>
      )}
      <div className="quiz-library-item-actions">
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          Sửa
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)}>
          Xoá
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Xác nhận xoá"
        message={`Xoá câu hỏi "${question.questionText}"?`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteMutation.mutate(question.id)
          setConfirmDelete(false)
        }}
      />
    </div>
  )
}

function QuizLibraryOverlay({ request, onClose }: QuizLibraryOverlayProps): React.JSX.Element {
  const scope: QuizScope =
    request.scopeType === 'lesson'
      ? { type: 'lesson', lessonId: request.lessonId as string }
      : { type: 'topic', topicId: request.topicId as string, lessonIds: [] }

  const lessonQuery = useQuestionsByLesson(
    request.scopeType === 'lesson' ? (request.lessonId as string) : ''
  )
  const topicQuery = useQuestionsUnderTopic(
    request.scopeType === 'topic' ? (request.topicId as string) : ''
  )
  const query = request.scopeType === 'lesson' ? lessonQuery : topicQuery
  const questions = query.data ?? []
  const recentIds = useRecentQuestionsStore((s) => s.ids)

  const reviewMutation = useReviewQuestions()
  const ollamaQuery = useOllamaStatus()
  const ollamaReady = ollamaQuery.data?.status === 'ready'
  const [reviewResults, setReviewResults] = useState<ReviewedQuestion[] | null>(null)

  // Chi ra soat cac cau VUA SOAN (bôi xanh) - khong dung ca ngan hang.
  const reviewableIds = questions.filter((q) => recentIds.has(q.id)).map((q) => q.id)
  const canReview = reviewableIds.length > 0

  const handleReview = (provider: AiProvider): void => {
    if (!canReview) return
    reviewMutation.mutate(
      { questionIds: reviewableIds, provider },
      { onSuccess: (res) => setReviewResults(res) }
    )
  }

  return (
    <div className="quiz-play-overlay" role="dialog" aria-modal="true">
      <div className="quiz-play-frame">
        <div className="quiz-play-header">
          <div>
            <h2>{request.title}</h2>
            <span className="quiz-play-progress">{questions.length} câu hỏi</span>
          </div>
          <div className="quiz-library-header-actions">
            {reviewResults === null && questions.length > 0 && (
              reviewMutation.isPending ? (
                <span className="quiz-review-status">
                  <Wand2 size={14} /> Đang rà soát {reviewableIds.length} câu...
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!ollamaReady || !canReview}
                    title={
                      !canReview
                        ? 'Chỉ rà soát các câu vừa soạn (bôi xanh) — chưa có câu nào'
                        : !ollamaReady
                          ? 'Ollama chưa sẵn sàng'
                          : undefined
                    }
                    onClick={() => handleReview('ollama')}
                  >
                    <Cpu size={14} /> Rà soát {canReview ? `${reviewableIds.length} câu mới ` : ''}
                    bằng máy
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!canReview}
                    title={
                      !canReview
                        ? 'Chỉ rà soát các câu vừa soạn (bôi xanh) — chưa có câu nào'
                        : undefined
                    }
                    onClick={() => handleReview('claude')}
                  >
                    <Cloud size={14} /> Rà soát {canReview ? `${reviewableIds.length} câu mới ` : ''}
                    bằng Claude
                  </button>
                </>
              )
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>

        {reviewMutation.isError && (
          <p className="quiz-ai-error">
            {(reviewMutation.error as Error)?.message ?? 'Rà soát thất bại. Thử lại nhé.'}
          </p>
        )}

        {reviewResults !== null ? (
          <QuizReviewPanel
            results={reviewResults}
            scope={scope}
            onClose={() => {
              setReviewResults(null)
              reviewMutation.reset()
            }}
          />
        ) : (
          <>
            {query.isLoading && <p className="quiz-setup-loading">Đang tải...</p>}

            {!query.isLoading && questions.length === 0 && (
              <p className="quiz-library-empty">
                Chưa có câu hỏi nào. Dùng &quot;Soạn câu hỏi&quot; trong khu kiểm tra để tạo.
              </p>
            )}

            <div className="quiz-library-list">
              {questions.map((q) => (
                <QuestionLibraryItem
                  key={q.id}
                  question={q}
                  scope={scope}
                  isNew={recentIds.has(q.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default QuizLibraryOverlay
