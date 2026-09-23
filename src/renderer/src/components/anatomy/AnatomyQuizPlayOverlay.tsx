import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnatomyAttemptReview,
  AnatomyFeedbackMode,
  AnatomyStationSet,
  StartedAnatomyAttempt
} from '@shared/types/anatomyQuiz'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useAnatomyQuestionSummaries,
  useAnatomyStationSets,
  useAnatomyAttemptHistory,
  useCreateAnatomyStationSet,
  useDeleteAnatomyAttemptHistory,
  useDeleteAnatomyStationSet,
  useCheckAnatomyAnswer,
  useStartAnatomyAttempt,
  useSubmitAnatomyAttempt
} from '@renderer/queries/anatomyQuiz'
import QuizShell from '../quiz/QuizShell'
import AnatomyQuestionCard from './AnatomyQuestionCard'

interface Props { attachmentId: string; title: string; onExit: () => void }
type Feedback = { isCorrect: boolean; correctAnswerText: string }

const shuffle = <T,>(values: T[]): T[] => {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function beep(frequency: number): void {
  try {
    const AudioCtx = window.AudioContext
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.frequency.value = frequency
    gain.gain.value = 0.08
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start()
    oscillator.stop(ctx.currentTime + 0.13)
  } catch { /* May bị tắt âm thanh hệ thống. */ }
}

function Setup({ attachmentId, onStart, onReview, onExit }: {
  attachmentId: string
  onStart: (set: AnatomyStationSet) => void
  onReview: (attemptId: string) => void
  onExit: () => void
}): React.JSX.Element {
  const questions = useAnatomyQuestionSummaries(attachmentId)
  const sets = useAnatomyStationSets(attachmentId)
  const createSet = useCreateAnatomyStationSet(attachmentId)
  const deleteSet = useDeleteAnatomyStationSet(attachmentId)
  const history = useAnatomyAttemptHistory(attachmentId)
  const deleteHistory = useDeleteAnatomyAttemptHistory(attachmentId)
  const [mode, setMode] = useState<AnatomyFeedbackMode>('practice')
  const [time, setTime] = useState(30)
  const [count, setCount] = useState(10)
  const [fromPage, setFromPage] = useState(1)
  const [toPage, setToPage] = useState(9999)
  const [manual, setManual] = useState<Set<string> | null>(null)
  const available = useMemo(() => (questions.data ?? []).filter((q) =>
    q.pageNumber >= fromPage && q.pageNumber <= toPage && (manual === null || manual.has(q.id))),
  [questions.data, fromPage, toPage, manual])

  const createAndStart = (): void => {
    const safeTime = mode === 'exam' ? Math.max(1, time) : Math.max(0, time)
    const picked = shuffle(available).slice(0, Math.max(1, Math.min(count || 1, available.length)))
    if (picked.length === 0) return
    createSet.mutate({ attachmentId, feedbackMode: mode, timeLimitSeconds: Math.min(300, safeTime), questionIds: picked.map((q) => q.id) },
      { onSuccess: onStart })
  }

  return <div className="anatomy-station-setup">
    <section className="anatomy-setup-card">
      <h3>Tạo đề mới</h3>
      <div className="quiz-setup-modes">
        {(['practice', 'exam'] as const).map((value) => <button key={value} type="button"
          className={`quiz-mode-card${mode === value ? ' quiz-mode-card--active' : ''}`}
          onClick={() => { setMode(value); if (value === 'exam' && time === 0) setTime(30) }}>
          <strong>{value === 'practice' ? 'Ôn tập' : 'Thi thử'}</strong>
          <span>{value === 'practice' ? 'Hiện đáp án sau khi xác nhận.' : 'Tự chuyển khi hết giờ.'}</span>
        </button>)}
      </div>
      <div className="anatomy-setup-grid">
        <label>Số câu<input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <label>Giây/câu<input type="number" min={mode === 'exam' ? 1 : 0} max={300} value={time}
          onChange={(e) => setTime(Math.max(mode === 'exam' ? 1 : 0, Math.min(300, Number(e.target.value))))} /></label>
        <label>Từ trang<input type="number" min={1} value={fromPage} onChange={(e) => setFromPage(Math.max(1, Number(e.target.value)))} /></label>
        <label>Đến trang<input type="number" min={1} value={toPage} onChange={(e) => setToPage(Math.max(1, Number(e.target.value)))} /></label>
      </div>
      {mode === 'practice' && time === 0 && <p className="quiz-generate-hint">Không giới hạn thời gian.</p>}
      <details className="anatomy-question-picker">
        <summary>Chọn câu thủ công ({available.length} câu đang chọn)</summary>
        <div className="anatomy-picker-actions">
          <button type="button" className="btn-secondary" onClick={() => setManual(null)}>Chọn tất cả trong khoảng</button>
          <button type="button" className="btn-secondary" onClick={() => setManual(new Set())}>Bỏ chọn tất cả</button>
        </div>
        {(questions.data ?? []).filter((q) => q.pageNumber >= fromPage && q.pageNumber <= toPage).map((q) => {
          const checked = manual === null || manual.has(q.id)
          return <label key={q.id} className="anatomy-question-choice">
            <input type="checkbox" checked={checked} onChange={() => {
              const next = new Set(manual ?? (questions.data ?? []).map((item) => item.id))
              if (next.has(q.id)) next.delete(q.id); else next.add(q.id)
              setManual(next)
            }} /> Trang {q.pageNumber}: {q.answerText}
          </label>
        })}
      </details>
      <button type="button" className="btn-primary" disabled={createSet.isPending || available.length === 0} onClick={createAndStart}>
        {createSet.isPending ? 'Đang tạo...' : 'Tạo đề và bắt đầu'}
      </button>
    </section>
    <section className="anatomy-setup-card">
      <h3>Lịch sử Thi thử 30 giây</h3>
      {(history.data ?? []).length === 0 && <p>Chưa có lượt thi hoàn thành được lưu.</p>}
      {(history.data ?? []).length > 0 && <div className="anatomy-history-chart" aria-label="Biểu đồ điểm theo lần thi">
        {[...(history.data ?? [])].reverse().map((item) => <div key={item.attemptId} title={`Lần ${item.attemptNumber}: ${item.score}/10`}>
          <span style={{ height: `${item.score * 10}%` }} /><small>{item.score}</small>
        </div>)}
      </div>}
      {(history.data ?? []).map((item) => <div className="anatomy-saved-set" key={item.attemptId}>
        <div><strong>{item.stationSetName} · Lần {item.attemptNumber}</strong>
          <span>{item.correctCount}/{item.totalCount} · {item.score}/10 · {new Date(`${item.submittedAt}Z`).toLocaleString('vi-VN')}</span></div>
        <button type="button" className="btn-secondary" onClick={() => onReview(item.attemptId)}>Xem lại</button>
        <button type="button" className="btn-danger" onClick={() => deleteHistory.mutate(item.attemptId)}>Xóa</button>
      </div>)}
    </section>
    <section className="anatomy-setup-card">
      <h3>Đề đã lưu</h3>
      {(sets.data ?? []).length === 0 && <p>Chưa có đề nào.</p>}
      {(sets.data ?? []).map((set) => <div className="anatomy-saved-set" key={set.id}>
        <div><strong>{set.name}</strong><span>{set.feedbackMode === 'practice' ? 'Ôn tập' : 'Thi thử'} · {set.questionCount} câu · Lần {set.nextAttemptNumber}</span></div>
        <button type="button" className="btn-primary" onClick={() => onStart(set)}>Làm bài</button>
        <button type="button" className="btn-danger" onClick={() => deleteSet.mutate(set.id)}>Xóa</button>
      </div>)}
    </section>
    <button type="button" className="btn-secondary" onClick={onExit}>Thoát</button>
  </div>
}

export default function AnatomyQuizPlayOverlay({ attachmentId, title, onExit }: Props): React.JSX.Element {
  const startAttempt = useStartAnatomyAttempt()
  const checkAnswer = useCheckAnatomyAnswer()
  const submitAttempt = useSubmitAnatomyAttempt(attachmentId)
  const createRetrySet = useCreateAnatomyStationSet(attachmentId)
  const [attempt, setAttempt] = useState<StartedAnatomyAttempt | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [viewIndex, setViewIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sound, setSound] = useState(true)
  const [result, setResult] = useState<AnatomyAttemptReview | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [resumePrompt, setResumePrompt] = useState<StartedAnatomyAttempt | null>(null)
  const startedAt = useRef<number>(Date.now())
  const lastTick = useRef<number>(Date.now())
  const warned = useRef(false)
  const activeKey = `anatomy-active-${attachmentId}`

  useEffect(() => {
    const stored = localStorage.getItem(activeKey)
    if (!stored) return
    const parsed = JSON.parse(stored) as { attemptId: string }
    void window.api.anatomy.resumeAttempt(parsed.attemptId).then((value) => value && setResumePrompt(value))
  }, [attachmentId])

  const enter = (started: StartedAnatomyAttempt, penaltyMs = 0): void => {
    let index = started.currentIndex
    let remaining = started.remainingMs
    if (remaining != null && penaltyMs > 0) {
      let debt = penaltyMs
      while (debt >= remaining && index < started.questions.length - 1) {
        debt -= remaining; index += 1; remaining = started.timeLimitSeconds * 1000
      }
      remaining = Math.max(0, remaining - debt)
    }
    const cached = localStorage.getItem(activeKey)
    const cachedAnswers = cached ? (JSON.parse(cached) as { answers?: Record<string, string> }).answers ?? {} : {}
    setAttempt(started); setActiveIndex(index); setViewIndex(index); setRemainingMs(remaining)
    setAnswers(cachedAnswers); setConfirmed(new Set()); setFeedback({}); setResumePrompt(null)
    startedAt.current = Date.now(); lastTick.current = Date.now(); warned.current = false
    localStorage.setItem(activeKey, JSON.stringify({ attemptId: started.attemptId, answers: cachedAnswers }))
  }

  const start = (set: AnatomyStationSet): void => {
    startAttempt.mutate({ stationSetId: set.id }, { onSuccess: (started) => enter(started) })
  }

  useEffect(() => {
    if (!attempt || result) return
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    return () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined) }
  }, [attempt !== null, result !== null])

  const finish = (nextAnswers = answers): void => {
    if (!attempt || submitAttempt.isPending) return
    submitAttempt.mutate({
      attemptId: attempt.attemptId,
      durationSeconds: Math.floor((Date.now() - startedAt.current) / 1000),
      answers: attempt.questions.map((q) => ({ questionId: q.questionId, submittedText: nextAnswers[q.questionId] ?? '' }))
    }, { onSuccess: (review) => { localStorage.removeItem(activeKey); setResult(review) } })
  }

  const advance = (nextAnswers = answers): void => {
    if (!attempt) return
    if (activeIndex >= attempt.questions.length - 1) { finish(nextAnswers); return }
    const next = activeIndex + 1
    setActiveIndex(next); setViewIndex(next); setRemainingMs(attempt.timeLimitSeconds === 0 ? null : attempt.timeLimitSeconds * 1000)
    setReviewSeconds(null); setTimedOut(false); warned.current = false; lastTick.current = Date.now()
  }

  const expire = (): void => {
    if (!attempt) return
    const q = attempt.questions[activeIndex]
    const currentAnswers = { ...answers, [q.questionId]: answers[q.questionId] ?? '' }
    setAnswers(currentAnswers); setConfirmed((old) => new Set(old).add(q.questionId)); setViewIndex(activeIndex)
    if (sound) beep(260)
    if (attempt.feedbackMode === 'practice') {
      checkAnswer.mutate({ questionId: q.questionId, submittedText: currentAnswers[q.questionId] }, {
        onSuccess: (value) => { setFeedback((old) => ({ ...old, [q.questionId]: value })); setTimedOut(true); setReviewSeconds(10) }
      })
    } else advance(currentAnswers)
  }

  const applyDelayPenalty = (penaltyMs: number): void => {
    if (!attempt || remainingMs === null || penaltyMs <= 0) return
    let debt = penaltyMs
    let index = activeIndex
    let remaining = remainingMs
    const nextAnswers = { ...answers }
    const nextConfirmed = new Set(confirmed)
    while (debt >= remaining) {
      const question = attempt.questions[index]
      nextAnswers[question.questionId] = nextAnswers[question.questionId] ?? ''
      nextConfirmed.add(question.questionId)
      debt -= remaining
      if (index >= attempt.questions.length - 1) {
        setAnswers(nextAnswers); setConfirmed(nextConfirmed); setRemainingMs(0)
        return
      }
      index += 1
      remaining = attempt.timeLimitSeconds * 1000
    }
    setAnswers(nextAnswers); setConfirmed(nextConfirmed)
    setActiveIndex(index); setViewIndex(index); setRemainingMs(Math.max(0, remaining - debt))
    setReviewSeconds(null); setTimedOut(false); warned.current = false; lastTick.current = Date.now()
  }

  useEffect(() => {
    if (!attempt || paused || reviewSeconds !== null || remainingMs === null || result) return
    lastTick.current = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.min(1000, now - lastTick.current)
      lastTick.current = now
      setRemainingMs((old) => old == null ? null : Math.max(0, old - delta))
    }, 200)
    return () => window.clearInterval(id)
  }, [attempt, paused, reviewSeconds, result, activeIndex])

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 5000 && remainingMs > 0 && !warned.current) {
      warned.current = true; if (sound) beep(720)
    }
    if (remainingMs === 0 && reviewSeconds === null) expire()
  }, [remainingMs])

  useEffect(() => {
    if (reviewSeconds === null) return
    if (reviewSeconds <= 0) { advance(); return }
    const id = window.setTimeout(() => setReviewSeconds((value) => value == null ? null : value - 1), 1000)
    return () => window.clearTimeout(id)
  }, [reviewSeconds])

  useEffect(() => {
    if (!attempt) return
    localStorage.setItem(activeKey, JSON.stringify({ attemptId: attempt.attemptId, answers }))
    const id = window.setTimeout(() => {
      void window.api.anatomy.saveAttemptProgress({
        attemptId: attempt.attemptId, currentIndex: activeIndex, remainingMs,
        penaltyDebtMs: 0,
        answers: Object.entries(answers).map(([questionId, submittedText]) => ({ questionId, submittedText }))
      })
    }, 300)
    return () => window.clearTimeout(id)
  }, [attempt?.attemptId, activeIndex, remainingMs == null ? null : Math.floor(remainingMs / 1000), answers])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (attempt?.feedbackMode !== 'practice') return
      if (event.key === 'ArrowLeft' && reviewSeconds === null && viewIndex > 0) setViewIndex(viewIndex - 1)
      if (event.key === 'ArrowRight' && reviewSeconds === null && viewIndex < activeIndex) setViewIndex(viewIndex + 1)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [attempt, reviewSeconds, viewIndex, activeIndex])

  if (resumePrompt) return <div className="quiz-play-overlay"><div className="anatomy-resume-warning">
    <button className="anatomy-resume-close" onClick={() => { localStorage.removeItem(activeKey); setResumePrompt(null); onExit() }}>×</button>
    <p>Việc rời khỏi phòng thi là điều cấm kỵ, và để trả giá cho điều đó, chúng tôi sẽ giảm bớt 3 giây cho câu tiếp theo của bạn, chấp nhận nhé?</p>
    <div><button className="btn-primary" onClick={() => enter(resumePrompt, 3000)}>Chấp nhận</button>
      <button className="btn-primary" onClick={() => enter(resumePrompt, 3000)}>Phải chấp nhận</button></div>
  </div></div>

  if (result) return <div className="quiz-play-overlay"><QuizShell title={`${result.stationSetName} · Lần ${result.attemptNumber}`} onExit={onExit}>
    <div className="lms-results"><h2>{result.score}/10 · {Math.round((result.correctCount / Math.max(1, result.totalCount)) * 100)}% · {result.score >= 4 ? 'Đạt' : 'Chưa đạt'}</h2>
      {result.answers.map((answer, index) => <div key={answer.questionId} className="anatomy-review-result">
        <AnatomyQuestionCard attachmentId={attachmentId} question={{
          questionId: answer.questionId, pageNumber: answer.pageNumber, maskBoxes: answer.maskBoxes,
          targetBox: answer.targetBox, refWidth: answer.refWidth, refHeight: answer.refHeight, cropBox: answer.cropBox
        }} index={index} total={result.totalCount} value={answer.submittedText} onChange={() => undefined}
          onConfirm={() => undefined} confirmed feedback={{ isCorrect: answer.isCorrect, correctAnswerText: answer.correctAnswerText }} />
      </div>)}
      <div className="anatomy-result-actions">
        {result.answers.some((answer) => !answer.isCorrect) && <button className="btn-secondary" disabled={createRetrySet.isPending} onClick={() => {
          createRetrySet.mutate({ attachmentId, feedbackMode: 'practice', timeLimitSeconds: 30,
            questionIds: result.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.questionId) },
          { onSuccess: (set) => { setResult(null); start(set) } })
        }}>Ôn lại câu sai</button>}
        <button className="btn-primary" onClick={() => { setResult(null); setAttempt(null) }}>Về danh sách đề</button>
      </div>
    </div>
  </QuizShell></div>

  if (!attempt) return <div className="quiz-play-overlay"><QuizShell title={title} onExit={onExit}>
    <Setup attachmentId={attachmentId} onStart={start} onReview={(attemptId) => {
      void window.api.anatomy.getAttemptReview(attemptId).then((review) => review && setResult(review))
    }} onExit={onExit} />
  </QuizShell></div>

  const q = attempt.questions[viewIndex]
  const qFeedback = feedback[q.questionId] ?? null
  const isActive = viewIndex === activeIndex
  const isConfirmed = confirmed.has(q.questionId)
  const pct = remainingMs === null ? 100 : Math.max(0, Math.min(100, remainingMs / Math.max(1, attempt.timeLimitSeconds * 10)))
  const onConfirm = (): void => {
    if (!isActive || reviewSeconds !== null) return
    if (attempt.feedbackMode === 'exam' && isConfirmed) {
      setConfirmed((old) => { const next = new Set(old); next.delete(q.questionId); return next }); return
    }
    setConfirmed((old) => new Set(old).add(q.questionId))
    if (attempt.feedbackMode === 'practice') checkAnswer.mutate({ questionId: q.questionId, submittedText: answers[q.questionId] ?? '' },
      { onSuccess: (value) => setFeedback((old) => ({ ...old, [q.questionId]: value })) })
  }

  return <div className="quiz-play-overlay"><QuizShell title={`${attempt.stationSetName} · Lần ${attempt.attemptNumber}`}
    modeLabel={attempt.feedbackMode === 'practice' ? 'Ôn tập' : 'Thi thử'} onExit={() => setConfirmExit(true)}>
    <div className="anatomy-station-toolbar">
      <div className={`anatomy-station-timer${remainingMs !== null && remainingMs <= 5000 ? ' danger' : ''}`}>
        {reviewSeconds !== null ? `Xem đáp án: ${reviewSeconds}s` : remainingMs === null ? 'Không giới hạn' : `${Math.ceil(remainingMs / 1000)}s`}
        <span style={{ width: `${reviewSeconds !== null ? reviewSeconds * 10 : pct}%` }} />
      </div>
      <button className="btn-secondary" onClick={() => {
        if (paused) applyDelayPenalty(1000)
        setPaused(!paused); lastTick.current = Date.now()
      }}>{paused ? 'Tiếp tục (-1 giây)' : 'Tạm dừng'}</button>
      <button className="btn-secondary" onClick={() => setSound(!sound)}>{sound ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}</button>
    </div>
    {paused ? <div className="anatomy-paused">Đã tạm dừng</div> : <>
      {!isActive && <p className="quiz-ai-warning">Đang xem lại câu cũ. Đồng hồ của câu {activeIndex + 1} vẫn chạy.</p>}
      <AnatomyQuestionCard attachmentId={attachmentId} question={q} index={viewIndex} total={attempt.questions.length}
        value={answers[q.questionId] ?? ''} onChange={(value) => setAnswers((old) => ({ ...old, [q.questionId]: value }))}
        onConfirm={onConfirm} confirmed={isConfirmed} allowUnconfirm={attempt.feedbackMode === 'exam'}
        feedback={qFeedback} timedOut={timedOut && isActive} />
      {isActive && attempt.feedbackMode === 'practice' && isConfirmed && reviewSeconds === null &&
        <button className="btn-primary anatomy-next" onClick={() => advance()}>Câu tiếp theo</button>}
    </>}
  </QuizShell>
  <ConfirmDialog open={confirmExit} title="Thoát bài thi?" message="Lượt làm sẽ được lưu là chưa hoàn thành."
    confirmLabel="Thoát" cancelLabel="Ở lại" onCancel={() => setConfirmExit(false)} onConfirm={() => {
      setConfirmExit(false); void window.api.anatomy.saveAttemptProgress({
        attemptId: attempt.attemptId, currentIndex: activeIndex, remainingMs, penaltyDebtMs: 3000,
        answers: Object.entries(answers).map(([questionId, submittedText]) => ({ questionId, submittedText }))
      }); onExit()
    }} /></div>
}
