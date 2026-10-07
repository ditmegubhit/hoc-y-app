import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X as XIcon } from 'lucide-react'
import { usePageImage } from '@renderer/queries/attachmentView'
import PracticeAnswerReport, { type PracticeAnswerReportTarget } from './PracticeAnswerReport'
import type { PracticeAttemptReview, PracticeMaskBox, Rect } from '@shared/types/practice'
import { formatDateTime, formatDuration, formatScore, isPassed, scorePercent } from '@shared/practice/quizLogic'
import './practiceQuiz.css'

// Ve 1 cau cua bai thi thuc hanh GP: anh trang + o che DUC (mau rieng cua tung o che,
// lay tu du lieu cau) + vien do dut net quanh vung can hoi + crop neu co.
// Che do 'play' = dang lam bai; 'review' = xem lai (mo che / lam mo che de thay dap an).

export interface PracticeCardQuestion {
  regionId: string
  pageNumber: number
  masks: PracticeMaskBox[]
  targetBox: Rect
  refWidth: number
  refHeight: number
  cropBox: Rect | null
}

export interface PracticeCardFeedback {
  isCorrect: boolean
  correctAnswerText: string
}

/** Cach hien thi lop che: 'answer' = chi mo che o hoi; 'faded' = lam mo moi o che; 'open' = mo het; 'covered' = che nhu luc thi. */
export type PracticeMaskView = 'answer' | 'faded' | 'open' | 'covered'

const MASK_VIEW_LABELS: { value: PracticeMaskView; label: string; hint: string }[] = [
  { value: 'answer', label: 'Đáp án', hint: 'Chỉ mở che ở vùng được hỏi' },
  { value: 'faded', label: 'Làm mờ', hint: 'Làm mờ mọi ô che để thấy chữ bên dưới' },
  { value: 'open', label: 'Mở che', hint: 'Bỏ hết ô che' },
  { value: 'covered', label: 'Như lúc thi', hint: 'Che đục như lúc làm bài' }
]

const FADED_OPACITY = 0.22

const sameBox = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x0 - b.x0) < 1 && Math.abs(a.y0 - b.y0) < 1 && Math.abs(a.x1 - b.x1) < 1 && Math.abs(a.y1 - b.y1) < 1

interface StageProps {
  fileId: string
  question: PracticeCardQuestion
  maskView: PracticeMaskView
  /** true: chi tai anh khi card gan vung nhin thay (danh sach xem lai co nhieu cau). */
  lazy?: boolean
}

// Khung anh + lop phu SVG. maskView quyet dinh o che nao hien va do dam.
function PracticeQuestionStage({ fileId, question, maskView, lazy = false }: StageProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(!lazy)
  useEffect(() => {
    if (near || !wrapRef.current || typeof IntersectionObserver === 'undefined') {
      if (!near && typeof IntersectionObserver === 'undefined') setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '700px 0px' }
    )
    observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [near])

  const pageImage = usePageImage(fileId, 'page', question.pageNumber, near)
  const crop = question.cropBox ?? { x0: 0, y0: 0, x1: question.refWidth, y1: question.refHeight }
  const width = Math.max(1, crop.x1 - crop.x0)
  const height = Math.max(1, crop.y1 - crop.y0)
  const href = useMemo(
    () => (pageImage.data ? `data:${pageImage.data.mimeType};base64,${pageImage.data.base64}` : null),
    [pageImage.data]
  )

  const visibleMasks = question.masks.filter((mask) => {
    if (maskView === 'open') return false
    if (maskView === 'answer' && sameBox(mask.box, question.targetBox)) return false
    return true
  })
  const maskOpacity = maskView === 'faded' ? FADED_OPACITY : 1
  const target = question.targetBox

  if (pageImage.isError) {
    return (
      <div ref={wrapRef} className="pq-stage pq-stage--empty" style={{ aspectRatio: `${width} / ${height}` }}>
        Không tải được ảnh trang {question.pageNumber}.
      </div>
    )
  }
  if (!href) {
    return (
      <div ref={wrapRef} className="pq-stage pq-stage--empty" style={{ aspectRatio: `${width} / ${height}` }}>
        <span className="pq-spinner" aria-hidden="true" /> Đang tải ảnh...
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="pq-stage">
      <svg className="pq-svg" viewBox={`${crop.x0} ${crop.y0} ${width} ${height}`} role="img"
        aria-label={`Trang ${question.pageNumber}, vùng được hỏi khoanh viền đỏ đứt nét`}>
        <image href={href} x="0" y="0" width={question.refWidth} height={question.refHeight} preserveAspectRatio="none" />
        {visibleMasks.map((mask, i) => (
          <rect key={i} x={mask.box.x0} y={mask.box.y0}
            width={Math.max(1, mask.box.x1 - mask.box.x0)} height={Math.max(1, mask.box.y1 - mask.box.y0)}
            fill={mask.color} fillOpacity={maskOpacity} stroke="none" shapeRendering="crispEdges" />
        ))}
        <rect x={target.x0} y={target.y0}
          width={Math.max(1, target.x1 - target.x0)} height={Math.max(1, target.y1 - target.y0)}
          className="pq-target-box" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

interface BaseProps {
  fileId: string
  question: PracticeCardQuestion
  index: number
  total: number
}

export interface PracticePlayCardProps extends BaseProps {
  mode: 'play'
  value: string
  onChange: (value: string) => void
  /** Khoa o nhap (da xac nhan / het gio / dang xem lai cau cu). */
  locked: boolean
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
  /** Chi co o che do luyen tap sau khi cham. */
  feedback?: PracticeCardFeedback | null
  timedOut?: boolean
  /** Dong nhac them duoi o nhap (vd "Dang xem lai cau cu"). */
  notice?: string | null
  /** Cho phep bao cao cham sai (bo sung / sua dap an) sau khi cau bi cham sai. */
  report?: PracticeAnswerReportTarget
}

export interface PracticeReviewCardProps extends BaseProps {
  mode: 'review'
  submittedText: string
  correctAnswerText: string
  isCorrect: boolean
  defaultMaskView?: PracticeMaskView
  report?: PracticeAnswerReportTarget
}

export type PracticeQuestionCardProps = PracticePlayCardProps | PracticeReviewCardProps

function PlayCard(props: PracticePlayCardProps): React.JSX.Element {
  const { fileId, question, index, total, value, onChange, locked, actionLabel, onAction, actionDisabled = false,
    feedback = null, timedOut = false, notice = null, report } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)

  // Cau moi / mo khoa -> focus o nhap; khoa (da xac nhan) -> focus nut de Enter chuyen tiep.
  useEffect(() => {
    if (locked) actionRef.current?.focus()
    else inputRef.current?.focus()
  }, [question.regionId, locked])

  const stateClass = feedback ? (feedback.isCorrect ? ' is-correct' : ' is-wrong') : ''

  return (
    <section className="pq-qcard" aria-label={`Câu ${index + 1} trên ${total}`}>
      <p className="pq-qtext"><strong>Câu {index + 1}/{total}.</strong> Đây là gì?</p>
      <PracticeQuestionStage fileId={fileId} question={question} maskView={feedback ? 'answer' : 'covered'} />
      <div className="pq-answer-bar">
        <input ref={inputRef} className={`pq-answer-input${stateClass}`} type="text" autoComplete="off" spellCheck={false}
          aria-label="Đáp án của bạn" placeholder="Gõ tên cấu trúc..." value={value} disabled={locked}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onAction()
            }
          }} />
        <button ref={actionRef} type="button" className="btn-primary pq-action" disabled={actionDisabled} onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      {notice && <p className="pq-notice">{notice}</p>}
      {feedback && (
        <div className={`pq-feedback ${feedback.isCorrect ? 'pq-feedback--ok' : 'pq-feedback--bad'}`} role="status" aria-live="polite">
          <p className="pq-feedback-head">
            {feedback.isCorrect ? <Check size={16} aria-hidden="true" /> : <XIcon size={16} aria-hidden="true" />}
            {feedback.isCorrect ? 'Đúng' : 'Sai'}
          </p>
          <p>Bạn trả lời: <strong>{value || '(để trống)'}</strong></p>
          <p>Đáp án đúng: <strong>{feedback.correctAnswerText}</strong></p>
          {timedOut && <p className="pq-feedback-late">Bạn ngu vcl</p>}
        </div>
      )}
      {feedback && !feedback.isCorrect && report && (
        <PracticeAnswerReport {...report} regionId={question.regionId} submittedText={value}
          correctAnswerText={feedback.correctAnswerText} />
      )}
    </section>
  )
}

function ReviewCard(props: PracticeReviewCardProps): React.JSX.Element {
  const { fileId, question, index, total, submittedText, correctAnswerText, isCorrect, defaultMaskView = 'answer', report } = props
  const [maskView, setMaskView] = useState<PracticeMaskView>(defaultMaskView)

  useEffect(() => setMaskView(defaultMaskView), [defaultMaskView])

  return (
    <section className={`pq-qcard pq-qcard--review ${isCorrect ? 'is-correct' : 'is-wrong'}`} aria-label={`Câu ${index + 1} trên ${total}`}>
      <header className="pq-review-head">
        <p className="pq-qtext"><strong>Câu {index + 1}/{total}</strong> · trang {question.pageNumber}</p>
        <span className={`pq-badge ${isCorrect ? 'pq-badge--ok' : 'pq-badge--bad'}`}>
          {isCorrect ? <Check size={13} aria-hidden="true" /> : <XIcon size={13} aria-hidden="true" />}
          {isCorrect ? 'Đúng' : 'Sai'}
        </span>
        <div className="pq-seg" role="group" aria-label="Cách hiển thị ô che">
          {MASK_VIEW_LABELS.map((option) => (
            <button key={option.value} type="button" title={option.hint}
              className={`pq-seg-btn${maskView === option.value ? ' is-active' : ''}`}
              aria-pressed={maskView === option.value} onClick={() => setMaskView(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <PracticeQuestionStage fileId={fileId} question={question} maskView={maskView} lazy />
      <div className="pq-compare">
        <div className={`pq-compare-box ${isCorrect ? 'pq-compare-box--ok' : 'pq-compare-box--bad'}`}>
          <span>Bạn trả lời</span>
          <strong>{submittedText.trim() === '' ? '(để trống)' : submittedText}</strong>
        </div>
        <div className="pq-compare-box pq-compare-box--ok">
          <span>Đáp án đúng</span>
          <strong>{correctAnswerText}</strong>
        </div>
      </div>
      {!isCorrect && report && (
        <PracticeAnswerReport {...report} regionId={question.regionId} submittedText={submittedText}
          correctAnswerText={correctAnswerText} />
      )}
    </section>
  )
}

export default function PracticeQuestionCard(props: PracticeQuestionCardProps): React.JSX.Element {
  return props.mode === 'play' ? <PlayCard {...props} /> : <ReviewCard {...props} />
}

// ---------- Man ket qua / xem lai 1 luot (dung chung cho Lam bai va Lich su) ----------

type ResultFilter = 'all' | 'wrong' | 'right'

export interface PracticeAttemptResultViewProps {
  fileId: string
  review: PracticeAttemptReview
  /** Cac nut hanh dong (On cau sai, Lam lai, Xoa...) ve ben phai phan tong ket. */
  actions?: React.ReactNode
  /** Goi khi bao cao cham sai lam doi ket qua luot (diem, so cau dung) de man cha cap nhat review. */
  onReviewChange?: (review: PracticeAttemptReview) => void
}

function ScoreRing({ score }: { score: number }): React.JSX.Element {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const ratio = Math.min(1, Math.max(0, score / 10))
  return (
    <svg className={`pq-ring ${isPassed(score) ? 'pq-ring--pass' : 'pq-ring--fail'}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle className="pq-ring-track" cx="50" cy="50" r={radius} />
      <circle className="pq-ring-value" cx="50" cy="50" r={radius}
        strokeDasharray={`${circumference * ratio} ${circumference}`} transform="rotate(-90 50 50)" />
      <text x="50" y="54" textAnchor="middle" className="pq-ring-text">{formatScore(score)}</text>
    </svg>
  )
}

export function PracticeAttemptResultView({ fileId, review, actions, onReviewChange }: PracticeAttemptResultViewProps): React.JSX.Element {
  const [filter, setFilter] = useState<ResultFilter>('all')
  const [maskView, setMaskView] = useState<PracticeMaskView>('answer')
  const wrongCount = review.answers.filter((a) => !a.isCorrect).length
  const passed = isPassed(review.score)
  const shown = review.answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => filter === 'all' || (filter === 'wrong' ? !answer.isCorrect : answer.isCorrect))

  const filters: { value: ResultFilter; label: string }[] = [
    { value: 'all', label: `Tất cả (${review.answers.length})` },
    { value: 'wrong', label: `Câu sai (${wrongCount})` },
    { value: 'right', label: `Câu đúng (${review.answers.length - wrongCount})` }
  ]

  return (
    <div className="pq-result">
      <section className="pq-hero">
        <ScoreRing score={review.score} />
        <div className="pq-hero-main">
          <h2 className="pq-hero-title">
            {formatScore(review.score)}/10 · {scorePercent(review.correctCount, review.totalCount)}%
            <span className={`pq-badge ${passed ? 'pq-badge--ok' : 'pq-badge--bad'}`}>{passed ? 'Đạt' : 'Chưa đạt'}</span>
          </h2>
          <p className="pq-hero-sub">{review.stationSetName} · Lần {review.attemptNumber}</p>
          <ul className="pq-stats">
            <li><strong>{review.correctCount}/{review.totalCount}</strong> câu đúng</li>
            <li><strong>{formatDuration(review.durationSeconds)}</strong></li>
            <li>{review.feedbackMode === 'exam' ? 'Thi thử' : 'Luyện tập'}</li>
            <li>{formatDateTime(review.submittedAt)}</li>
          </ul>
        </div>
        {actions && <div className="pq-hero-actions">{actions}</div>}
      </section>

      <div className="pq-result-toolbar">
        <div className="pq-seg" role="group" aria-label="Lọc câu">
          {filters.map((option) => (
            <button key={option.value} type="button" className={`pq-seg-btn${filter === option.value ? ' is-active' : ''}`}
              aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="pq-seg" role="group" aria-label="Cách hiển thị ô che mọi câu">
          {MASK_VIEW_LABELS.map((option) => (
            <button key={option.value} type="button" title={option.hint}
              className={`pq-seg-btn${maskView === option.value ? ' is-active' : ''}`}
              aria-pressed={maskView === option.value} onClick={() => setMaskView(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="pq-empty">Không có câu nào trong bộ lọc này.</p>}
      <div className="pq-result-list">
        {shown.map(({ answer, index }) => (
          <PracticeQuestionCard key={answer.regionId} mode="review" fileId={fileId} question={answer} index={index}
            total={review.answers.length} submittedText={answer.submittedText} correctAnswerText={answer.correctAnswerText}
            isCorrect={answer.isCorrect} defaultMaskView={maskView}
            report={onReviewChange ? {
              fileId,
              attemptId: review.attemptId,
              onReported: (result) => { if (result.review) onReviewChange(result.review) }
            } : undefined} />
        ))}
      </div>
    </div>
  )
}

// ---------- Khung overlay toan cua so dung chung cho 3 man (Tao bai thi / Lam bai / Lich su) ----------

export interface PracticeOverlayFrameProps {
  title: string
  subtitle?: string
  chip?: string
  actions?: React.ReactNode
  onClose: () => void
  closeLabel?: string
  /** Them class cho vung than (vd 'pq-body--flush' khi con tu quan ly cuon). */
  bodyClassName?: string
  children: React.ReactNode
}

export function PracticeOverlayFrame(props: PracticeOverlayFrameProps): React.JSX.Element {
  const { title, subtitle, chip, actions, onClose, closeLabel = 'Đóng', bodyClassName = '', children } = props
  return (
    <div className="pq-root pq-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <header className="pq-header">
        <div className="pq-header-title">
          <h2>{title}</h2>
          {subtitle && <span className="pq-header-sub" title={subtitle}>{subtitle}</span>}
          {chip && <span className="pq-chip">{chip}</span>}
        </div>
        <div className="pq-header-actions">
          {actions}
          <button type="button" className="btn-secondary" onClick={onClose}>
            <XIcon size={14} aria-hidden="true" /> {closeLabel}
          </button>
        </div>
      </header>
      <div className={`pq-body ${bodyClassName}`}>{children}</div>
    </div>
  )
}
