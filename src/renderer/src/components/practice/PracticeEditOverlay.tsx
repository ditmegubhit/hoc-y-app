import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { PracticeRegion, PracticeRegionPatch, PracticeTextReading, Rect } from '@shared/types/practice'
import {
  clampPage,
  firstAliveIndex,
  buildReviewQueue,
  isConfirmableAnswer,
  parseAlternates,
  pushRecentColor,
  stepQueueIndex
} from '@shared/practice/editLogic'
import { errorText } from '@shared/practice/quizLogic'
import {
  usePracticeFile,
  usePracticePageStates,
  usePracticeRegionsForFile,
  useReadPracticePageWithAi,
  useReadPracticeRegionWithAi,
  useResetPracticeRegionColors,
  useSetPracticePageReview
} from '@renderer/queries/practice'
import { usePageCount } from '@renderer/queries/attachmentView'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import PracticePageViewer from './PracticePageViewer'
import AnswerPanel from './edit/AnswerPanel'
import EditCanvas from './edit/EditCanvas'
import EditHeader from './edit/EditHeader'
import EditToolbar from './edit/EditToolbar'
import FileColorPanel from './edit/FileColorPanel'
import QuestionPreview from './edit/QuestionPreview'
import RegionColorControl from './edit/RegionColorControl'
import SequenceDone from './edit/SequenceDone'
import SplitHandle from './edit/SplitHandle'
import { EMPTY_STATS, type EditMode, type EditNotice, type EditTool, type SequenceStats } from './edit/editTypes'
import {
  loadEditMode,
  loadRecentColors,
  loadSplitRatio,
  saveEditMode,
  saveRecentColors,
  saveSplitRatio
} from './edit/editStorage'
import { useAnswerForm } from './edit/useAnswerForm'
import { useRegionEditor } from './edit/useRegionEditor'
import './practiceEdit.css'

// ============================================================================
// Man "Sua dap an" khu Thuc hanh GP. Nam TRONG khung phai cua app (khong phu sidebar):
// 1/4 tren la hop thoai (xac nhan, dap an, mau che...), 3/4 duoi la trang (vua khit khung).
//
// Cau truc:
//   PracticeEditOverlay (file nay)  - trang thai chung, phim tat, dieu phoi
//   edit/EditHeader                 - tieu de, "?", che do, trang bat dau, pham vi
//   edit/AnswerPanel                - o dap an / dap an khac + nut hanh dong + de xuat Claude
//   edit/FileColorPanel + ColorPicker + OpacitySlider - mau che ca file (banh xe mau canvas)
//   edit/RegionColorControl         - mau / do mo rieng cua vung (popover) + cong cu
//   edit/EditCanvas                 - lop SVG tren trang: ve o che, keo / doi co / ve vung
//   edit/QuestionPreview            - "xem thu cau hoi" (che duc 100%)
//   edit/useRegionEditor            - ghi lac quan + ngan xep hoan tac
//   edit/useAnswerForm              - trang thai o nhap theo vung
//   shared/practice/editLogic.ts    - logic thuan (co test)
//
// Cache: lay MOT lan toan bo vung cua file (usePracticeRegionsForFile), loc theo trang o client.
// ============================================================================

export interface PracticeEditOverlayProps {
  fileId: string
  onClose: () => void
}

type Modal = 'exit' | 'resetColors' | null

const NO_REGIONS: PracticeRegion[] = []
const NOTICE_MS = 5000

type TargetKind = 'text' | 'slider' | 'select' | 'button' | 'other'

function classifyTarget(el: Element | null): TargetKind {
  if (!el || !(el instanceof HTMLElement)) return 'other'
  if (el.isContentEditable) return 'text'
  const tag = el.tagName
  if (tag === 'TEXTAREA') return 'text'
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    if (type === 'range') return 'slider'
    if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') return 'button'
    return 'text'
  }
  if (tag === 'SELECT') return 'select'
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return 'button'
  return 'other'
}

export default function PracticeEditOverlay({ fileId, onClose }: PracticeEditOverlayProps): React.JSX.Element {
  const fileQuery = usePracticeFile(fileId)
  const regionsQuery = usePracticeRegionsForFile(fileId)
  const pageStatesQuery = usePracticePageStates(fileId)
  const setPageReview = useSetPracticePageReview(fileId)
  const resetColors = useResetPracticeRegionColors(fileId)
  const readRegionAi = useReadPracticeRegionWithAi()
  const readPageAi = useReadPracticePageWithAi(fileId)

  const file = fileQuery.data ?? null
  const regions = regionsQuery.data
  const regionList = regions ?? NO_REGIONS
  const regionsLoaded = regions !== undefined
  const pageCountQuery = usePageCount(fileId, file !== null && file.totalPages === null)
  const totalPages = file?.totalPages ?? pageCountQuery.data ?? null

  // ----- Thong bao trong man hinh (khong dung alert) -----
  const [notice, setNotice] = useState<EditNotice | null>(null)
  const showError = useCallback((text: string) => setNotice({ kind: 'error', text }), [])
  const showInfo = useCallback((text: string) => setNotice({ kind: 'info', text }), [])
  useEffect(() => {
    if (!notice || notice.kind === 'error') return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const editor = useRegionEditor(fileId, showError)

  // ----- Che do / bo cuc -----
  const [mode, setModeState] = useState<EditMode>(loadEditMode)
  const [splitRatio, setSplitRatio] = useState<number>(loadSplitRatio)
  const [recent, setRecent] = useState<string[]>(loadRecentColors)
  const [modal, setModal] = useState<Modal>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // ----- Du lieu dan xuat -----
  const { byId, byPage } = useMemo(() => {
    const idMap = new Map<string, PracticeRegion>()
    const pageMap = new Map<number, PracticeRegion[]>()
    for (const region of regionList) {
      idMap.set(region.id, region)
      const list = pageMap.get(region.pageNumber)
      if (list) list.push(region)
      else pageMap.set(region.pageNumber, [region])
    }
    return { byId: idMap, byPage: pageMap }
  }, [regionList])
  const byIdRef = useRef(byId)
  byIdRef.current = byId
  const listRef = useRef(regionList)
  listRef.current = regionList

  const overrideCount = useMemo(
    () => regionList.filter((r) => r.colorOverride !== null || r.opacityOverride !== null).length,
    [regionList]
  )
  const unreviewedCount = useMemo(() => regionList.filter((r) => !r.reviewed).length, [regionList])

  // ----- Trinh tu -----
  const [startPage, setStartPage] = useState(1)
  const [allRegions, setAllRegions] = useState(false)
  const [queue, setQueue] = useState<string[] | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [stats, setStats] = useState<SequenceStats>(EMPTY_STATS)
  const [queueNonce, setQueueNonce] = useState(0)

  useEffect(() => {
    if (mode !== 'sequence' || !regionsLoaded) return
    const ids = buildReviewQueue(listRef.current, { startPage, onlyUnreviewed: !allRegions })
    setQueue(ids)
    setQIndex(0)
    setStats(EMPTY_STATS)
  }, [mode, regionsLoaded, startPage, allRegions, queueNonce])

  // Vung trong hang doi bi xoa tu noi khac (vd hoan tac "ve vung") -> nhay qua.
  useEffect(() => {
    if (mode !== 'sequence' || !queue || qIndex >= queue.length) return
    if (byId.has(queue[qIndex])) return
    setQIndex(firstAliveIndex(queue, qIndex, (id) => byId.has(id)))
  }, [mode, queue, qIndex, byId])

  // ----- Chon vung -----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditTool>('select')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [formNonce, setFormNonce] = useState(0)
  const [suggestions, setSuggestions] = useState<Record<string, PracticeTextReading>>({})

  const sequenceActiveId = mode === 'sequence' && queue && qIndex < queue.length ? queue[qIndex] : null
  const activeId = mode === 'sequence' ? sequenceActiveId : selectedId
  const activeRegion = activeId ? (byId.get(activeId) ?? null) : null
  const viewPage = mode === 'sequence' && activeRegion ? activeRegion.pageNumber : page
  const pageRegions = byPage.get(viewPage) ?? NO_REGIONS

  // Nho trang dang xem de khi doi che do van o dung trang.
  useEffect(() => {
    if (mode === 'sequence' && activeRegion) setPage(activeRegion.pageNumber)
  }, [mode, activeRegion])

  // Doi vung: dong xem thu; khong con vung de ve crop thi ve cong cu chon.
  useEffect(() => {
    setPreviewOpen(false)
  }, [activeId])
  useEffect(() => {
    if (tool === 'crop' && !activeRegion) setTool('select')
  }, [tool, activeRegion])

  const form = useAnswerForm(activeRegion, formNonce)

  // ----- Hanh dong (tao lai moi lan render de luon dung state moi nhat; phim tat goi qua ref) -----
  const alive = (id: string): boolean => byIdRef.current.has(id)

  const advance = (): void => {
    if (mode === 'sequence') {
      if (queue) setQIndex(stepQueueIndex(queue, qIndex, 1, alive))
    } else {
      setSelectedId(null)
    }
  }

  const confirm = (): void => {
    const region = activeRegion
    if (!region) return
    if (!isConfirmableAnswer(form.answer)) {
      showError('Đáp án đang trống. Hãy gõ đáp án, hoặc bấm "Chỉ che (không hỏi)" nếu vùng này chỉ cần che.')
      form.focusAnswer(false)
      return
    }
    const patch: PracticeRegionPatch = {
      answerText: form.answer.trim(),
      alternates: parseAlternates(form.alternates, form.answer),
      status: 'confirmed',
      reviewed: true
    }
    void editor.updateRegion(region, patch, { label: 'Xác nhận đáp án' })
    setStats((s) => ({ ...s, confirmed: s.confirmed + 1 }))
    advance()
  }

  const maskOnly = (): void => {
    const region = activeRegion
    if (!region) return
    void editor.updateRegion(region, { status: 'rejected', reviewed: true }, { label: 'Đánh dấu chỉ che' })
    setStats((s) => ({ ...s, maskOnly: s.maskOnly + 1 }))
    advance()
  }

  const goRelative = (dir: 1 | -1): void => {
    if (mode === 'sequence') {
      if (!queue) return
      const next = stepQueueIndex(queue, qIndex, dir, alive)
      if (dir === -1 && next < 0) return
      setQIndex(next)
    } else {
      setSelectedId(null)
      setPage((p) => clampPage(p + dir, totalPages))
    }
  }

  const skip = (): void => {
    if (!activeRegion) return
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }))
    goRelative(1)
  }

  const deleteActive = (): void => {
    const region = activeRegion
    if (!region) return
    void editor.deleteRegion(region)
    setStats((s) => ({ ...s, deleted: s.deleted + 1 }))
    advance()
  }

  const focusRegion = (id: string, pageNumber: number | null): void => {
    if (mode === 'sequence') {
      const index = queue ? queue.indexOf(id) : -1
      if (index >= 0) setQIndex(index)
    } else {
      if (pageNumber !== null) setPage(pageNumber)
      setSelectedId(id)
    }
  }

  const undo = async (): Promise<void> => {
    const result = await editor.undo()
    if (!result) return
    setFormNonce((n) => n + 1)
    if (result.regionId) focusRegion(result.regionId, result.pageNumber)
    else if (mode === 'select') setSelectedId(null)
    showInfo(`Đã hoàn tác: ${result.label}.`)
  }

  const requestClose = (): void => {
    if (activeRegion && form.dirty) setModal('exit')
    else onClose()
  }

  const escape = (): void => {
    if (previewOpen) setPreviewOpen(false)
    else if (tool !== 'select') setTool('select')
    else if (mode === 'select') setSelectedId(null)
    else requestClose()
  }

  const changeMode = (next: EditMode): void => {
    if (next === mode) return
    saveEditMode(next)
    setTool('select')
    setPreviewOpen(false)
    setSelectedId(null)
    if (next === 'sequence') setStartPage(page)
    setModeState(next)
  }

  const changePage = (next: number): void => {
    setSelectedId(null)
    setPage(clampPage(next, totalPages))
  }

  const pushRecent = (hex: string): void => {
    setRecent((prev) => {
      const next = pushRecentColor(prev, hex)
      saveRecentColors(next)
      return next
    })
  }

  // ----- Claude doc lai (chi de xuat) -----
  const readRegion = (): void => {
    const region = activeRegion
    if (!region) return
    readRegionAi.mutate(region.id, {
      onSuccess: (reading) => setSuggestions((prev) => ({ ...prev, [region.id]: reading })),
      onError: (error) => showError(errorText(error, 'Claude không đọc được vùng này.'))
    })
  }
  const readPage = (): void => {
    const pageNumber = viewPage
    readPageAi.mutate(pageNumber, {
      onSuccess: (list) => {
        const found: Record<string, PracticeTextReading> = {}
        for (const item of list) if (item.reading) found[item.regionId] = item.reading
        setSuggestions((prev) => ({ ...prev, ...found }))
        const failed = list.find((item) => item.error)?.error
        showInfo(
          `Claude đã đọc ${Object.keys(found).length}/${list.length} vùng của trang ${pageNumber}. Đề xuất hiện ở ô đáp án khi bạn chọn từng vùng.${failed ? ` (Có lỗi: ${failed})` : ''}`
        )
      },
      onError: (error) => showError(errorText(error, 'Claude không đọc được trang này.'))
    })
  }
  const dropSuggestion = (): void => {
    if (!activeRegion) return
    const id = activeRegion.id
    setSuggestions((prev) => {
      const { [id]: _removed, ...rest } = prev
      void _removed
      return rest
    })
  }
  const acceptSuggestion = (): void => {
    const suggestion = activeRegion ? suggestions[activeRegion.id] : undefined
    if (!suggestion) return
    form.setAnswer(suggestion.text)
    dropSuggestion()
    form.focusAnswer(false)
  }

  // ----- Thao tac tren trang -----
  const commitBox = (region: PracticeRegion, box: Rect): void => {
    void editor.updateRegion(region, { labelBox: box }, { label: 'Dời / đổi cỡ vùng' })
  }
  const commitCrop = (region: PracticeRegion, crop: Rect): void => {
    void editor.updateRegion(region, { cropBox: crop }, { label: 'Vẽ khung crop' })
    setTool('select')
  }
  const clearCrop = (): void => {
    if (activeRegion) void editor.updateRegion(activeRegion, { cropBox: null }, { label: 'Bỏ khung crop' })
  }
  const drawRegion = (box: Rect, imageWidth: number, imageHeight: number): void => {
    void editor
      .createRegion({
        pageNumber: viewPage,
        labelBox: box,
        refWidth: imageWidth,
        refHeight: imageHeight,
        status: 'pending',
        reviewed: false
      })
      .then((created) => {
        if (!created) return
        setSelectedId(created.id)
        setTool('select')
      })
  }

  const togglePageReview = (): void => {
    const reviewed = pageStatesQuery.data?.find((p) => p.pageNumber === viewPage)?.reviewed ?? false
    setPageReview.mutate(
      { pageNumber: viewPage, reviewed: !reviewed },
      { onError: (error) => showError(errorText(error, 'Không đánh dấu được trang.')) }
    )
  }

  // ----- Phim tat (lang nghe 1 lan, goi hanh dong moi nhat qua ref) -----
  const actionsRef = useRef({
    confirm,
    undo,
    escape,
    goRelative,
    deleteActive,
    modal,
    closeModal: () => setModal(null),
    isDirty: form.dirty
  })
  actionsRef.current = { confirm, undo, escape, goRelative, deleteActive, modal, closeModal: () => setModal(null), isDirty: form.dirty }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return
      const a = actionsRef.current
      if (a.modal) {
        if (e.key === 'Escape') {
          e.preventDefault()
          a.closeModal()
        }
        return
      }
      const root = rootRef.current
      const target = e.target instanceof Element ? e.target : null
      // Chi bat phim khi con tro nam trong man nay (hoac chua focus o dau) - khong lan sang cay ben trai.
      if (root && target && target !== document.body && !root.contains(target)) return
      const kind = classifyTarget(target)
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if (kind === 'text') {
          const isAnswer = target?.hasAttribute('data-pe-answer') ?? false
          if (!isAnswer || a.isDirty) return // de o nhap tu hoan tac chu dang go
        }
        e.preventDefault()
        void a.undo()
        return
      }
      if (e.key === 'Enter' && !ctrl && !e.altKey) {
        if (kind === 'text') {
          if (!(target?.hasAttribute('data-pe-answer') ?? false)) return
        } else if (kind !== 'other') {
          return
        }
        e.preventDefault()
        a.confirm()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        a.escape()
        return
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !ctrl) {
        const inControl = kind === 'text' || kind === 'select' || kind === 'slider'
        if (inControl && !e.altKey) return
        e.preventDefault()
        a.goRelative(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (e.key === 'Delete') {
        if (kind === 'text' && !ctrl) return
        e.preventDefault()
        a.deleteActive()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ----- Hien thi -----
  if (!file || !regionsLoaded) {
    return (
      <div className="pe-root pe-loading" ref={rootRef} tabIndex={-1}>
        {fileQuery.isError || regionsQuery.isError ? (
          <>
            <p>Không tải được dữ liệu của file.</p>
            <button type="button" className="pe-btn" onClick={onClose}>
              Đóng
            </button>
          </>
        ) : (
          <p>Đang tải dữ liệu vùng…</p>
        )}
      </div>
    )
  }

  const pageReviewed = pageStatesQuery.data?.find((p) => p.pageNumber === viewPage)?.reviewed ?? false
  const sequenceDone = mode === 'sequence' && queue !== null && qIndex >= queue.length
  const canPrev = mode === 'sequence' && queue !== null && stepQueueIndex(queue, qIndex, -1, alive) >= 0

  const positionText =
    mode === 'sequence' && queue
      ? `Vùng ${Math.min(qIndex + 1, queue.length)} / ${queue.length}`
      : `${pageRegions.length} vùng trên trang`
  const summary =
    mode === 'sequence'
      ? `${queue ? (sequenceDone ? 'Hết hàng đợi' : positionText) : 'Đang dựng hàng đợi…'} · trang ${viewPage}/${totalPages ?? '?'} · ${unreviewedCount} chưa duyệt`
      : `Trang ${viewPage}/${totalPages ?? '?'} · ${pageRegions.length} vùng · ${unreviewedCount} chưa duyệt`

  const emptyHint =
    mode === 'sequence' ? (
      <p>{sequenceDone ? 'Đã hết vùng cần duyệt.' : 'Đang chuẩn bị danh sách vùng…'}</p>
    ) : tool === 'draw' ? (
      <p>Kéo chuột trên trang để vẽ vùng che mới (xong sẽ tự chọn vùng đó để bạn gõ đáp án).</p>
    ) : (
      <p>
        Bấm vào một vùng trên trang để chọn và sửa. Thiếu vùng thì dùng &quot;Vẽ vùng mới&quot;. Phím ← → đổi trang.
      </p>
    )

  return (
    <div
      ref={rootRef}
      className="pe-root"
      tabIndex={-1}
      role="region"
      aria-label="Sửa đáp án"
    >
      <section className="pe-dialog" style={{ flexBasis: `${splitRatio * 100}%` }}>
        <EditHeader
          fileName={file.name}
          mode={mode}
          onMode={changeMode}
          totalPages={totalPages}
          page={viewPage}
          startPage={startPage}
          onStartPage={setStartPage}
          allRegions={allRegions}
          onAllRegions={setAllRegions}
          pageReviewed={pageReviewed}
          pageReviewBusy={setPageReview.isPending}
          onTogglePageReview={togglePageReview}
          summary={summary}
          onClose={requestClose}
        />
        <div className="pe-dialog-body">
          <div className="pe-cards">
            <AnswerPanel
              mode={mode}
              region={activeRegion}
              form={form}
              positionText={positionText}
              emptyHint={emptyHint}
              canPrev={canPrev}
              onConfirm={confirm}
              onMaskOnly={maskOnly}
              onNext={skip}
              onPrev={() => goRelative(-1)}
              onDeselect={() => setSelectedId(null)}
              onDelete={deleteActive}
              onUndo={() => void undo()}
              undoLabel={editor.undoLabel}
              onReadAi={readRegion}
              onReadPageAi={readPage}
              aiBusy={readRegionAi.isPending}
              aiPageBusy={readPageAi.isPending}
              suggestion={activeRegion ? (suggestions[activeRegion.id] ?? null) : null}
              onAcceptSuggestion={acceptSuggestion}
              onRejectSuggestion={dropSuggestion}
            />
            <FileColorPanel
              file={file}
              recent={recent}
              overrideCount={overrideCount}
              onPushRecent={pushRecent}
              onRequestReset={() => setModal('resetColors')}
              onError={showError}
            />
            <RegionColorControl region={activeRegion} file={file} recent={recent} editor={editor} onPushRecent={pushRecent}>
              <EditToolbar
                mode={mode}
                tool={tool}
                hasRegion={activeRegion !== null}
                hasCrop={activeRegion?.cropBox != null}
                previewing={previewOpen}
                onTool={setTool}
                onClearCrop={clearCrop}
                onPreview={() => setPreviewOpen((open) => !open)}
              />
            </RegionColorControl>
          </div>
          <p className="pe-legend">
            <span className="pe-legend-item">
              <i className="pe-key is-unreviewed" /> chưa duyệt
            </span>
            <span className="pe-legend-item">
              <i className="pe-key is-confirmed" /> đã xác nhận
            </span>
            <span className="pe-legend-item">
              <i className="pe-key is-maskOnly" /> chỉ che (không hỏi)
            </span>
            <span className="pe-legend-item">
              <i className="pe-key is-suspect" /> nghi rác (nền đối nghịch màu che, kèm lý do)
            </span>
            <span className="pe-legend-item">
              <i className="pe-key is-active" /> vùng đang chọn
            </span>
            <span className="pe-legend-note">
              Khi sửa, ô che hơi mờ để thấy chữ bên dưới; bài thi luôn che đục 100% bằng cùng màu.
            </span>
          </p>
        </div>
      </section>

      <SplitHandle
        ratio={splitRatio}
        containerRef={rootRef}
        onChange={setSplitRatio}
        onCommit={saveSplitRatio}
      />

      <section className="pe-viewer-pane">
        <PracticePageViewer
          fileId={fileId}
          pageNumber={viewPage}
          onPageChange={changePage}
          totalPages={file.totalPages ?? undefined}
          showNav={mode === 'select'}
          resetKey={`${mode}:${splitRatio.toFixed(3)}`}
          primaryPan={tool === 'select'}
          renderOverlay={(geom) => (
            <EditCanvas
              geom={geom}
              regions={pageRegions}
              fileMaskColor={file.maskColor}
              fileMaskOpacity={file.maskOpacity}
              mode={mode}
              tool={tool}
              activeId={activeId}
              onSelect={setSelectedId}
              onCommitBox={commitBox}
              onCommitCrop={commitCrop}
              onDrawRegion={drawRegion}
              onSettle={() => form.focusAnswer(false)}
            />
          )}
        />
        {sequenceDone && queue && (
          <SequenceDone
            stats={stats}
            queueSize={queue.length}
            onlyUnreviewed={!allRegions}
            startPage={startPage}
            onRestart={() => setQueueNonce((n) => n + 1)}
            onShowAll={() => setAllRegions(true)}
            onSwitchToSelect={() => changeMode('select')}
            onClose={onClose}
          />
        )}
        {previewOpen && activeRegion && (
          <QuestionPreview
            fileId={fileId}
            target={activeRegion}
            pageRegions={pageRegions}
            fileMaskColor={file.maskColor}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </section>

      {notice && (
        <div className={`pe-toast is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" className="pe-toast-close" aria-label="Đóng thông báo" onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={modal === 'exit'}
        title="Thoát khi chưa lưu?"
        message="Đáp án bạn vừa sửa ở vùng này chưa được lưu. Thoát bây giờ sẽ bỏ phần đã gõ."
        confirmLabel="Thoát, không lưu"
        cancelLabel="Ở lại"
        onCancel={() => setModal(null)}
        onConfirm={() => {
          setModal(null)
          onClose()
        }}
      />
      <ConfirmDialog
        open={modal === 'resetColors'}
        title="Đặt lại màu riêng?"
        message={`Xoá màu và độ mờ riêng của ${overrideCount} vùng; mọi vùng sẽ dùng màu và độ mờ chung của file. Việc này không hoàn tác được.`}
        confirmLabel="Đặt lại"
        cancelLabel="Huỷ"
        onCancel={() => setModal(null)}
        onConfirm={() => {
          setModal(null)
          resetColors.mutate(
            { includeOpacity: true },
            {
              onSuccess: () => showInfo('Đã đặt lại: mọi vùng dùng màu và độ mờ chung.'),
              onError: (error) => showError(errorText(error, 'Không đặt lại được màu riêng.'))
            }
          )
        }}
      />
    </div>
  )
}
