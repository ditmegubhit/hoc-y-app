import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useCreatePracticeReviewSet,
  useDeletePracticeAttemptHistory,
  usePracticeAttemptHistory,
  usePracticeAttemptReview,
  usePracticeFile
} from '@renderer/queries/practice'
import {
  PASS_SCORE,
  buildScoreSeries,
  errorText,
  formatDateTime,
  formatScore,
  isPassed,
  parseSqliteUtc,
  type ScoreChartLayout
} from '@shared/practice/quizLogic'
import type { PracticeAttemptReview, PracticeAttemptSummary } from '@shared/types/practice'
import PracticePlayOverlay from './PracticePlayOverlay'
import { PracticeAttemptResultView, PracticeOverlayFrame } from './PracticeQuestionCard'
import './practiceQuiz.css'

export interface PracticeHistoryOverlayProps {
  fileId: string
  onClose: () => void
  /**
   * Tuy chon: nhan id bo "on cau sai" vua tao de lam ngay. Neu khong truyen, overlay tu mo
   * PracticePlayOverlay ben trong (initialStationSetId) roi quay lai man nay khi dong.
   */
  onStartStationSet?: (stationSetId: string) => void
}

const CHART: ScoreChartLayout = { width: 560, height: 210, padLeft: 34, padRight: 16, padTop: 14, padBottom: 28 }
const Y_TICKS = [0, 5, 10]

function shortDate(text: string): string {
  const date = parseSqliteUtc(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

interface ChartProps {
  history: PracticeAttemptSummary[]
  selectedId: string | null
  onSelect: (attemptId: string) => void
}

// Bieu do duong SVG thuan: diem theo thoi gian, rai deu theo thu tu lan thi.
function ScoreChart({ history, selectedId, onSelect }: ChartProps): React.JSX.Element {
  const points = useMemo(() => buildScoreSeries(history, CHART), [history])
  const yOf = (score: number): number => CHART.padTop + (CHART.height - CHART.padTop - CHART.padBottom) * (1 - score / 10)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const baseY = yOf(0)
  const area = points.length > 1 ? `${line} L${points[points.length - 1].x.toFixed(1)} ${baseY} L${points[0].x.toFixed(1)} ${baseY} Z` : ''
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))

  return (
    <svg className="pq-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="group" aria-label="Biểu đồ điểm theo thời gian">
      <defs>
        <linearGradient id="pq-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line className="pq-chart-grid" x1={CHART.padLeft} x2={CHART.width - CHART.padRight} y1={yOf(tick)} y2={yOf(tick)} />
          <text className="pq-chart-label" x={CHART.padLeft - 8} y={yOf(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}
      <line className="pq-chart-pass" x1={CHART.padLeft} x2={CHART.width - CHART.padRight} y1={yOf(PASS_SCORE)} y2={yOf(PASS_SCORE)} />
      <text className="pq-chart-label pq-chart-label--pass" x={CHART.width - CHART.padRight} y={yOf(PASS_SCORE) - 5} textAnchor="end">
        Đạt ({PASS_SCORE})
      </text>
      {area && <path d={area} fill="url(#pq-chart-fill)" />}
      {points.length > 1 && <path className="pq-chart-line" d={line} />}
      {points.map((p, i) => {
        const selected = p.attemptId === selectedId
        const passed = isPassed(p.score)
        return (
          <g key={p.attemptId} className={`pq-chart-point${selected ? ' is-selected' : ''}${passed ? ' is-pass' : ' is-fail'}`}
            tabIndex={0} role="button" aria-label={`${p.label}: ${formatScore(p.score)}/10, ${formatDateTime(p.submittedAt)}`}
            aria-pressed={selected} onClick={() => onSelect(p.attemptId)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.attemptId) } }}>
            <title>{`${p.label} · ${formatScore(p.score)}/10 · ${formatDateTime(p.submittedAt)}`}</title>
            <circle className="pq-chart-halo" cx={p.x} cy={p.y} r="11" />
            <circle className="pq-chart-dot" cx={p.x} cy={p.y} r={selected ? 6 : 4.5} />
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text className="pq-chart-label" x={p.x} y={CHART.height - 8} textAnchor="middle">{shortDate(p.submittedAt)}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function PracticeHistoryOverlay({ fileId, onClose, onStartStationSet }: PracticeHistoryOverlayProps): React.JSX.Element {
  const file = usePracticeFile(fileId)
  const history = usePracticeAttemptHistory(fileId)
  const loadReview = usePracticeAttemptReview()
  const deleteAttempt = useDeletePracticeAttemptHistory(fileId)
  const createReviewSet = useCreatePracticeReviewSet(fileId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [review, setReview] = useState<PracticeAttemptReview | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PracticeAttemptSummary | null>(null)
  const [playingSetId, setPlayingSetId] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const playingRef = useRef<string | null>(null)
  const deletingRef = useRef<PracticeAttemptSummary | null>(null)
  selectedRef.current = selectedId
  playingRef.current = playingSetId
  deletingRef.current = deleting

  const items = useMemo(() => history.data ?? [], [history.data])

  const stats = useMemo(() => {
    if (items.length === 0) return null
    const total = items.reduce((sum, item) => sum + item.score, 0)
    return { count: items.length, average: total / items.length, best: Math.max(...items.map((i) => i.score)) }
  }, [items])

  // Chon luot moi nhat khi vao; neu luot dang chon bi xoa thi chon luot ke.
  useEffect(() => {
    if (history.isLoading) return
    if (items.length === 0) {
      setSelectedId(null)
      setReview(null)
      return
    }
    if (selectedId === null || !items.some((i) => i.attemptId === selectedId)) setSelectedId(items[0].attemptId)
  }, [items, history.isLoading, selectedId])

  // Tai chi tiet luot dang chon.
  useEffect(() => {
    if (selectedId === null) return
    setReview(null)
    setDetailError(null)
    const requested = selectedId
    loadReview.mutate(requested, {
      onSuccess: (data) => {
        if (selectedRef.current !== requested) return
        if (data) setReview(data)
        else setDetailError('Không tìm thấy dữ liệu lượt thi này.')
      },
      onError: (err) => {
        if (selectedRef.current === requested) setDetailError(errorText(err, 'Không tải được chi tiết lượt thi.'))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || playingRef.current !== null || deletingRef.current !== null) return
      if (event.defaultPrevented) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startSet = (id: string): void => {
    if (onStartStationSet) onStartStationSet(id)
    else setPlayingSetId(id)
  }

  const reviewWrong = (attemptId: string): void => {
    setError(null)
    createReviewSet.mutate(attemptId, {
      onSuccess: (set) => startSet(set.id),
      onError: (err) => setError(errorText(err, 'Không tạo được bộ ôn câu sai.'))
    })
  }

  const confirmDelete = (): void => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    deleteAttempt.mutate(target.attemptId, {
      onError: (err) => setError(errorText(err, 'Không xoá được lượt thi.'))
    })
  }

  const selectedSummary = items.find((i) => i.attemptId === selectedId) ?? null

  return (
    <>
      <PracticeOverlayFrame title="Lịch sử & ôn câu sai" subtitle={file.data?.name} onClose={onClose} bodyClassName="pq-body--flush">
        {history.isLoading ? (
          <div className="pq-loading"><span className="pq-spinner" aria-hidden="true" /> Đang tải lịch sử...</div>
        ) : items.length === 0 ? (
          <div className="pq-history-empty">
            <div className="pq-empty-card">
              <strong>Chưa có lượt thi nào được lưu</strong>
              <span>Lịch sử chỉ lưu các lượt Thi thử đã nộp bài. Lượt Luyện tập xem kết quả ngay sau khi làm xong.</span>
            </div>
          </div>
        ) : (
          <div className="pq-history">
            <aside className="pq-history-side" aria-label="Danh sách lượt thi">
              <section className="pq-panel">
                <h3>Điểm theo thời gian</h3>
                {stats && (
                  <ul className="pq-kpis">
                    <li><strong>{stats.count}</strong><span>lượt thi</span></li>
                    <li><strong>{formatScore(stats.average)}</strong><span>điểm trung bình</span></li>
                    <li><strong>{formatScore(stats.best)}</strong><span>cao nhất</span></li>
                  </ul>
                )}
                <ScoreChart history={items} selectedId={selectedId} onSelect={setSelectedId} />
              </section>
              <ul className="pq-attempt-list">
                {items.map((item) => {
                  const passed = isPassed(item.score)
                  return (
                    <li key={item.attemptId}>
                      <button type="button" className={`pq-attempt${item.attemptId === selectedId ? ' is-active' : ''}`}
                        aria-pressed={item.attemptId === selectedId} onClick={() => setSelectedId(item.attemptId)}>
                        <span className={`pq-attempt-score ${passed ? 'is-pass' : 'is-fail'}`}>{formatScore(item.score)}</span>
                        <span className="pq-attempt-main">
                          <strong>{item.stationSetName} · Lần {item.attemptNumber}</strong>
                          <span>{item.correctCount}/{item.totalCount} câu đúng · {formatDateTime(item.submittedAt)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            <section className="pq-history-detail" aria-label="Chi tiết lượt thi">
              {error && <p className="pq-error" role="alert">{error}</p>}
              {detailError && <p className="pq-error" role="alert">{detailError}</p>}
              {!review && !detailError && <div className="pq-loading"><span className="pq-spinner" aria-hidden="true" /> Đang tải chi tiết...</div>}
              {review && (
                <PracticeAttemptResultView
                  key={review.attemptId}
                  fileId={fileId}
                  review={review}
                  actions={
                    <>
                      {review.answers.some((a) => !a.isCorrect) && (
                        <button type="button" className="btn-primary" disabled={createReviewSet.isPending}
                          onClick={() => reviewWrong(review.attemptId)}>
                          {createReviewSet.isPending ? 'Đang tạo...' : 'Ôn câu sai'}
                        </button>
                      )}
                      <button type="button" className="btn-secondary pq-btn-danger-outline" disabled={selectedSummary === null}
                        onClick={() => selectedSummary && setDeleting(selectedSummary)}>
                        <Trash2 size={14} aria-hidden="true" /> Xoá lượt này
                      </button>
                    </>
                  }
                />
              )}
            </section>
          </div>
        )}
      </PracticeOverlayFrame>

      <ConfirmDialog
        open={deleting !== null}
        title="Xoá lượt thi này?"
        message={deleting ? `Lượt “${deleting.stationSetName} · Lần ${deleting.attemptNumber}” (${formatScore(deleting.score)}/10) sẽ bị xoá khỏi lịch sử.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      {playingSetId !== null && (
        <PracticePlayOverlay fileId={fileId} initialStationSetId={playingSetId} onClose={() => setPlayingSetId(null)} />
      )}
    </>
  )
}
