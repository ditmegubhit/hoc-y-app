import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useCheckPracticeAnswer,
  useCreatePracticeReviewSet,
  usePracticeActiveAttempt,
  usePracticeFile,
  usePracticeStationSets,
  useResumePracticeAttempt,
  useSavePracticeAttemptProgress,
  useStartPracticeAttempt,
  useSubmitPracticeAttempt
} from '@renderer/queries/practice'
import {
  PENALTY_ON_PAUSE_MS,
  PENALTY_ON_RESUME_MS,
  applyTimePenalty,
  errorText
} from '@shared/practice/quizLogic'
import type {
  PracticeAttemptReview,
  PracticeStationSet,
  StartedPracticeAttempt
} from '@shared/types/practice'
import PracticeQuestionCard, {
  PracticeAttemptResultView,
  PracticeOverlayFrame,
  type PracticeCardFeedback
} from './PracticeQuestionCard'
import './practiceQuiz.css'

export interface PracticePlayOverlayProps {
  fileId: string
  onClose: () => void
  /** Co thi bo qua buoc chon de va bat dau thang bo de nay. */
  initialStationSetId?: string
}

const REVIEW_SECONDS = 10
const DISMISSED_KEY = 'practice-dismissed-attempts'

function beep(frequency: number): void {
  try {
    const ctx = new window.AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.frequency.value = frequency
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.13)
    oscillator.onended = () => void ctx.close().catch(() => undefined)
  } catch {
    /* Am thanh he thong co the bi tat. */
  }
}

// Backend khong co thao tac "bo luot do dang", nen ghi nho cac luot user da chon bo de khong hoi lai.
function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberDismissed(attemptId: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...readDismissed(), attemptId])].slice(-50)))
  } catch {
    /* Bo qua neu khong ghi duoc. */
  }
}

const isFormTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)

// =====================================================================
// Chon de
// =====================================================================

interface PickerProps {
  fileId: string
  busy: boolean
  error: string | null
  ignoredAttemptIds: ReadonlySet<string>
  onStart: (set: PracticeStationSet) => void
  onResume: (attemptId: string) => void
  onDismissAttempt: (attemptId: string) => void
}

function StationSetPicker(props: PickerProps): React.JSX.Element {
  const { fileId, busy, error, ignoredAttemptIds, onStart, onResume, onDismissAttempt } = props
  const sets = usePracticeStationSets(fileId)
  const active = usePracticeActiveAttempt(fileId)
  const activeId = active.data && !ignoredAttemptIds.has(active.data) ? active.data : null
  const list = sets.data ?? []

  return (
    <div className="pq-picker">
      {activeId && (
        <div className="pq-modal-backdrop">
          <div className="pq-modal" role="alertdialog" aria-modal="true" aria-label="Lượt làm dở">
            <h3>Bạn còn một lượt làm dở</h3>
            <p>
              Việc rời khỏi phòng thi là điều cấm kỵ, và để trả giá cho điều đó, chúng tôi sẽ giảm bớt 3 giây cho câu
              tiếp theo của bạn, chấp nhận nhé?
            </p>
            <div className="pq-modal-actions">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onResume(activeId)}>Chấp nhận</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onResume(activeId)}>Phải chấp nhận</button>
              <button type="button" className="pq-link-btn" disabled={busy} onClick={() => onDismissAttempt(activeId)}>
                Bỏ lượt dở này
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pq-picker-inner">
        <div className="pq-section-head">
          <h3>Chọn đề để làm</h3>
          <p>Đề được tạo ở mục "Tạo bài thi". Mỗi lượt làm sẽ xáo thứ tự câu.</p>
        </div>
        {error && <p className="pq-error" role="alert">{error}</p>}
        {sets.isLoading && <p className="pq-empty">Đang tải danh sách đề...</p>}
        {!sets.isLoading && list.length === 0 && (
          <div className="pq-empty-card">
            <strong>Chưa có đề nào</strong>
            <span>Hãy dùng "Tạo bài thi" để tạo đề từ các câu đã duyệt của file này.</span>
          </div>
        )}
        <ul className="pq-set-grid">
          {list.map((set) => (
            <li key={set.id} className="pq-set-card">
              <div className="pq-set-main">
                <strong className="pq-set-name">{set.name}</strong>
                <div className="pq-set-chips">
                  <span className={`pq-chip pq-chip--${set.feedbackMode}`}>{set.feedbackMode === 'exam' ? 'Thi thử' : 'Luyện tập'}</span>
                  {set.isReviewSet && <span className="pq-chip pq-chip--review">Ôn câu sai</span>}
                  <span className="pq-chip pq-chip--plain">{set.questionCount} câu</span>
                  <span className="pq-chip pq-chip--plain">
                    {set.timeLimitSeconds === 0 ? 'Không giới hạn' : `${set.timeLimitSeconds} giây/câu`}
                  </span>
                </div>
                <span className="pq-set-meta">Lần làm tiếp theo: {set.nextAttemptNumber}</span>
              </div>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onStart(set)}>
                <Play size={14} aria-hidden="true" /> Làm bài
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// =====================================================================
// Dang lam bai
// =====================================================================

interface RunnerProps {
  fileId: string
  started: StartedPracticeAttempt
  /** Thoi gian phat ap dung ngay khi vao (khi tiep tuc luot do dang). */
  penaltyMs: number
  onFinished: (review: PracticeAttemptReview) => void
  onExit: () => void
}

function computeInitialState(started: StartedPracticeAttempt, penaltyMs: number): { index: number; remainingMs: number | null } {
  const lastIndex = Math.max(0, started.questions.length - 1)
  let index = Math.min(Math.max(0, started.currentIndex), lastIndex)
  let remainingMs = started.remainingMs
  if (remainingMs !== null && penaltyMs > 0 && started.timeLimitSeconds > 0) {
    const result = applyTimePenalty({ index, remainingMs, penaltyMs, timeLimitMs: started.timeLimitSeconds * 1000, lastIndex })
    index = result.index
    remainingMs = result.remainingMs
  }
  return { index, remainingMs }
}

function AttemptRunner({ fileId, started, penaltyMs, onFinished, onExit }: RunnerProps): React.JSX.Element {
  const { attemptId, questions, feedbackMode, timeLimitSeconds } = started
  const isPractice = feedbackMode === 'practice'
  const limitMs = timeLimitSeconds * 1000
  const lastIndex = questions.length - 1

  const checkAnswer = useCheckPracticeAnswer()
  const submitAttempt = useSubmitPracticeAttempt(fileId)
  const saveProgress = useSavePracticeAttemptProgress()

  const initial = useMemo(() => computeInitialState(started, penaltyMs), [started, penaltyMs])
  const [activeIndex, setActiveIndex] = useState(initial.index)
  const [viewIndex, setViewIndex] = useState(initial.index)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(started.answers.map((a) => [a.regionId, a.submittedText])))
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set())
  const [feedback, setFeedback] = useState<Record<string, PracticeCardFeedback>>({})
  const [remainingMs, setRemainingMs] = useState<number | null>(initial.remainingMs)
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sound, setSound] = useState(true)
  const [confirmExit, setConfirmExit] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const startedAt = useRef(Date.now())
  const pausedAt = useRef<number | null>(null)
  const pausedTotal = useRef(0)
  const lastTick = useRef(Date.now())
  const warned = useRef(false)
  const submitting = useRef(false)
  const finished = useRef(false)
  const intentionalFullscreenExit = useRef(false)
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined)
  const latest = useRef({ activeIndex, remainingMs, answers })
  latest.current = { activeIndex, remainingMs, answers }

  const current = questions[activeIndex]
  const viewing = questions[viewIndex]
  const isActive = viewIndex === activeIndex
  const confirmedCurrent = confirmed.has(current.regionId)
  const frozen = isPractice && confirmedCurrent // da xac nhan o luyen tap: dung dong ho cho den khi sang cau ke

  const saveNow = (penaltyDebtMs: number): void => {
    if (finished.current) return
    const snap = latest.current
    saveProgress.mutate({
      attemptId,
      currentIndex: snap.activeIndex,
      remainingMs: snap.remainingMs === null ? null : Math.max(0, Math.round(snap.remainingMs)),
      penaltyDebtMs,
      answers: Object.entries(snap.answers).map(([regionId, submittedText]) => ({ regionId, submittedText }))
    })
  }

  // ----- hanh dong -----

  const finish = (finalAnswers: Record<string, string> = answers): void => {
    if (submitting.current || finished.current) return
    submitting.current = true
    setSubmitError(null)
    if (pausedAt.current !== null) pausedTotal.current += Date.now() - pausedAt.current
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt.current - pausedTotal.current) / 1000))
    submitAttempt.mutate(
      {
        attemptId,
        durationSeconds,
        answers: questions.map((q) => ({ regionId: q.regionId, submittedText: finalAnswers[q.regionId] ?? '' }))
      },
      {
        onSuccess: (review) => {
          finished.current = true
          onFinished(review)
        },
        onError: (error) => {
          submitting.current = false
          setSubmitError(errorText(error, 'Không nộp được bài. Hãy thử lại.'))
        }
      }
    )
  }

  const goToQuestion = (index: number): void => {
    setActiveIndex(index)
    setViewIndex(index)
    setRemainingMs(timeLimitSeconds === 0 ? null : limitMs)
    setReviewSeconds(null)
    setTimedOut(false)
    setNotice(null)
    warned.current = false
    lastTick.current = Date.now()
  }

  const advance = (nextAnswers: Record<string, string> = answers): void => {
    if (activeIndex >= lastIndex) {
      finish(nextAnswers)
      return
    }
    goToQuestion(activeIndex + 1)
  }

  const expire = (): void => {
    if (submitting.current || finished.current) return
    const q = questions[activeIndex]
    const text = answers[q.regionId] ?? ''
    const nextAnswers = { ...answers, [q.regionId]: text }
    setAnswers(nextAnswers)
    setConfirmed((old) => new Set(old).add(q.regionId))
    setViewIndex(activeIndex)
    if (sound) beep(260)
    if (!isPractice) {
      advance(nextAnswers)
      return
    }
    checkAnswer
      .mutateAsync({ attemptId, regionId: q.regionId, submittedText: text })
      .then((value) => {
        setFeedback((old) => ({ ...old, [q.regionId]: value }))
        setTimedOut(true)
        setReviewSeconds(REVIEW_SECONDS)
      })
      .catch(() => {
        setTimedOut(true)
        setReviewSeconds(3)
      })
  }

  const applyPenalty = (penalty: number): void => {
    if (remainingMs === null || penalty <= 0 || frozen || reviewSeconds !== null) return
    const result = applyTimePenalty({ index: activeIndex, remainingMs, penaltyMs: penalty, timeLimitMs: limitMs, lastIndex })
    if (result.expiredIndices.length > 0) {
      setAnswers((old) => {
        const next = { ...old }
        for (const i of result.expiredIndices) next[questions[i].regionId] = next[questions[i].regionId] ?? ''
        return next
      })
      setConfirmed((old) => {
        const next = new Set(old)
        for (const i of result.expiredIndices) next.add(questions[i].regionId)
        return next
      })
    }
    if (result.index !== activeIndex) {
      setActiveIndex(result.index)
      setViewIndex(result.index)
      setTimedOut(false)
      warned.current = false
    }
    setRemainingMs(result.remainingMs)
    lastTick.current = Date.now()
  }

  const togglePause = (): void => {
    if (paused) {
      if (pausedAt.current !== null) pausedTotal.current += Date.now() - pausedAt.current
      pausedAt.current = null
      setPaused(false)
      lastTick.current = Date.now()
      applyPenalty(PENALTY_ON_PAUSE_MS)
    } else {
      pausedAt.current = Date.now()
      setPaused(true)
    }
  }

  const onAction = (): void => {
    if (submitting.current || paused) return
    if (!isActive) {
      setViewIndex(activeIndex)
      return
    }
    if (reviewSeconds !== null) {
      advance() // bo qua dem nguoc xem dap an
      return
    }
    if (isPractice) {
      if (confirmedCurrent) {
        if (feedback[current.regionId]) advance()
        return
      }
      const regionId = current.regionId
      setConfirmed((old) => new Set(old).add(regionId))
      setNotice(null)
      checkAnswer
        .mutateAsync({ attemptId, regionId, submittedText: answers[regionId] ?? '' })
        .then((value) => setFeedback((old) => ({ ...old, [regionId]: value })))
        .catch((error: unknown) => {
          setConfirmed((old) => {
            const next = new Set(old)
            next.delete(regionId)
            return next
          })
          setNotice(errorText(error, 'Không chấm được câu này. Hãy thử xác nhận lại.'))
        })
      return
    }
    // Thi thu: chi khoa / mo khoa dap an, khong cham.
    const regionId = current.regionId
    setConfirmed((old) => {
      const next = new Set(old)
      if (next.has(regionId)) next.delete(regionId)
      else next.add(regionId)
      return next
    })
  }

  // ----- toan man hinh -----

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      intentionalFullscreenExit.current = true
      void document.exitFullscreen().catch(() => undefined).finally(() => {
        window.setTimeout(() => { intentionalFullscreenExit.current = false }, 400)
      })
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    }
  }

  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    const onChange = (): void => {
      const full = document.fullscreenElement !== null
      setIsFullscreen(full)
      // Thoat toan man hinh bang Esc (khong phai bam nut) -> coi nhu muon thoat bai thi: hoi xac nhan.
      if (!full && !intentionalFullscreenExit.current && !finished.current) setConfirmExit(true)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // Roi man hinh (dong overlay, doi trang) khi chua nop: luu tien trinh.
  useEffect(() => () => {
    if (!finished.current && !submitting.current) saveNow(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- dong ho -----

  const ticking = !paused && reviewSeconds === null && remainingMs !== null && !frozen && !submitError
  useEffect(() => {
    if (!ticking) return
    lastTick.current = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.min(1000, now - lastTick.current)
      lastTick.current = now
      setRemainingMs((old) => (old === null ? null : Math.max(0, old - delta)))
    }, 200)
    return () => window.clearInterval(id)
  }, [ticking, activeIndex])

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 5000 && remainingMs > 0 && !warned.current) {
      warned.current = true
      if (sound) beep(720)
    }
    if (remainingMs === 0 && reviewSeconds === null) expire()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs])

  // dem nguoc xem dap an sau khi het gio (luyen tap)
  useEffect(() => {
    if (reviewSeconds === null) return
    if (reviewSeconds <= 0) {
      advance()
      return
    }
    const id = window.setTimeout(() => setReviewSeconds((value) => (value === null ? null : value - 1)), 1000)
    return () => window.clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSeconds])

  // luu tien trinh dinh ky (gop 300ms, doi moi 3 giay cua dong ho)
  const remainingBucket = remainingMs === null ? null : Math.floor(remainingMs / 3000)
  useEffect(() => {
    const id = window.setTimeout(() => saveNow(0), 300)
    return () => window.clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, remainingBucket, answers])

  // Xem lai cau cu o luyen tap: lay phan hoi neu chua co (vd sau khi tiep tuc luot do dang).
  useEffect(() => {
    if (!isPractice || viewIndex >= activeIndex) return
    const q = questions[viewIndex]
    if (feedback[q.regionId]) return
    let cancelled = false
    checkAnswer
      .mutateAsync({ attemptId, regionId: q.regionId, submittedText: answers[q.regionId] ?? '' })
      .then((value) => { if (!cancelled) setFeedback((old) => ({ ...old, [q.regionId]: value })) })
      .catch(() => undefined)
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex, activeIndex])

  // ----- ban phim -----

  keyHandler.current = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setConfirmExit(true) // dong hop thoai bang nut (tranh xung dot voi su kien thoat toan man hinh)
      return
    }
    if (confirmExit) return
    if (event.key === 'Enter' && !event.isComposing && !isFormTarget(event.target)) {
      event.preventDefault()
      onAction()
      return
    }
    if (isPractice && reviewSeconds === null && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const plainArrowOk = !(event.target instanceof HTMLInputElement) // trong o nhap, mui ten di chuyen con tro
      if (!event.altKey && !plainArrowOk) return
      event.preventDefault()
      if (event.key === 'ArrowLeft' && viewIndex > 0) setViewIndex(viewIndex - 1)
      if (event.key === 'ArrowRight' && viewIndex < activeIndex) setViewIndex(viewIndex + 1)
    }
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => keyHandler.current(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ----- hien thi -----

  const timerLabel =
    reviewSeconds !== null
      ? `Xem đáp án: ${reviewSeconds}s`
      : remainingMs === null
        ? 'Không giới hạn'
        : frozen
          ? 'Đã xác nhận'
          : `${Math.ceil(remainingMs / 1000)}s`
  const pct = remainingMs === null || timeLimitSeconds === 0
    ? 100
    : Math.max(0, Math.min(100, (remainingMs / limitMs) * 100))
  const danger = remainingMs !== null && remainingMs <= 5000 && reviewSeconds === null && !frozen
  const doneRatio = (activeIndex / Math.max(1, questions.length)) * 100

  const viewingConfirmed = !isActive || confirmed.has(viewing.regionId)
  const viewFeedback = isPractice && viewingConfirmed ? (feedback[viewing.regionId] ?? null) : null
  const waitingFeedback = isPractice && isActive && confirmedCurrent && !feedback[current.regionId] && !timedOut
  const actionLabel = !isActive
    ? 'Về câu hiện tại'
    : isPractice
      ? confirmedCurrent ? (activeIndex >= lastIndex ? 'Nộp bài' : 'Câu tiếp theo') : 'Xác nhận'
      : confirmedCurrent ? 'Huỷ xác nhận' : 'Xác nhận'
  const cardNotice =
    notice ??
    (!isActive
      ? `Đang xem lại câu cũ. Đồng hồ của câu ${activeIndex + 1} vẫn chạy.`
      : !isPractice && confirmedCurrent
        ? 'Đáp án đã khóa. Câu sẽ tự chuyển khi hết giờ, hoặc bấm "Huỷ xác nhận" để sửa.'
        : null)

  const doExit = (): void => {
    setConfirmExit(false)
    saveNow(PENALTY_ON_RESUME_MS)
    finished.current = true // da luu xong, khong luu lai luc go bo
    onExit()
  }

  return (
    <>
      <PracticeOverlayFrame
        title={`${started.stationSetName} · Lần ${started.attemptNumber}`}
        chip={isPractice ? 'Luyện tập' : 'Thi thử'}
        onClose={() => setConfirmExit(true)}
        closeLabel="Thoát"
        bodyClassName="pq-body--run"
      >
        <div className="pq-toolbar">
          <div className={`pq-timer${danger ? ' is-danger' : ''}${frozen ? ' is-frozen' : ''}`} role="timer" aria-live="off">
            <span className="pq-timer-label">{timerLabel}</span>
            <span className="pq-timer-bar" style={{ width: `${reviewSeconds !== null ? (reviewSeconds / REVIEW_SECONDS) * 100 : pct}%` }} />
          </div>
          <div className="pq-progress" title={`Đã qua ${activeIndex}/${questions.length} câu`}>
            <span>Câu {activeIndex + 1}/{questions.length}</span>
            <span className="pq-progress-bar"><span style={{ width: `${doneRatio}%` }} /></span>
          </div>
          <div className="pq-toolbar-actions">
            <button type="button" className="btn-secondary" onClick={togglePause} disabled={frozen && !paused}>
              {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
              {paused ? `Tiếp tục (-${PENALTY_ON_PAUSE_MS / 1000} giây)` : 'Tạm dừng'}
            </button>
            <button type="button" className="btn-secondary" aria-pressed={sound} onClick={() => setSound((v) => !v)}>
              {sound ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
              Âm thanh: {sound ? 'Bật' : 'Tắt'}
            </button>
            <button type="button" className="btn-secondary" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
              {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
            </button>
          </div>
        </div>

        {submitError && (
          <div className="pq-error pq-error--bar" role="alert">
            {submitError}
            <button type="button" className="btn-secondary" onClick={() => finish()}>Nộp lại</button>
          </div>
        )}

        {paused ? (
          <div className="pq-paused">
            <Pause size={42} aria-hidden="true" />
            <strong>Đã tạm dừng</strong>
            <span>Câu hỏi được ẩn trong lúc tạm dừng. Tiếp tục sẽ bị trừ {PENALTY_ON_PAUSE_MS / 1000} giây.</span>
          </div>
        ) : (
          <div className="pq-run-main">
            <PracticeQuestionCard
              key={viewing.regionId}
              mode="play"
              fileId={fileId}
              question={viewing}
              index={viewIndex}
              total={questions.length}
              value={answers[viewing.regionId] ?? ''}
              onChange={(value) => setAnswers((old) => ({ ...old, [viewing.regionId]: value }))}
              locked={viewingConfirmed || (timedOut && isActive)}
              actionLabel={actionLabel}
              onAction={onAction}
              actionDisabled={submitAttempt.isPending || waitingFeedback}
              feedback={viewFeedback}
              timedOut={timedOut && isActive}
              notice={cardNotice}
            />
            <p className="pq-keyhint">
              Enter: {isPractice ? 'xác nhận / câu tiếp theo' : 'xác nhận đáp án'} · Esc: thoát
              {isPractice && ' · Alt + ← →: xem lại câu trước'}
            </p>
          </div>
        )}
      </PracticeOverlayFrame>
      <ConfirmDialog
        open={confirmExit}
        title="Thoát bài thi?"
        message="Lượt làm sẽ được lưu là chưa hoàn thành. Khi quay lại bạn sẽ bị trừ 3 giây."
        confirmLabel="Thoát"
        cancelLabel="Ở lại"
        onCancel={() => {
          setConfirmExit(false)
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined)
        }}
        onConfirm={doExit}
      />
    </>
  )
}

// =====================================================================
// Overlay chinh
// =====================================================================

type Phase =
  | { kind: 'pick' }
  | { kind: 'run'; started: StartedPracticeAttempt; penaltyMs: number }
  | { kind: 'result'; review: PracticeAttemptReview; stationSetId: string | null }

export default function PracticePlayOverlay({ fileId, onClose, initialStationSetId }: PracticePlayOverlayProps): React.JSX.Element {
  const file = usePracticeFile(fileId)
  const startAttempt = useStartPracticeAttempt(fileId)
  const resumeAttempt = useResumePracticeAttempt()
  const createReviewSet = useCreatePracticeReviewSet(fileId)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [booting, setBooting] = useState(initialStationSetId !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set(readDismissed()))
  const autoStarted = useRef(false)

  const startSet = (stationSetId: string): void => {
    setError(null)
    startAttempt.mutate(
      { stationSetId },
      {
        onSuccess: (started) => {
          setBooting(false)
          setPhase({ kind: 'run', started, penaltyMs: 0 })
        },
        onError: (err) => {
          setBooting(false)
          setPhase({ kind: 'pick' })
          setError(errorText(err, 'Không bắt đầu được bài thi.'))
        }
      }
    )
  }

  useEffect(() => {
    if (initialStationSetId === undefined || autoStarted.current) return
    autoStarted.current = true
    startSet(initialStationSetId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resume = (attemptId: string): void => {
    setError(null)
    resumeAttempt.mutate(attemptId, {
      onSuccess: (started) => {
        if (!started) {
          rememberDismissed(attemptId)
          setIgnored((old) => new Set(old).add(attemptId))
          setError('Lượt làm dở này không còn khả dụng.')
          return
        }
        setPhase({ kind: 'run', started, penaltyMs: Math.max(PENALTY_ON_RESUME_MS, started.penaltyDebtMs) })
      },
      onError: (err) => setError(errorText(err, 'Không tiếp tục được lượt làm dở.'))
    })
  }

  const dismissAttempt = (attemptId: string): void => {
    rememberDismissed(attemptId)
    setIgnored((old) => new Set(old).add(attemptId))
  }

  const onFinished = (review: PracticeAttemptReview, stationSetId: string | null): void => {
    setIgnored((old) => new Set(old).add(review.attemptId))
    setPhase({ kind: 'result', review, stationSetId })
  }

  // Esc o man chon de / ket qua = dong (man lam bai tu xu ly Esc rieng).
  useEffect(() => {
    if (phase.kind === 'run') return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase.kind, onClose])

  const subtitle = file.data?.name

  if (phase.kind === 'run') {
    return (
      <AttemptRunner
        key={phase.started.attemptId}
        fileId={fileId}
        started={phase.started}
        penaltyMs={phase.penaltyMs}
        onFinished={(review) => onFinished(review, phase.started.stationSetId)}
        onExit={onClose}
      />
    )
  }

  if (phase.kind === 'result') {
    const { review, stationSetId } = phase
    const hasWrong = review.answers.some((a) => !a.isCorrect)
    const busy = startAttempt.isPending || createReviewSet.isPending
    return (
      <PracticeOverlayFrame title="Kết quả" subtitle={subtitle} chip={review.feedbackMode === 'exam' ? 'Thi thử' : 'Luyện tập'} onClose={onClose}>
        {error && <p className="pq-error" role="alert">{error}</p>}
        <PracticeAttemptResultView
          fileId={fileId}
          review={review}
          actions={
            <>
              {hasWrong && (
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => {
                    setError(null)
                    createReviewSet.mutate(review.attemptId, {
                      onSuccess: (set) => startSet(set.id),
                      onError: (err) => setError(errorText(err, 'Không tạo được bộ ôn câu sai.'))
                    })
                  }}>
                  {createReviewSet.isPending ? 'Đang tạo...' : 'Ôn câu sai'}
                </button>
              )}
              {stationSetId && (
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => startSet(stationSetId)}>
                  <RotateCcw size={14} aria-hidden="true" /> Làm lại
                </button>
              )}
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPhase({ kind: 'pick' })}>
                Về danh sách đề
              </button>
            </>
          }
        />
      </PracticeOverlayFrame>
    )
  }

  return (
    <PracticeOverlayFrame title="Làm bài" subtitle={subtitle} onClose={onClose}>
      {booting ? (
        <div className="pq-loading"><span className="pq-spinner" aria-hidden="true" /> Đang chuẩn bị bài thi...</div>
      ) : (
        <StationSetPicker
          fileId={fileId}
          busy={startAttempt.isPending || resumeAttempt.isPending}
          error={error}
          ignoredAttemptIds={ignored}
          onStart={(set) => startSet(set.id)}
          onResume={resume}
          onDismissAttempt={dismissAttempt}
        />
      )}
    </PracticeOverlayFrame>
  )
}
