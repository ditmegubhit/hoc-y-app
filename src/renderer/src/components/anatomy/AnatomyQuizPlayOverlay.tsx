import { useRef, useState } from 'react'
import type { AnatomyAttemptReview, AnatomyFeedbackMode, StartedAnatomyAttempt } from '@shared/types/anatomyQuiz'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useAnatomyConfirmedCount,
  useCheckAnatomyAnswer,
  useStartAnatomyAttempt,
  useSubmitAnatomyAttempt
} from '@renderer/queries/anatomyQuiz'
import QuizShell from '../quiz/QuizShell'
import AnatomyQuestionCard from './AnatomyQuestionCard'

interface AnatomyQuizPlayOverlayProps {
  attachmentId: string
  title: string
  onExit: () => void
}

type Phase = 'setup' | 'playing' | 'results'

const MODE_LABEL: Record<AnatomyFeedbackMode, string> = { practice: 'Luyện tập', exam: 'Thi thử' }

function AnatomySetupScreen({
  availableCount,
  isLoading,
  starting,
  onStart,
  onExit
}: {
  availableCount: number
  isLoading: boolean
  starting: boolean
  onStart: (feedbackMode: AnatomyFeedbackMode, questionCount: number) => void
  onExit: () => void
}): React.JSX.Element {
  const [numQuestions, setNumQuestions] = useState(Math.min(availableCount, 10))
  const [feedbackMode, setFeedbackMode] = useState<AnatomyFeedbackMode>('practice')

  if (isLoading) return <p className="quiz-setup-loading">Đang tải câu hỏi...</p>

  if (availableCount === 0) {
    return (
      <div className="quiz-setup">
        <p className="quiz-ai-warning">
          Chưa có câu hỏi giải phẫu nào được xác nhận cho file này. Hãy soạn câu hỏi trước.
        </p>
        <div className="lms-quiz-footer">
          <button type="button" className="btn-secondary" onClick={onExit}>
            Thoát
          </button>
        </div>
      </div>
    )
  }

  const clampedCount = Math.max(1, Math.min(numQuestions || 1, availableCount))

  return (
    <div className="quiz-setup lms-setup">
      <p className="quiz-setup-available">
        Có <strong>{availableCount}</strong> câu hỏi đã xác nhận cho file này.
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
        <button
          type="button"
          className={`quiz-mode-card${feedbackMode === 'practice' ? ' quiz-mode-card--active' : ''}`}
          onClick={() => setFeedbackMode('practice')}
        >
          <strong>Luyện tập</strong>
          <span>Báo đúng/sai ngay sau mỗi câu.</span>
        </button>
        <button
          type="button"
          className={`quiz-mode-card${feedbackMode === 'exam' ? ' quiz-mode-card--active' : ''}`}
          onClick={() => setFeedbackMode('exam')}
        >
          <strong>Thi thử</strong>
          <span>Làm hết rồi mới chấm điểm.</span>
        </button>
      </div>

      <div className="lms-quiz-footer">
        <button type="button" className="btn-secondary" onClick={onExit}>
          Thoát
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={starting}
          onClick={() => onStart(feedbackMode, clampedCount)}
        >
          {starting ? 'Đang chuẩn bị...' : 'Bắt đầu'}
        </button>
      </div>
    </div>
  )
}

function AnatomyResultsScreen({
  review,
  onExit
}: {
  review: AnatomyAttemptReview
  onExit: () => void
}): React.JSX.Element {
  return (
    <div className="lms-results">
      <p className="anatomy-results-score">
        Điểm: <strong>{review.score}</strong>/10 ({review.correctCount}/{review.totalCount} câu đúng)
      </p>
      <ul className="anatomy-results-list">
        {review.answers.map((a, i) => (
          <li
            key={a.questionId}
            className={`anatomy-results-item${a.isCorrect ? ' anatomy-results-item--correct' : ' anatomy-results-item--wrong'}`}
          >
            <span className="anatomy-results-item-index">Câu {i + 1} (trang {a.pageNumber})</span>
            <span>Bạn trả lời: {a.submittedText || '(để trống)'}</span>
            {!a.isCorrect && <span>Đáp án đúng: {a.correctAnswerText}</span>}
          </li>
        ))}
      </ul>
      <div className="lms-quiz-footer">
        <button type="button" className="btn-primary" onClick={onExit}>
          Xong
        </button>
      </div>
    </div>
  )
}

function AnatomyQuizPlayOverlay({ attachmentId, title, onExit }: AnatomyQuizPlayOverlayProps): React.JSX.Element {
  const confirmedCount = useAnatomyConfirmedCount(attachmentId)
  const startAttempt = useStartAnatomyAttempt()
  const checkAnswer = useCheckAnatomyAnswer()
  const submitAttempt = useSubmitAnatomyAttempt(attachmentId)

  const [phase, setPhase] = useState<Phase>('setup')
  const [attempt, setAttempt] = useState<StartedAnatomyAttempt | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; correctAnswerText: string } | null>(null)
  const [review, setReview] = useState<AnatomyAttemptReview | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  const handleStart = (feedbackMode: AnatomyFeedbackMode, questionCount: number): void => {
    startAttempt.mutate(
      { attachmentId, feedbackMode, questionCount },
      {
        onSuccess: (started) => {
          setAttempt(started)
          setCurrentIndex(0)
          setInputValue('')
          setAnswers({})
          setFeedback(null)
          setReview(null)
          startedAtRef.current = Date.now()
          setPhase('playing')
        }
      }
    )
  }

  if (!attempt) {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <QuizShell title={title} onExit={onExit}>
          <AnatomySetupScreen
            availableCount={confirmedCount.data ?? 0}
            isLoading={confirmedCount.isLoading}
            starting={startAttempt.isPending}
            onStart={handleStart}
            onExit={onExit}
          />
        </QuizShell>
      </div>
    )
  }

  const isPractice = attempt.feedbackMode === 'practice'
  const modeLabel = MODE_LABEL[attempt.feedbackMode]

  if (phase === 'results' && review) {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <QuizShell title={title} modeLabel={modeLabel} onExit={onExit}>
          <AnatomyResultsScreen review={review} onExit={onExit} />
        </QuizShell>
      </div>
    )
  }

  const question = attempt.questions[currentIndex]
  const isLast = currentIndex === attempt.questions.length - 1
  const answered = isPractice ? feedback !== null : answers[question.questionId] !== undefined

  const requestExit = (): void => setConfirmExit(true)

  const handleAnswer = (): void => {
    if (isPractice) {
      checkAnswer.mutate(
        { questionId: question.questionId, submittedText: inputValue },
        { onSuccess: (result) => setFeedback(result) }
      )
    } else {
      setAnswers((a) => ({ ...a, [question.questionId]: inputValue }))
    }
  }

  const goToIndex = (i: number): void => {
    setCurrentIndex(i)
    setInputValue(answers[attempt.questions[i].questionId] ?? '')
    setFeedback(null)
  }

  const doSubmit = (): void => {
    if (submitAttempt.isPending) return
    const finalAnswers = { ...answers, [question.questionId]: inputValue }
    const elapsed = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0
    submitAttempt.mutate(
      {
        attemptId: attempt.attemptId,
        durationSeconds: elapsed,
        answers: attempt.questions.map((q) => ({
          questionId: q.questionId,
          submittedText: finalAnswers[q.questionId] ?? ''
        }))
      },
      {
        onSuccess: (r) => {
          setReview(r)
          setPhase('results')
        }
      }
    )
  }

  return (
    <div className="quiz-play-overlay" role="dialog" aria-modal="true">
      <QuizShell title={title} modeLabel={modeLabel} onExit={requestExit}>
        <div className="anatomy-quiz-playbody">
          <AnatomyQuestionCard
            attachmentId={attachmentId}
            question={question}
            index={currentIndex}
            total={attempt.questions.length}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAnswer}
            feedback={isPractice ? feedback : null}
            disabled={isPractice && answered}
          />

          <div className="lms-quiz-footer">
            <button type="button" className="btn-secondary" disabled={currentIndex === 0} onClick={() => goToIndex(currentIndex - 1)}>
              Câu trước
            </button>
            {!isLast && (
              <button
                type="button"
                className="btn-primary"
                disabled={isPractice && !answered}
                onClick={() => {
                  if (!isPractice) handleAnswer()
                  goToIndex(currentIndex + 1)
                }}
              >
                Câu tiếp theo
              </button>
            )}
            {isLast && (
              <button type="button" className="btn-primary" disabled={isPractice && !answered} onClick={doSubmit}>
                Nộp bài
              </button>
            )}
          </div>
        </div>
      </QuizShell>

      <ConfirmDialog
        open={confirmExit}
        title="Thoát bài kiểm tra?"
        message="Kết quả chưa nộp sẽ không được lưu."
        confirmLabel="Thoát"
        cancelLabel="Ở lại"
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          setConfirmExit(false)
          onExit()
        }}
      />
    </div>
  )
}

export default AnatomyQuizPlayOverlay
