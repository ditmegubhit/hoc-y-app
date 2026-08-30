import { useMemo, useState } from 'react'
import type { AttemptAnswerInput, AttemptReview, CreatedQuiz, QuizLaunchRequest } from '@shared/types/quiz'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useCreateQuiz,
  usePlayableQuestionsForLesson,
  usePlayableQuestionsForTopic,
  useSubmitAttempt,
  type QuizScope
} from '@renderer/queries/quiz'
import QuizSetupScreen from './QuizSetupScreen'
import QuizQuestionCard from './QuizQuestionCard'
import QuizResultsScreen from './QuizResultsScreen'

interface QuizPlayOverlayProps {
  request: QuizLaunchRequest
  onExit: () => void
}

type Phase = 'setup' | 'playing' | 'results'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function QuizPlayOverlay({ request, onExit }: QuizPlayOverlayProps): React.JSX.Element {
  const scope: QuizScope = useMemo(
    () =>
      request.scopeType === 'lesson'
        ? { type: 'lesson', lessonId: request.lessonId as string }
        : { type: 'topic', topicId: request.topicId as string, lessonIds: request.lessonIds },
    [request]
  )

  const lessonPlayable = usePlayableQuestionsForLesson(
    request.scopeType === 'lesson' ? request.lessonId : null
  )
  const topicPlayable = usePlayableQuestionsForTopic(
    request.scopeType === 'topic' ? request.topicId : null,
    request.lessonIds
  )
  const playableQuery = request.scopeType === 'lesson' ? lessonPlayable : topicPlayable

  const createQuiz = useCreateQuiz()
  const submitAttempt = useSubmitAttempt(scope)

  const [phase, setPhase] = useState<Phase>('setup')
  const [quiz, setQuiz] = useState<CreatedQuiz | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [review, setReview] = useState<AttemptReview | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)

  const available = playableQuery.data ?? []

  const handleStart = (opts: { numQuestions: number; feedbackMode: 'practice' | 'exam' }): void => {
    const picked = shuffle(available).slice(0, opts.numQuestions)
    createQuiz.mutate(
      {
        scopeType: request.scopeType,
        lessonId: request.lessonId,
        topicId: request.topicId,
        lessonIds: request.lessonIds,
        feedbackMode: opts.feedbackMode,
        questionIds: picked.map((q) => q.id),
        title: request.title
      },
      {
        onSuccess: (created) => {
          setQuiz(created)
          setCurrentIndex(0)
          setAnswers({})
          setRevealed(new Set())
          setPhase('playing')
        }
      }
    )
  }

  const handleSubmit = (): void => {
    if (!quiz) return
    const answerList: AttemptAnswerInput[] = quiz.questions.map((qq) => ({
      quizQuestionId: qq.quizQuestionId,
      selectedOptionId: answers[qq.quizQuestionId] ?? null
    }))
    submitAttempt.mutate(
      { quizId: quiz.quizId, feedbackMode: quiz.feedbackMode, answers: answerList },
      {
        onSuccess: (r) => {
          setReview(r)
          setPhase('results')
        }
      }
    )
  }

  const requestExit = (): void => {
    if (phase === 'playing') setConfirmExit(true)
    else onExit()
  }

  const progressLabel =
    phase === 'playing' && quiz ? `Câu ${currentIndex + 1}/${quiz.questions.length}` : null

  const renderPlaying = (): React.JSX.Element | null => {
    if (!quiz) return null
    const q = quiz.questions[currentIndex]
    const selected = answers[q.quizQuestionId] ?? null
    const isPractice = quiz.feedbackMode === 'practice'
    const isRevealed = isPractice && revealed.has(q.quizQuestionId)
    const isLast = currentIndex === quiz.questions.length - 1

    const handleSelect = (optionId: string): void => {
      if (isPractice && revealed.has(q.quizQuestionId)) return
      setAnswers((a) => ({ ...a, [q.quizQuestionId]: optionId }))
      if (isPractice) {
        setRevealed((r) => new Set(r).add(q.quizQuestionId))
      }
    }

    return (
      <div className="quiz-playing">
        <QuizQuestionCard
          questionText={q.questionText}
          options={q.options}
          explanation={q.explanation}
          index={currentIndex}
          total={quiz.questions.length}
          selectedOptionId={selected}
          reveal={isRevealed}
          onSelect={handleSelect}
        />

        <div className="quiz-play-nav">
          {!isPractice && (
            <button
              type="button"
              className="btn-secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              Câu trước
            </button>
          )}

          {!isLast && (
            <button
              type="button"
              className="btn-primary"
              disabled={isPractice && !isRevealed}
              onClick={() => setCurrentIndex((i) => Math.min(quiz.questions.length - 1, i + 1))}
            >
              Câu tiếp theo
            </button>
          )}

          {(isLast || !isPractice) && (
            <button
              type="button"
              className="btn-primary"
              disabled={submitAttempt.isPending || (isPractice && isLast && !isRevealed)}
              onClick={handleSubmit}
            >
              {submitAttempt.isPending ? 'Đang chấm...' : 'Nộp bài'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-play-overlay" role="dialog" aria-modal="true">
      <div className="quiz-play-frame">
        <div className="quiz-play-header">
          <div>
            <h2>{request.title}</h2>
            {progressLabel && <span className="quiz-play-progress">{progressLabel}</span>}
          </div>
          <button type="button" className="btn-secondary" onClick={requestExit}>
            Thoát
          </button>
        </div>

        {phase === 'setup' && (
          <QuizSetupScreen
            availableCount={available.length}
            isLoading={playableQuery.isLoading}
            starting={createQuiz.isPending}
            errorMessage={
              playableQuery.isError
                ? 'Không tải được danh sách câu hỏi.'
                : createQuiz.isError
                  ? 'Không tạo được bài kiểm tra. Thử lại nhé.'
                  : null
            }
            onStart={handleStart}
            onExit={onExit}
          />
        )}

        {phase === 'playing' && renderPlaying()}

        {phase === 'results' && review && <QuizResultsScreen review={review} onExit={onExit} />}
      </div>

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

export default QuizPlayOverlay
