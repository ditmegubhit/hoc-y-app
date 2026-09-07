import { useCallback, useMemo, useRef, useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import type {
  AttemptAnswerInput,
  AttemptReview,
  CreatedQuiz,
  QuizLaunchRequest
} from '@shared/types/quiz'
import { deriveCells, summarizeProgress } from '@shared/quiz/quizProgress'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useCreateQuiz,
  usePlayableQuestionsForLesson,
  usePlayableQuestionsForTopic,
  useSubmitAttempt,
  type QuizScope
} from '@renderer/queries/quiz'
import QuizSetupScreen, { type QuizStartOptions } from './QuizSetupScreen'
import QuizShell from './QuizShell'
import QuizQuestionCard from './QuizQuestionCard'
import QuizNavigator from './QuizNavigator'
import QuizTimer from './QuizTimer'
import QuizProgressBar from './QuizProgressBar'
import QuizReviewBeforeSubmit from './QuizReviewBeforeSubmit'
import QuizResultsScreen from './QuizResultsScreen'
import { useQuizTimer } from './useQuizTimer'

interface QuizPlayOverlayProps {
  request: QuizLaunchRequest
  onExit: () => void
}

type Phase = 'setup' | 'playing' | 'review' | 'results'

const MODE_LABEL = { practice: 'Luyện tập', exam: 'Thi thử' } as const

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
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [review, setReview] = useState<AttemptReview | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const startedAtRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const available = playableQuery.data ?? []
  const isPractice = quiz?.feedbackMode === 'practice'

  const answeredIds = useMemo(
    () => new Set(Object.entries(answers).filter(([, v]) => v != null).map(([k]) => k)),
    [answers]
  )

  const cells = useMemo(
    () =>
      quiz
        ? deriveCells({
            orderedIds: quiz.questions.map((q) => q.quizQuestionId),
            currentIndex,
            answeredIds,
            flaggedIds: flags
          })
        : [],
    [quiz, currentIndex, answeredIds, flags]
  )

  const doSubmit = useCallback(
    (): void => {
      if (!quiz || submitAttempt.isPending) return
      const elapsed = startedAtRef.current
        ? Math.floor((Date.now() - startedAtRef.current) / 1000)
        : 0
      const durationSeconds =
        quiz.timeLimitSeconds != null ? Math.min(elapsed, quiz.timeLimitSeconds) : elapsed
      const answerList: AttemptAnswerInput[] = quiz.questions.map((qq) => ({
        quizQuestionId: qq.quizQuestionId,
        selectedOptionId: answers[qq.quizQuestionId] ?? null,
        flagged: flags.has(qq.quizQuestionId)
      }))
      submitAttempt.mutate(
        {
          quizId: quiz.quizId,
          feedbackMode: quiz.feedbackMode,
          durationSeconds,
          answers: answerList
        },
        {
          onSuccess: (r) => {
            setReview(r)
            setPhase('results')
          }
        }
      )
    },
    [quiz, answers, flags, submitAttempt]
  )

  const handleAutoSubmit = useCallback((): void => {
    if (firedRef.current) return
    firedRef.current = true
    doSubmit()
  }, [doSubmit])

  // Dong ho chay ca o pha 'review' -> het gio khi dang soat cung tu nop.
  const timer = useQuizTimer({
    running: phase === 'playing' || phase === 'review',
    limitSeconds: quiz?.timeLimitSeconds ?? null,
    onExpire: handleAutoSubmit
  })

  const handleStart = (opts: QuizStartOptions): void => {
    const picked = shuffle(available).slice(0, opts.numQuestions)
    createQuiz.mutate(
      {
        scopeType: request.scopeType,
        lessonId: request.lessonId,
        topicId: request.topicId,
        lessonIds: request.lessonIds,
        feedbackMode: opts.feedbackMode,
        timeLimitSeconds: opts.timeLimitSeconds,
        questionIds: picked.map((q) => q.id),
        title: request.title
      },
      {
        onSuccess: (created) => {
          setQuiz(created)
          setCurrentIndex(0)
          setAnswers({})
          setRevealed(new Set())
          setFlags(new Set())
          setReview(null)
          firedRef.current = false
          startedAtRef.current = Date.now()
          setPhase('playing')
        }
      }
    )
  }

  const toggleFlag = (qqId: string): void =>
    setFlags((f) => {
      const n = new Set(f)
      if (n.has(qqId)) n.delete(qqId)
      else n.add(qqId)
      return n
    })

  const firstUnrevealed = quiz
    ? quiz.questions.findIndex((q) => !revealed.has(q.quizQuestionId))
    : 0
  const lockedForwardFrom = isPractice
    ? firstUnrevealed === -1
      ? (quiz?.questions.length ?? 0)
      : firstUnrevealed
    : null

  const jumpTo = (i: number): void => {
    if (!quiz) return
    const clamped = Math.max(0, Math.min(quiz.questions.length - 1, i))
    if (isPractice && lockedForwardFrom != null && clamped > lockedForwardFrom) return
    setCurrentIndex(clamped)
  }

  const requestExit = (): void => {
    if (phase === 'playing' || phase === 'review') setConfirmExit(true)
    else onExit()
  }

  // ---------- render từng pha ----------

  if (phase === 'setup') {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <QuizShell title={request.title} onExit={onExit}>
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
        </QuizShell>
      </div>
    )
  }

  if (!quiz) return <div className="quiz-play-overlay" role="dialog" aria-modal="true" />

  const modeLabel = MODE_LABEL[quiz.feedbackMode]

  if (phase === 'results' && review) {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <QuizShell title={request.title} modeLabel={modeLabel} onExit={onExit}>
          <QuizResultsScreen review={review} onExit={onExit} />
        </QuizShell>
      </div>
    )
  }

  if (phase === 'review') {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <QuizShell
          title={request.title}
          modeLabel={modeLabel}
          timer={
            quiz.timeLimitSeconds != null ? (
              <QuizTimer
                elapsedSeconds={timer.elapsedSeconds}
                remainingSeconds={timer.remainingSeconds}
              />
            ) : undefined
          }
          onExit={requestExit}
        >
          <QuizReviewBeforeSubmit
            summary={summarizeProgress(cells)}
            onJump={(i) => {
              setCurrentIndex(i)
              setPhase('playing')
            }}
            onBack={() => setPhase('playing')}
            onConfirm={doSubmit}
            submitting={submitAttempt.isPending}
          />
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

  // phase === 'playing'
  const q = quiz.questions[currentIndex]
  const selected = answers[q.quizQuestionId] ?? null
  const isRevealed = isPractice && revealed.has(q.quizQuestionId)
  const isLast = currentIndex === quiz.questions.length - 1
  const flagged = flags.has(q.quizQuestionId)

  const handleSelect = (optionId: string): void => {
    if (isPractice && revealed.has(q.quizQuestionId)) return
    setAnswers((a) => ({ ...a, [q.quizQuestionId]: optionId }))
    if (isPractice) setRevealed((r) => new Set(r).add(q.quizQuestionId))
  }

  return (
    <div className="quiz-play-overlay" role="dialog" aria-modal="true">
      <QuizShell
        title={request.title}
        modeLabel={modeLabel}
        timer={
          <QuizTimer
            elapsedSeconds={timer.elapsedSeconds}
            remainingSeconds={timer.remainingSeconds}
          />
        }
        progress={
          <QuizProgressBar
            answered={answeredIds.size}
            total={quiz.questions.length}
            index={currentIndex}
          />
        }
        headerAction={
          <button type="button" className="btn-primary" onClick={() => setPhase('review')}>
            Nộp bài
          </button>
        }
        onExit={requestExit}
        sidebar={
          <QuizNavigator
            cells={cells}
            onJump={jumpTo}
            lockedForwardFrom={lockedForwardFrom}
            mode="play"
          />
        }
      >
        <div className="lms-quiz-playbody">
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

          <div className="lms-quiz-footer">
            <button
              type="button"
              className="btn-secondary"
              disabled={currentIndex === 0}
              onClick={() => jumpTo(currentIndex - 1)}
            >
              Câu trước
            </button>

            <button
              type="button"
              className={`btn-secondary lms-flag-btn${flagged ? ' lms-flag-btn--on' : ''}`}
              onClick={() => toggleFlag(q.quizQuestionId)}
            >
              {flagged ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
              {flagged ? 'Bỏ đánh dấu' : 'Đánh dấu'}
            </button>

            {!isLast && (
              <button
                type="button"
                className="btn-primary"
                disabled={isPractice && !isRevealed}
                onClick={() => jumpTo(currentIndex + 1)}
              >
                Câu tiếp theo
              </button>
            )}
            {isLast && (
              <button type="button" className="btn-primary" onClick={() => setPhase('review')}>
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

export default QuizPlayOverlay
