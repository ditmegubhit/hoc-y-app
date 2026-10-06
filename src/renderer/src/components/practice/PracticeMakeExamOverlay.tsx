import { useEffect, useMemo, useRef, useState } from 'react'
import { Dices, Play, Trash2 } from 'lucide-react'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  useCreatePracticeStationSet,
  useDeletePracticeStationSet,
  usePickRandomPracticeQuestions,
  usePracticeFile,
  usePracticeQuestionSummaries,
  usePracticeStationSets
} from '@renderer/queries/practice'
import {
  effectiveSelection,
  errorText,
  groupQuestionsByPage,
  questionsInRange,
  validateTimeLimit
} from '@shared/practice/quizLogic'
import type { PracticeFeedbackMode, PracticeStationSet } from '@shared/types/practice'
import PracticePlayOverlay from './PracticePlayOverlay'
import { PracticeOverlayFrame } from './PracticeQuestionCard'
import './practiceQuiz.css'

export interface PracticeMakeExamOverlayProps {
  fileId: string
  onClose: () => void
  /**
   * Tuy chon: nhan id de vua tao / de da luu de lam ngay. Neu khong truyen, overlay tu mo
   * PracticePlayOverlay ben trong (initialStationSetId) roi quay lai man nay khi dong.
   */
  onStartStationSet?: (stationSetId: string) => void
}

const TIME_PRESETS = [15, 30, 45, 60]

function parsePage(text: string): number | null {
  const value = Number.parseInt(text, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

function describeSet(set: PracticeStationSet): string {
  const time = set.timeLimitSeconds === 0 ? 'không giới hạn' : `${set.timeLimitSeconds} giây/câu`
  return `${set.questionCount} câu · ${time}`
}

export default function PracticeMakeExamOverlay({ fileId, onClose, onStartStationSet }: PracticeMakeExamOverlayProps): React.JSX.Element {
  const file = usePracticeFile(fileId)
  const summaries = usePracticeQuestionSummaries(fileId)
  const sets = usePracticeStationSets(fileId)
  const createSet = useCreatePracticeStationSet(fileId)
  const deleteSet = useDeletePracticeStationSet(fileId)
  const pickRandom = usePickRandomPracticeQuestions()

  const [name, setName] = useState('')
  const [mode, setMode] = useState<PracticeFeedbackMode>('practice')
  const [timeText, setTimeText] = useState('30')
  const [useRange, setUseRange] = useState(false)
  const [fromText, setFromText] = useState('1')
  const [toText, setToText] = useState('')
  const [randomText, setRandomText] = useState('10')
  const [manual, setManual] = useState<Set<string> | null>(null) // null = tat ca cau trong khoang
  const [created, setCreated] = useState<PracticeStationSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PracticeStationSet | null>(null)
  const [playingSetId, setPlayingSetId] = useState<string | null>(null)
  const playingRef = useRef<string | null>(null)
  const deletingRef = useRef<PracticeStationSet | null>(null)
  playingRef.current = playingSetId
  deletingRef.current = deleting

  const all = useMemo(() => summaries.data ?? [], [summaries.data])
  const maxPage = useMemo(() => all.reduce((max, q) => Math.max(max, q.pageNumber), 0), [all])
  const fromPage = useRange ? parsePage(fromText) ?? 1 : null
  const toPage = useRange ? parsePage(toText) : null
  const rangeInvalid = useRange && fromPage !== null && toPage !== null && fromPage > toPage
  const visible = useMemo(() => questionsInRange(all, fromPage, toPage), [all, fromPage, toPage])
  const groups = useMemo(() => groupQuestionsByPage(visible), [visible])
  const chosen = useMemo(() => effectiveSelection(all, fromPage, toPage, manual), [all, fromPage, toPage, manual])
  const chosenIds = useMemo(() => new Set(chosen.map((q) => q.id)), [chosen])

  const timeSeconds = Number(timeText.trim() === '' ? Number.NaN : timeText)
  const timeError = validateTimeLimit(mode, timeSeconds)
  const canCreate = chosen.length > 0 && timeError === null && !rangeInvalid && !createSet.isPending

  // Esc dong overlay (tru khi dang mo hop thoai xoa hoac dang lam bai ben trong).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || playingRef.current !== null || deletingRef.current !== null) return
      if (event.defaultPrevented) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const changeRange = (next: { use?: boolean; from?: string; to?: string }): void => {
    if (next.use !== undefined) setUseRange(next.use)
    if (next.from !== undefined) setFromText(next.from)
    if (next.to !== undefined) setToText(next.to)
    setManual(null) // doi khoang trang thi chon lai tat ca cau trong khoang
  }

  const toggleQuestion = (id: string): void => {
    const next = new Set(chosenIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setManual(next)
  }

  const togglePage = (pageIds: string[], allChecked: boolean): void => {
    const next = new Set(chosenIds)
    for (const id of pageIds) {
      if (allChecked) next.delete(id)
      else next.add(id)
    }
    setManual(next)
  }

  const randomCount = Math.max(1, Number.parseInt(randomText, 10) || 1)
  const runRandom = (): void => {
    setError(null)
    pickRandom.mutate(
      { fileId, count: Math.min(randomCount, Math.max(1, visible.length)), fromPage: fromPage ?? 1, toPage: toPage ?? Math.max(1, maxPage) },
      {
        onSuccess: (ids) => setManual(new Set(ids)),
        onError: (err) => setError(errorText(err, 'Không chọn ngẫu nhiên được.'))
      }
    )
  }

  const startSet = (id: string): void => {
    if (onStartStationSet) onStartStationSet(id)
    else setPlayingSetId(id)
  }

  const submit = (): void => {
    if (!canCreate) return
    setError(null)
    createSet.mutate(
      {
        name: name.trim(),
        feedbackMode: mode,
        timeLimitSeconds: timeSeconds,
        regionIds: chosen.map((q) => q.id)
      },
      {
        onSuccess: (set) => {
          setCreated(set)
          setName('')
        },
        onError: (err) => setError(errorText(err, 'Không tạo được bài thi.'))
      }
    )
  }

  const switchMode = (value: PracticeFeedbackMode): void => {
    setMode(value)
    if (value === 'exam' && (timeText.trim() === '' || Number(timeText) < 1)) setTimeText('30')
  }

  const confirmDelete = (): void => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    deleteSet.mutate(target.id, {
      onSuccess: () => setCreated((old) => (old?.id === target.id ? null : old)),
      onError: (err) => setError(errorText(err, 'Không xoá được đề.'))
    })
  }

  const stateAllSelected = visible.length > 0 && chosen.length === visible.length

  return (
    <>
      <PracticeOverlayFrame title="Tạo bài thi" subtitle={file.data?.name} onClose={onClose} bodyClassName="pq-body--flush">
        <div className="pq-make">
          {/* ----- Cot 1: thiet lap ----- */}
          <section className="pq-panel pq-make-setup" aria-label="Thiết lập đề">
            <h3>Thiết lập</h3>

            <label className="pq-field">
              <span>Tên đề</span>
              <input type="text" value={name} maxLength={200} placeholder="Để trống = tự đặt tên “Đề N”"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
            </label>

            <div className="pq-field">
              <span>Chế độ</span>
              <div className="pq-mode-grid">
                {(['practice', 'exam'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={mode === value}
                    className={`pq-mode-card${mode === value ? ' is-active' : ''}`} onClick={() => switchMode(value)}>
                    <strong>{value === 'practice' ? 'Luyện tập' : 'Thi thử'}</strong>
                    <span>{value === 'practice' ? 'Chấm và hiện đáp án ngay sau mỗi câu.' : 'Khóa đáp án, chỉ biết kết quả khi nộp bài.'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pq-field">
              <span>Thời gian mỗi câu (giây)</span>
              <div className="pq-inline">
                <input type="number" min={mode === 'exam' ? 1 : 0} max={300} step={1} value={timeText}
                  aria-invalid={timeError !== null} onChange={(e) => setTimeText(e.target.value)} />
                <div className="pq-presets">
                  {mode === 'practice' && (
                    <button type="button" className={`pq-preset${timeText === '0' ? ' is-active' : ''}`} onClick={() => setTimeText('0')}>
                      Không giới hạn
                    </button>
                  )}
                  {TIME_PRESETS.map((value) => (
                    <button key={value} type="button" className={`pq-preset${timeText === String(value) ? ' is-active' : ''}`}
                      onClick={() => setTimeText(String(value))}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {timeError ? <small className="pq-field-error">{timeError}</small>
                : mode === 'practice' && timeText === '0' ? <small className="pq-hint">Không giới hạn thời gian.</small>
                  : mode === 'exam' ? <small className="pq-hint">Thi thử tự chuyển câu khi hết giờ (1–300 giây).</small> : null}
            </div>

            <div className="pq-field">
              <span>Phạm vi</span>
              <div className="pq-radio-row" role="radiogroup" aria-label="Phạm vi trang">
                <label><input type="radio" name="pq-scope" checked={!useRange} onChange={() => changeRange({ use: false })} /> Tất cả trang</label>
                <label><input type="radio" name="pq-scope" checked={useRange} onChange={() => changeRange({ use: true })} /> Khoảng trang</label>
              </div>
              {useRange && (
                <div className="pq-inline pq-range">
                  <label>Từ <input type="number" min={1} value={fromText} onChange={(e) => changeRange({ from: e.target.value })} /></label>
                  <label>đến <input type="number" min={1} value={toText} placeholder={maxPage > 0 ? String(maxPage) : ''}
                    onChange={(e) => changeRange({ to: e.target.value })} /></label>
                </div>
              )}
              {rangeInvalid && <small className="pq-field-error">Trang bắt đầu đang lớn hơn trang kết thúc.</small>}
            </div>

            <div className="pq-field">
              <span>Ngẫu nhiên (tuỳ chọn)</span>
              <div className="pq-inline">
                <input type="number" min={1} value={randomText} aria-label="Số câu ngẫu nhiên" onChange={(e) => setRandomText(e.target.value)} />
                <button type="button" className="btn-secondary" disabled={visible.length === 0 || rangeInvalid || pickRandom.isPending} onClick={runRandom}>
                  <Dices size={14} aria-hidden="true" /> Bốc {randomCount} câu
                </button>
              </div>
              <small className="pq-hint">Bốc ngẫu nhiên trong phạm vi trên; sau đó vẫn tick/bỏ tick tay được.</small>
            </div>

            {error && <p className="pq-error" role="alert">{error}</p>}

            <div className="pq-make-submit">
              <p className="pq-count"><strong>{chosen.length}</strong> / {all.length} câu được chọn</p>
              <button type="button" className="btn-primary" disabled={!canCreate} onClick={submit}>
                {createSet.isPending ? 'Đang tạo...' : 'Tạo bài thi'}
              </button>
            </div>

            {created && (
              <div className="pq-created" role="status" aria-live="polite">
                <div>
                  <strong>Đã tạo “{created.name}”</strong>
                  <span>{created.feedbackMode === 'exam' ? 'Thi thử' : 'Luyện tập'} · {describeSet(created)}</span>
                </div>
                <button type="button" className="btn-primary" onClick={() => startSet(created.id)}>
                  <Play size={14} aria-hidden="true" /> Làm bài ngay
                </button>
              </div>
            )}
          </section>

          {/* ----- Cot 2: chon cau ----- */}
          <section className="pq-panel pq-make-questions" aria-label="Chọn câu">
            <div className="pq-panel-head">
              <h3>Chọn câu <small>({chosen.length}/{visible.length} trong phạm vi)</small></h3>
              <div className="pq-panel-tools">
                <button type="button" className="btn-secondary" disabled={visible.length === 0 || stateAllSelected}
                  onClick={() => setManual(null)}>Chọn hết</button>
                <button type="button" className="btn-secondary" disabled={chosen.length === 0}
                  onClick={() => setManual(new Set())}>Bỏ chọn hết</button>
              </div>
            </div>
            <div className="pq-question-scroll">
              {summaries.isLoading && <p className="pq-empty">Đang tải danh sách câu...</p>}
              {!summaries.isLoading && all.length === 0 && (
                <div className="pq-empty-card">
                  <strong>File này chưa có câu nào được xác nhận</strong>
                  <span>Hãy “Tạo đáp án” hoặc “Sửa đáp án” để xác nhận các vùng, rồi quay lại tạo bài thi.</span>
                </div>
              )}
              {!summaries.isLoading && all.length > 0 && visible.length === 0 && (
                <p className="pq-empty">Không có câu nào trong khoảng trang này.</p>
              )}
              {groups.map((group) => {
                const ids = group.questions.map((q) => q.id)
                const checkedCount = ids.filter((id) => chosenIds.has(id)).length
                const allChecked = checkedCount === ids.length
                return (
                  <div key={group.pageNumber} className="pq-page-group">
                    <label className="pq-page-head">
                      <input type="checkbox" checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !allChecked }}
                        onChange={() => togglePage(ids, allChecked)} />
                      <strong>Trang {group.pageNumber}</strong>
                      <span>{checkedCount}/{ids.length} câu</span>
                    </label>
                    <div className="pq-question-grid">
                      {group.questions.map((q) => (
                        <label key={q.id} className={`pq-question-choice${chosenIds.has(q.id) ? ' is-checked' : ''}`} title={q.answerText}>
                          <input type="checkbox" checked={chosenIds.has(q.id)} onChange={() => toggleQuestion(q.id)} />
                          <span>{q.answerText}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ----- Cot 3: de da tao ----- */}
          <section className="pq-panel pq-make-sets" aria-label="Đề đã tạo">
            <h3>Đề đã tạo <small>({(sets.data ?? []).length})</small></h3>
            <div className="pq-question-scroll">
              {sets.isLoading && <p className="pq-empty">Đang tải...</p>}
              {!sets.isLoading && (sets.data ?? []).length === 0 && <p className="pq-empty">Chưa có đề nào cho file này.</p>}
              <ul className="pq-saved-list">
                {(sets.data ?? []).map((set) => (
                  <li key={set.id} className="pq-saved">
                    <div className="pq-saved-main">
                      <strong title={set.name}>{set.name}</strong>
                      <span>
                        {set.feedbackMode === 'exam' ? 'Thi thử' : 'Luyện tập'}{set.isReviewSet ? ' · Ôn câu sai' : ''} · {describeSet(set)}
                      </span>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => startSet(set.id)}>
                      <Play size={13} aria-hidden="true" /> Làm
                    </button>
                    <button type="button" className="pq-icon-btn" aria-label={`Xoá đề ${set.name}`} title="Xoá đề" onClick={() => setDeleting(set)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </PracticeOverlayFrame>

      <ConfirmDialog
        open={deleting !== null}
        title="Xoá đề này?"
        message={deleting ? `Đề “${deleting.name}” sẽ bị xoá. Lịch sử các lượt đã thi của đề vẫn được giữ.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      {playingSetId !== null && (
        <PracticePlayOverlay fileId={fileId} initialStationSetId={playingSetId} onClose={() => setPlayingSetId(null)} />
      )}
    </>
  )
}
