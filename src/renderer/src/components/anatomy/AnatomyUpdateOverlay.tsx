import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { usePageCount } from '@renderer/queries/attachmentView'
import {
  useCandidatesForPage,
  useConfirmCandidate,
  useCreateManualCandidate,
  useDeleteCandidate,
  useDetectAllPages,
  useCancelDetectAllPages,
  useDetectPage,
  useRejectCandidate,
  useUpdateCandidate,
  useUpdateQuestionAnswer
} from '@renderer/queries/anatomyQuiz'
import type { AnatomyLabelCandidate, Rect } from '@shared/types/anatomyQuiz'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import AnatomyPageReviewCanvas from './AnatomyPageReviewCanvas'

interface AnatomyUpdateOverlayProps {
  attachmentId: string
  lessonId: string
  onExit: () => void
}

type Scope = { type: 'page'; pageNumber: number } | { type: 'document' }
type Phase = 'scope-select' | 'filling' | 'editingRegions' | 'done'
// Cach vao 1 trang quyet dinh vi tri dung: 'sweep' (di toi tu nhien / nhay
// trang) tu dong bo qua trang khong co gi can lam va chay tiep; 'jump' (nhay
// toi 1 so trang cu the) khong bo qua, dung lai dung trang do; 'back' (lui
// lai trang truoc) luon dat o dau danh sach, khong tu do/bo qua gi ca.
type EntryStyle = 'sweep' | 'jump' | 'back'

function sortByReadingOrder(list: AnatomyLabelCandidate[]): AnatomyLabelCandidate[] {
  return [...list].sort((a, b) => {
    if (Math.abs(a.labelBox.y0 - b.labelBox.y0) > 4) return a.labelBox.y0 - b.labelBox.y0
    return a.labelBox.x0 - b.labelBox.x0
  })
}

function AnatomyUpdateOverlay({ attachmentId, lessonId, onExit }: AnatomyUpdateOverlayProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('scope-select')
  const [scope, setScope] = useState<Scope | null>(null)
  const [scopePageInput, setScopePageInput] = useState('1')
  const [currentPageNumber, setCurrentPageNumber] = useState(1)
  const [currentRegionIndex, setCurrentRegionIndex] = useState(0)
  const [answerText, setAnswerText] = useState('')
  const [alternatesText, setAlternatesText] = useState('')
  const [emptyPageMessage, setEmptyPageMessage] = useState<string | null>(null)
  const [jumpPageInput, setJumpPageInput] = useState('')
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)
  const [pendingDeleteCandidateId, setPendingDeleteCandidateId] = useState<string | null>(null)
  const [bulkDetectProgress, setBulkDetectProgress] = useState<{
    pageNumber: number
    totalPages: number
  } | null>(null)
  const [pageReviewed, setPageReviewed] = useState(false)
  const [pageExcluded, setPageExcluded] = useState(false)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [editTool, setEditTool] = useState<'select' | 'add' | 'crop'>('select')
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [regionFilter, setRegionFilter] = useState<'all' | AnatomyLabelCandidate['status'] | 'low'>('all')
  const [previewRegion, setPreviewRegion] = useState(false)

  useEffect(() => {
    return window.api.anatomy.onDetectAllPagesProgress((p) => setBulkDetectProgress(p))
  }, [])

  const detectAllPages = useDetectAllPages(attachmentId)
  const cancelDetectAllPages = useCancelDetectAllPages()
  const autoScanStarted = useRef(false)

  useEffect(() => {
    if (autoScanStarted.current) return
    autoScanStarted.current = true
    detectAllPages.mutate(false)
  }, [attachmentId])

  useEffect(() => {
    void window.api.anatomy.getPageReview({ attachmentId, pageNumber: currentPageNumber }).then((value) => {
      setPageReviewed(value.reviewed)
      setPageExcluded(value.excluded)
    })
  }, [attachmentId, currentPageNumber])

  const pageCount = usePageCount(attachmentId, scope?.type === 'document')
  const totalPages = pageCount.data ?? 0

  const candidatesQuery = useCandidatesForPage(attachmentId, currentPageNumber, phase !== 'scope-select')
  const detectPage = useDetectPage(attachmentId, currentPageNumber)
  const createManualCandidate = useCreateManualCandidate(attachmentId, currentPageNumber)
  const confirmCandidate = useConfirmCandidate(attachmentId, currentPageNumber)
  const updateQuestionAnswer = useUpdateQuestionAnswer(attachmentId, currentPageNumber)
  const rejectCandidate = useRejectCandidate(attachmentId, currentPageNumber)
  const deleteCandidate = useDeleteCandidate(attachmentId, currentPageNumber)
  const updateCandidate = useUpdateCandidate(attachmentId, currentPageNumber)

  const sortedList = useMemo(() => sortByReadingOrder(candidatesQuery.data ?? []), [candidatesQuery.data])
  const current = sortedList[currentRegionIndex] ?? null

  // Cac trang da tung thu do trong luot nay - tranh goi detectPage lap lai
  // moi ket qua van la 0 (trang thuc su trong/khong lien quan).
  const triedDetectRef = useRef<Set<number>>(new Set())
  // Trang da "an dinh vi tri" xong (khong can tinh lai moi lan refetch do
  // Luu/Bo qua gay ra) - key: pageNumber, value: EntryStyle da dung.
  const positionedPageRef = useRef<number | null>(null)
  const pendingEntryStyleRef = useRef<EntryStyle>('sweep')

  const confirmedCount = sortedList.filter((c) => c.status === 'confirmed').length
  const rejectedCount = sortedList.filter((c) => c.status === 'rejected').length

  useEffect(() => {
    setAnswerText(current?.status === 'confirmed' ? current.answerText ?? '' : current?.rawText.trim() ?? '')
    setAlternatesText(
      current?.status === 'confirmed' && current.acceptedAlternates
        ? current.acceptedAlternates.join('; ')
        : ''
    )
  }, [current?.id])

  const goToPage = (pageNumber: number, style: EntryStyle): void => {
    pendingEntryStyleRef.current = style
    positionedPageRef.current = null
    setEmptyPageMessage(null)
    setCurrentPageNumber(pageNumber)
  }

  // Dat vi tri khi vua vao 1 trang (moi lan currentPageNumber doi, hoac lan
  // dau vao 'filling') - KHONG chay lai khi candidates refetch vi Luu/Bo qua
  // tren cung 1 trang (positionedPageRef chan).
  useEffect(() => {
    if (phase !== 'filling') return
    if (positionedPageRef.current === currentPageNumber) return
    if (candidatesQuery.isLoading || candidatesQuery.isFetching) return

    const style = pendingEntryStyleRef.current
    const list = sortedList

    if (list.length === 0) {
      if (!triedDetectRef.current.has(currentPageNumber) && !detectPage.isPending) {
        triedDetectRef.current.add(currentPageNumber)
        detectPage.mutate()
        return
      }
      // Da thu do, van 0 vung -> trang nay khong lien quan.
      positionedPageRef.current = currentPageNumber
      if (style === 'sweep') {
        setEmptyPageMessage('Trang này không có vùng nào.')
      } else {
        setCurrentRegionIndex(0)
      }
      return
    }

    positionedPageRef.current = currentPageNumber
    // Khi nguoi dung chu dong mo/nhay/lui ve mot trang de SUA, bat dau tu
    // vung dau tien de dap an cu duoc hien ngay. Chi luong quet lien tuc
    // (sweep) moi uu tien vung pending chua xu ly.
    if (style === 'jump' || style === 'back') {
      setCurrentRegionIndex(0)
      return
    }

    const firstPending = list.findIndex((c) => c.status === 'pending')
    if (firstPending !== -1) {
      setCurrentRegionIndex(firstPending)
      return
    }

    // Khong con vung pending nao tren trang nay.
    if (style === 'sweep') {
      setEmptyPageMessage('Trang này đã xong hết.')
    } else {
      setCurrentRegionIndex(0)
    }
  }, [phase, currentPageNumber, sortedList, candidatesQuery.isLoading, candidatesQuery.isFetching, detectPage])

  // Tu chuyen tiep sau khi bao "khong co vung/da xong" (che do sweep).
  useEffect(() => {
    if (!emptyPageMessage) return
    const t = setTimeout(() => {
      setEmptyPageMessage(null)
      if (scope?.type === 'document' && currentPageNumber < totalPages) {
        goToPage(currentPageNumber + 1, 'sweep')
      } else {
        setPhase('done')
      }
    }, 900)
    return () => clearTimeout(t)
  }, [emptyPageMessage])

  const startScope = (nextScope: Scope): void => {
    setScope(nextScope)
    setPhase('filling')
    triedDetectRef.current = new Set()
    goToPage(nextScope.type === 'page' ? nextScope.pageNumber : 1, 'jump')
  }

  const goNext = (): void => {
    if (currentRegionIndex < sortedList.length - 1) {
      setCurrentRegionIndex((i) => i + 1)
      return
    }
    if (scope?.type === 'document' && currentPageNumber < totalPages) {
      goToPage(currentPageNumber + 1, 'sweep')
      return
    }
    setPhase('done')
  }

  const goPrev = (): void => {
    if (currentRegionIndex > 0) {
      setCurrentRegionIndex((i) => i - 1)
      return
    }
    if (scope?.type === 'document' && currentPageNumber > 1) {
      goToPage(currentPageNumber - 1, 'back')
    }
  }

  const handleSkipPage = (): void => {
    if (scope?.type === 'document' && currentPageNumber < totalPages) {
      goToPage(currentPageNumber + 1, 'sweep')
    } else {
      setPhase('done')
    }
  }

  const handleJumpToPage = (): void => {
    const n = Number(jumpPageInput)
    if (!Number.isFinite(n) || n < 1 || n > totalPages) return
    goToPage(n, 'jump')
    setJumpPageInput('')
  }

  const handleSave = (): void => {
    if (!current || answerText.trim() === '') return
    const acceptedAlternates = alternatesText
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    if (current.status === 'confirmed') {
      updateQuestionAnswer.mutate({ candidateId: current.id, answerText: answerText.trim(), acceptedAlternates })
    } else {
      confirmCandidate.mutate({
        candidateId: current.id,
        lessonId,
        answerText: answerText.trim(),
        acceptedAlternates
      })
    }
  }

  const doSkip = (): void => {
    if (!current) return
    rejectCandidate.mutate(current.id)
    setConfirmRejectOpen(false)
  }

  const handleSkipClick = (): void => {
    if (!current) return
    if (current.status === 'confirmed') {
      setConfirmRejectOpen(true)
    } else {
      doSkip()
    }
  }

  const handleDrawNewBox = (box: Rect, refWidth: number, refHeight: number): void => {
    createManualCandidate.mutate({ attachmentId, pageNumber: currentPageNumber, rawText: '', labelBox: box, refWidth, refHeight })
  }

  const closeEditingRegions = (): void => {
    setPhase('filling')
    positionedPageRef.current = null
    pendingEntryStyleRef.current = 'jump'
  }

  const saving = confirmCandidate.isPending || updateQuestionAnswer.isPending

  if (phase === 'scope-select') {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <div className="lms-quiz">
          <header className="lms-quiz-header">
            <div className="lms-quiz-header-main">
              <div className="lms-quiz-titlewrap">
                <h2 className="lms-quiz-title">Cập nhật câu hỏi GP</h2>
              </div>
            </div>
            <div className="lms-quiz-header-side">
              <button type="button" className="btn-secondary" onClick={onExit}>
                <X size={14} /> Thoát
              </button>
            </div>
          </header>
          <div className="lms-quiz-body">
            <main className="lms-quiz-main">
              <div className="anatomy-scope-select">
                <p>Chọn phạm vi muốn cập nhật đáp án:</p>
                <div className="anatomy-scope-option">
                  <label>
                    Trang cụ thể:
                    <input
                      type="number"
                      min={1}
                      value={scopePageInput}
                      onChange={(e) => setScopePageInput(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => startScope({ type: 'page', pageNumber: Math.max(1, Number(scopePageInput) || 1) })}
                  >
                    Bắt đầu ở trang này
                  </button>
                </div>
                <div className="anatomy-scope-option">
                  <button type="button" className="btn-primary" onClick={() => startScope({ type: 'document' })}>
                    Toàn bộ tài liệu (từ trang đầu tới cuối)
                  </button>
                </div>
                <div className="anatomy-scope-option">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={detectAllPages.isPending}
                    onClick={() => {
                      setBulkDetectProgress(null)
                      detectAllPages.mutate(true)
                    }}
                  >
                    Dò trước vị trí vùng chữ cho toàn bộ tài liệu
                  </button>
                  {detectAllPages.isPending && (
                    <div className="anatomy-candidate-empty">
                      {bulkDetectProgress
                        ? `Đang quét ${((bulkDetectProgress.pageNumber / bulkDetectProgress.totalPages) * 100).toFixed(3)}%`
                        : 'Đang bắt đầu...'}
                      <button type="button" className="btn-secondary" onClick={() => cancelDetectAllPages.mutate(attachmentId)}>
                        Dừng quét
                      </button>
                    </div>
                  )}
                  {!detectAllPages.isPending && detectAllPages.isSuccess && (
                    <p className="anatomy-candidate-empty">
                      {detectAllPages.data.cancelled
                        ? 'Đã dừng. Bấm quét lại để tiếp tục từ trang kế tiếp.'
                        : `Đã dò xong ${detectAllPages.data.totalPages} trang.`}
                    </p>
                  )}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <div className="lms-quiz">
          <header className="lms-quiz-header">
            <div className="lms-quiz-titlewrap">
              <h2 className="lms-quiz-title">Cập nhật câu hỏi GP</h2>
            </div>
          </header>
          <div className="lms-quiz-body">
            <main className="lms-quiz-main">
              <div className="anatomy-scope-select">
                <p>
                  <strong>Hoàn tất.</strong> Trang {currentPageNumber}: {confirmedCount} vùng đã xác nhận,{' '}
                  {rejectedCount} vùng đã bỏ qua.
                </p>
                <div className="lms-quiz-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (!scope) return
                      goToPage(scope.type === 'page' ? scope.pageNumber : 1, 'jump')
                      setPhase('filling')
                    }}
                  >
                    Duyệt lại từ đầu
                  </button>
                  <button type="button" className="btn-primary" onClick={onExit}>
                    Thoát
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'editingRegions') {
    const selectedRegion = sortedList.find((candidate) => candidate.id === selectedRegionId) ?? null
    const visibleRegions = sortedList.filter((candidate) => regionFilter === 'all' ||
      (regionFilter === 'low' ? candidate.confidence !== null && candidate.confidence < 0.75 : candidate.status === regionFilter))
    return (
      <div className="quiz-play-overlay" role="dialog" aria-modal="true">
        <div className="lms-quiz">
          <header className="lms-quiz-header">
            <div className="lms-quiz-titlewrap">
              <h2 className="lms-quiz-title">Sửa vùng — trang {currentPageNumber}</h2>
            </div>
            <div className="lms-quiz-header-side">
              <button type="button" className="btn-primary" onClick={closeEditingRegions}>
                Xong, quay lại điền
              </button>
            </div>
          </header>
          <div className="lms-quiz-body">
            <main className="lms-quiz-main anatomy-authoring-main">
              <div className="anatomy-region-editor">
                <div className="anatomy-region-tools">
                  <select value={regionFilter} onChange={(event) => {
                    setRegionFilter(event.target.value as typeof regionFilter); setSelectedRegionId(null); setPreviewRegion(false)
                  }}>
                    <option value="all">Tất cả vùng</option><option value="pending">Chưa duyệt</option>
                    <option value="confirmed">Đã có đáp án</option><option value="rejected">Đã bỏ qua</option>
                    <option value="low">Độ tin cậy thấp</option>
                  </select>
                  <button type="button" className={previewRegion ? 'btn-primary' : 'btn-secondary'} disabled={!selectedRegion}
                    onClick={() => setPreviewRegion((value) => !value)}>Xem thử câu hỏi</button>
                  <button type="button" className={editTool === 'select' ? 'btn-primary' : 'btn-secondary'} onClick={() => setEditTool('select')}>Chọn / di chuyển / đổi cỡ</button>
                  <button type="button" className={editTool === 'add' ? 'btn-primary' : 'btn-secondary'} onClick={() => setEditTool('add')}>Vẽ vùng chữ mới</button>
                  <button type="button" className={editTool === 'crop' ? 'btn-primary' : 'btn-secondary'} disabled={!selectedRegion} onClick={() => setEditTool('crop')}>Vẽ vùng crop cho câu</button>
                  <button type="button" className="btn-secondary" disabled={!selectedRegion?.cropBox} onClick={() => selectedRegion && updateCandidate.mutate({ candidateId: selectedRegion.id, cropBox: null })}>Bỏ crop</button>
                  <button type="button" className="btn-secondary" disabled={!selectedRegion} onClick={() => setEditTool('add')} title="Vẽ thêm một vùng mới, sau đó thu nhỏ vùng cũ thành phần còn lại">Tách vùng</button>
                  <select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} disabled={!selectedRegion}>
                    <option value="">Chọn vùng để gộp…</option>
                    {sortedList.filter((candidate) => candidate.id !== selectedRegionId).map((candidate) =>
                      <option key={candidate.id} value={candidate.id}>{candidate.rawText || `Vùng ${candidate.id.slice(0, 6)}`}</option>)}
                  </select>
                  <button type="button" className="btn-secondary" disabled={!selectedRegion || !mergeTargetId} onClick={() => {
                    const other = sortedList.find((candidate) => candidate.id === mergeTargetId)
                    if (!selectedRegion || !other) return
                    updateCandidate.mutate({
                      candidateId: selectedRegion.id,
                      rawText: `${selectedRegion.rawText} ${other.rawText}`.trim(),
                      labelBox: {
                        x0: Math.min(selectedRegion.labelBox.x0, other.labelBox.x0),
                        y0: Math.min(selectedRegion.labelBox.y0, other.labelBox.y0),
                        x1: Math.max(selectedRegion.labelBox.x1, other.labelBox.x1),
                        y1: Math.max(selectedRegion.labelBox.y1, other.labelBox.y1)
                      }
                    }, { onSuccess: () => deleteCandidate.mutate(other.id) })
                    setMergeTargetId('')
                  }}>Gộp</button>
                  <button type="button" className="btn-danger" disabled={!selectedRegion} onClick={() => {
                    if (!selectedRegion) return
                    if (selectedRegion.status === 'confirmed') setPendingDeleteCandidateId(selectedRegion.id)
                    else deleteCandidate.mutate(selectedRegion.id)
                  }}>Xóa vùng</button>
                </div>
                <AnatomyPageReviewCanvas
                  attachmentId={attachmentId}
                  pageNumber={currentPageNumber}
                  candidates={previewRegion ? sortedList : visibleRegions}
                  mode={previewRegion ? 'preview' : 'edit'}
                  editTool={editTool}
                  currentCandidateId={selectedRegionId}
                  selectedId={selectedRegionId}
                  onDrawNewBox={handleDrawNewBox}
                  onSelect={setSelectedRegionId}
                  onUpdateBox={(candidateId, labelBox) => updateCandidate.mutate({ candidateId, labelBox })}
                  onSetCrop={(cropBox) => selectedRegion && updateCandidate.mutate({ candidateId: selectedRegion.id, cropBox })}
                />
              </div>
            </main>
          </div>
        </div>

        <ConfirmDialog
          open={pendingDeleteCandidateId !== null}
          title="Xoá ô này?"
          message="Ô này đang có đáp án đã lưu - xoá sẽ mất luôn đáp án đó."
          confirmLabel="Xoá"
          cancelLabel="Huỷ"
          onCancel={() => setPendingDeleteCandidateId(null)}
          onConfirm={() => {
            if (pendingDeleteCandidateId) deleteCandidate.mutate(pendingDeleteCandidateId)
            setPendingDeleteCandidateId(null)
          }}
        />
      </div>
    )
  }

  // phase === 'filling'
  return (
    <div className="quiz-play-overlay" role="dialog" aria-modal="true">
      <div className="lms-quiz">
        <header className="lms-quiz-header">
          <div className="lms-quiz-header-main">
            <div className="lms-quiz-titlewrap">
              <h2 className="lms-quiz-title">Cập nhật câu hỏi GP</h2>
              <span className="lms-quiz-mode-chip">
                Trang {currentPageNumber}
                {scope?.type === 'document' ? ` / ${totalPages}` : ''} · Vùng{' '}
                {sortedList.length === 0 ? 0 : currentRegionIndex + 1}/{sortedList.length}
              </span>
            </div>
          </div>
          <div className="lms-quiz-header-side">
            {scope?.type === 'document' && (
              <div className="anatomy-page-nav">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  placeholder="Tới trang..."
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  style={{ width: '5.5rem' }}
                />
                <button type="button" className="btn-secondary" onClick={handleJumpToPage}>
                  Nhảy
                </button>
                <button type="button" className="btn-secondary" onClick={handleSkipPage}>
                  Bỏ qua cả trang này
                </button>
              </div>
            )}
            <button type="button" className="btn-secondary" onClick={() => setPhase('editingRegions')}>
              Sửa vùng trên trang này
            </button>
            <button type="button" className={pageReviewed ? 'btn-primary' : 'btn-secondary'} onClick={() => {
              const next = !pageReviewed
              setPageReviewed(next)
              void window.api.anatomy.setPageReview({ attachmentId, pageNumber: currentPageNumber, reviewed: next })
            }}>
              {pageReviewed ? 'Đã duyệt đầy đủ' : 'Đánh dấu đã duyệt'}
            </button>
            <button type="button" className={pageExcluded ? 'btn-danger' : 'btn-secondary'} onClick={() => {
              const next = !pageExcluded
              setPageExcluded(next)
              void window.api.anatomy.setPageReview({ attachmentId, pageNumber: currentPageNumber, excluded: next })
            }}>
              {pageExcluded ? 'Đang loại khỏi đề' : 'Loại trang khỏi đề'}
            </button>
            <button type="button" className="btn-secondary" onClick={onExit}>
              <X size={14} /> Thoát
            </button>
          </div>
        </header>

        <div className="lms-quiz-body">
          <main className="lms-quiz-main anatomy-authoring-main">
            {emptyPageMessage ? (
              <p className="anatomy-candidate-empty">{emptyPageMessage}</p>
            ) : detectPage.isPending ? (
              <p className="anatomy-candidate-empty">Đang dò trang...</p>
            ) : current ? (
              <div className="anatomy-fill-panel">
                <AnatomyPageReviewCanvas
                  attachmentId={attachmentId}
                  pageNumber={currentPageNumber}
                  candidates={sortedList}
                  mode="fill"
                  currentCandidateId={current.id}
                />
                <div className="anatomy-candidate-form">
                  <label>
                    Đáp án đúng
                    <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
                  </label>
                  <label>
                    Đáp án chấp nhận được khác (ngăn bằng dấu ;)
                    <input
                      type="text"
                      value={alternatesText}
                      placeholder="vd: xoang thận; bể thận đoạn trên"
                      onChange={(e) => setAlternatesText(e.target.value)}
                    />
                  </label>
                  <div className="anatomy-candidate-actions">
                    <button type="button" className="btn-secondary" onClick={goPrev}>
                      Vùng trước
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleSkipClick}>
                      Bỏ qua vùng này
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving || answerText.trim() === ''}
                      onClick={handleSave}
                    >
                      Lưu đáp án
                    </button>
                    <button type="button" className="btn-secondary" onClick={goNext}>
                      Tiếp theo
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="anatomy-candidate-empty">Đang tải...</p>
            )}
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRejectOpen}
        title="Bỏ qua vùng này?"
        message="Vùng này đang có đáp án đã lưu - bỏ qua sẽ xoá luôn đáp án đó."
        confirmLabel="Bỏ qua"
        cancelLabel="Huỷ"
        onCancel={() => setConfirmRejectOpen(false)}
        onConfirm={doSkip}
      />
    </div>
  )
}

export default AnatomyUpdateOverlay
