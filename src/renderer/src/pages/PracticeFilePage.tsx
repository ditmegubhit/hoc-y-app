import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  History,
  Link2,
  ListChecks,
  Loader2,
  PencilLine,
  Play,
  RotateCcw,
  ScanText,
  X
} from 'lucide-react'
import type { PracticeScanResult } from '@shared/types/practice'
import {
  useCancelPracticeScan,
  usePracticeActiveAttempt,
  usePracticeFile,
  usePracticeRegionsForFile,
  usePracticeScanProgress,
  usePracticeScanState,
  usePracticeSourceStatus,
  usePracticeStationSets,
  useResolvePracticeSourceChange,
  useScanPracticeFile,
  useSyncPracticeSource
} from '@renderer/queries/practice'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import PracticeDialog from '@renderer/components/practice/PracticeDialog'
import PracticePageViewer from '@renderer/components/practice/PracticePageViewer'
import PracticeEditOverlay from '@renderer/components/practice/PracticeEditOverlay'
import PracticeMakeExamOverlay from '@renderer/components/practice/PracticeMakeExamOverlay'
import PracticePlayOverlay from '@renderer/components/practice/PracticePlayOverlay'
import PracticeHistoryOverlay from '@renderer/components/practice/PracticeHistoryOverlay'

interface PracticeFilePageProps {
  fileId: string
}

type Overlay = 'none' | 'makeExam' | 'edit' | 'play' | 'history'

// Ket qua/ thong bao sau khi quet hoac khi bam "Tao dap an" tren file da quet.
interface ScanNotice {
  title: string
  message: string
  offerEdit: boolean
}

function describeScanResult(result: PracticeScanResult, regionCount: number): ScanNotice {
  const failed =
    result.failedPages.length > 0
      ? ` Có ${result.failedPages.length} trang bị lỗi khi quét (trang ${result.failedPages.slice(0, 12).join(', ')}${
          result.failedPages.length > 12 ? '…' : ''
        }); bạn có thể thêm vùng thủ công ở các trang đó.`
      : ''
  if (result.alreadyRunning) {
    return {
      title: 'File đang được quét',
      message: 'File này đang được quét ở một tiến trình khác. Hãy chờ quét xong.',
      offerEdit: false
    }
  }
  if (result.cancelled) {
    return {
      title: 'Đã huỷ quét',
      message: `Đã dừng ở trang ${result.state.lastPage}/${result.state.totalPages ?? '?'}. Bấm "Tạo đáp án" để quét tiếp từ trang đang dở.${failed}`,
      offerEdit: false
    }
  }
  if (result.state.status === 'failed') {
    return {
      title: 'Quét không thành công',
      message: `Quá trình quét gặp lỗi và dừng lại.${failed} Bấm "Tạo đáp án" để thử quét tiếp.`,
      offerEdit: false
    }
  }
  return {
    title: 'Đã tạo đáp án nháp',
    message: `Tìm được ${regionCount} vùng chữ.${failed} Hãy mở "Sửa đáp án" để duyệt lại (đáp án nháp có thể sai chữ hoặc dư vùng rác).`,
    offerEdit: true
  }
}

function PracticeFilePage({ fileId }: PracticeFilePageProps): React.JSX.Element {
  const fileQuery = usePracticeFile(fileId)
  const regionsQuery = usePracticeRegionsForFile(fileId)
  const scanState = usePracticeScanState(fileId)
  const progress = usePracticeScanProgress(fileId)
  const sourceStatus = usePracticeSourceStatus(fileId)
  const stationSets = usePracticeStationSets(fileId)
  const activeAttempt = usePracticeActiveAttempt(fileId)

  const scanFile = useScanPracticeFile(fileId)
  const cancelScan = useCancelPracticeScan()
  const syncSource = useSyncPracticeSource(fileId)
  const resolveSource = useResolvePracticeSourceChange(fileId)

  const [overlay, setOverlay] = useState<Overlay>('none')
  const [page, setPage] = useState(1)
  const [scanDialogHidden, setScanDialogHidden] = useState(false)
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null)
  const [confirmRescan, setConfirmRescan] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const file = fileQuery.data ?? null
  const regions = regionsQuery.data
  const isScanning = scanFile.isPending || scanState.data?.running === true

  // Moi lan quet moi thi hien lai hop tien do.
  useEffect(() => {
    if (!isScanning) setScanDialogHidden(false)
  }, [isScanning])

  // Thong bao dong bo tu tat sau vai giay.
  useEffect(() => {
    if (!syncMessage) return
    const timer = window.setTimeout(() => setSyncMessage(null), 6000)
    return () => window.clearTimeout(timer)
  }, [syncMessage])

  const counts = useMemo(() => {
    const list = regions ?? []
    return {
      total: list.length,
      confirmed: list.filter((r) => r.status === 'confirmed').length,
      unreviewed: list.filter((r) => r.status === 'pending' && !r.reviewed).length
    }
  }, [regions])

  if (fileQuery.isLoading) {
    return <div className="practice-file-page practice-file-state">Đang tải file…</div>
  }
  if (!file) {
    return (
      <div className="practice-file-page practice-file-state">
        File này không còn trong kho thực hành (có thể đã bị xoá). Hãy chọn file khác ở cây bên trái.
      </div>
    )
  }

  const confirmedCount = regions ? counts.confirmed : file.confirmedCount
  const regionCount = regions ? counts.total : file.regionCount
  const hasScanned = file.scanCompleted || regionCount > 0
  const setCount = stationSets.data?.length ?? 0
  const hasActiveAttempt = Boolean(activeAttempt.data)
  const needsSourceConfirmation = sourceStatus.data?.needsConfirmation ?? file.needsSourceConfirmation
  const totalPages = file.totalPages

  // ----- Hanh dong -----

  const runScan = (force: boolean): void => {
    setScanDialogHidden(false)
    scanFile.mutate(force, {
      onSuccess: (result) => {
        // Doc lai so vung moi nhat tu ket qua refetch (da invalidate o onSettled).
        void regionsQuery.refetch().then((r) => {
          setScanNotice(describeScanResult(result, r.data?.length ?? 0))
        })
      },
      onError: (error) =>
        setScanNotice({
          title: 'Quét không thành công',
          message: error instanceof Error ? error.message : String(error),
          offerEdit: false
        })
    })
  }

  const handleCreateAnswers = (): void => {
    if (file.scanCompleted) {
      setScanNotice({
        title: 'File đã có đáp án nháp',
        message:
          'File này đã được quét xong. Hãy dùng "Sửa đáp án" để duyệt lại, hoặc "Quét lại từ đầu" nếu muốn tạo lại đáp án nháp.',
        offerEdit: regionCount > 0
      })
      return
    }
    runScan(false)
  }

  const handleSync = (): void => {
    syncSource.mutate(undefined, {
      onSuccess: (updated) => {
        if (updated) setSyncMessage('Đã cập nhật bản sao từ file gốc.')
        else if (sourceStatus.data?.sourceMissing) setSyncMessage('Không tìm thấy file gốc tại đường dẫn đã nhớ.')
        else setSyncMessage('File gốc chưa thay đổi.')
      },
      onError: (error) => setSyncMessage(error instanceof Error ? error.message : String(error))
    })
  }

  // ----- Trang thai nut -----

  const scanningHint = 'Đang quét, hãy chờ quét xong hoặc huỷ.'
  const makeExamDisabledReason = isScanning
    ? scanningHint
    : confirmedCount < 1
      ? 'Cần ít nhất 1 câu đã xác nhận. Hãy "Tạo đáp án" rồi duyệt trong "Sửa đáp án".'
      : null
  const editDisabledReason = isScanning ? scanningHint : !hasScanned ? 'Hãy Tạo đáp án trước.' : null
  const playDisabledReason = isScanning
    ? scanningHint
    : setCount < 1
      ? 'Chưa có bộ đề nào. Hãy "Tạo bài thi" trước.'
      : null
  const rescanDisabledReason = isScanning ? scanningHint : null

  const percent =
    progress && progress.totalPages > 0 ? Math.min(100, Math.round((progress.pageNumber / progress.totalPages) * 100)) : 0
  const progressPage = progress?.pageNumber ?? scanState.data?.lastPage ?? 0
  const progressTotal = progress?.totalPages ?? scanState.data?.totalPages ?? file.totalPages ?? 0

  return (
    <div className="practice-file-page">
      <header className="practice-file-header">
        <h2 className="practice-file-title" title={file.name}>
          {file.name}
        </h2>
        <div className="practice-file-stats">
          <span className={`practice-badge is-large${scanBadgeClass(file.scanStatus, isScanning)}`}>
            {isScanning ? (
              <>
                <Loader2 size={12} className="practice-spin" /> Đang quét
              </>
            ) : (
              scanLabel(file.scanStatus, file.scanCompleted)
            )}
          </span>
          {hasScanned && (
            <span className="practice-file-counts">
              {regionCount} vùng · {confirmedCount} câu · {counts.unreviewed} chưa duyệt
            </span>
          )}
          {isScanning && scanDialogHidden && (
            <button type="button" className="practice-link-button" onClick={() => setScanDialogHidden(false)}>
              Trang {progressPage}/{progressTotal || '?'} - xem tiến độ
            </button>
          )}
        </div>
        <div className="practice-file-header-actions">
          {syncMessage && <span className="practice-file-sync-message">{syncMessage}</span>}
          {sourceStatus.data?.hasSource && (
            <button
              type="button"
              className="btn-secondary"
              disabled={syncSource.isPending}
              title={
                sourceStatus.data.sourceMissing
                  ? `Không tìm thấy file gốc: ${sourceStatus.data.sourcePath ?? ''}`
                  : `Kiểm tra file gốc: ${sourceStatus.data.sourcePath ?? ''}`
              }
              onClick={handleSync}
            >
              {syncSource.isPending ? <Loader2 size={14} className="practice-spin" /> : <Link2 size={14} />} Đồng bộ file
              gốc
            </button>
          )}
        </div>
      </header>

      <div className="practice-action-bar" role="toolbar" aria-label="Thao tác với file thực hành">
        <ActionButton
          icon={<ClipboardList size={15} />}
          label="Tạo bài thi"
          disabledReason={makeExamDisabledReason}
          onClick={() => setOverlay('makeExam')}
        />
        <ActionButton
          icon={<ScanText size={15} />}
          label="Tạo đáp án"
          disabledReason={isScanning ? scanningHint : null}
          busy={isScanning}
          onClick={handleCreateAnswers}
        />
        <ActionButton
          icon={<PencilLine size={15} />}
          label="Sửa đáp án"
          disabledReason={editDisabledReason}
          onClick={() => setOverlay('edit')}
        />
        <ActionButton
          icon={<Play size={15} />}
          label="Làm bài"
          disabledReason={playDisabledReason}
          highlight={hasActiveAttempt && !playDisabledReason}
          onClick={() => setOverlay('play')}
        />
        <ActionButton icon={<History size={15} />} label="Lịch sử & ôn câu sai" onClick={() => setOverlay('history')} />
        <ActionButton
          icon={<RotateCcw size={15} />}
          label="Quét lại từ đầu"
          disabledReason={rescanDisabledReason}
          onClick={() => setConfirmRescan(true)}
        />
        {hasActiveAttempt && setCount > 0 && (
          <button
            type="button"
            className="practice-resume-hint"
            title="Bạn đang làm dở một lượt. Bấm để mở Làm bài và tiếp tục."
            onClick={() => setOverlay('play')}
          >
            <ListChecks size={14} /> Có lượt làm dở - tiếp tục
          </button>
        )}
      </div>

      <div className="practice-file-viewer">
        <PracticePageViewer
          fileId={fileId}
          pageNumber={page}
          onPageChange={setPage}
          totalPages={totalPages ?? undefined}
          showNav
        />
      </div>

      {/* ----- Tien do quet ----- */}
      <PracticeDialog
        open={isScanning && !scanDialogHidden}
        title="Đang tạo đáp án"
        actions={
          <>
            <button type="button" onClick={() => setScanDialogHidden(true)}>
              Ẩn
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={cancelScan.isPending}
              onClick={() => cancelScan.mutate(fileId)}
            >
              <X size={14} /> Huỷ quét
            </button>
          </>
        }
      >
        <div className="practice-progress">
          <div className="practice-progress-text">
            {progressTotal > 0 ? `Trang ${progressPage} / ${progressTotal}` : 'Đang chuẩn bị…'}
            {progress ? ` · ${progress.regionCount} vùng đã tìm` : ''}
          </div>
          <div className="practice-progress-bar" aria-hidden="true">
            <div className="practice-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          {progress && progress.failedPages.length > 0 && (
            <div className="practice-progress-warn">
              Trang lỗi (bỏ qua): {progress.failedPages.slice(0, 12).join(', ')}
              {progress.failedPages.length > 12 ? '…' : ''}
            </div>
          )}
          <p className="practice-progress-hint">
            Bạn có thể bấm &quot;Ẩn&quot; để làm việc khác, quá trình quét vẫn chạy. Huỷ rồi quét tiếp sẽ bắt đầu lại từ
            trang đang dở.
          </p>
        </div>
      </PracticeDialog>

      {/* ----- Ket qua / thong bao quet ----- */}
      <PracticeDialog
        open={scanNotice !== null && !isScanning}
        title={scanNotice?.title ?? ''}
        actions={
          scanNotice?.offerEdit ? (
            <>
              <button type="button" onClick={() => setScanNotice(null)}>
                Để sau
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setScanNotice(null)
                  setOverlay('edit')
                }}
              >
                Mở Sửa đáp án
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setScanNotice(null)}>
              Đóng
            </button>
          )
        }
      >
        <p>{scanNotice?.message}</p>
      </PracticeDialog>

      <ConfirmDialog
        open={confirmRescan}
        title="Quét lại từ đầu?"
        message="Các vùng bạn đã duyệt hoặc tự vẽ tay, và vùng bị đánh dấu chỉ che, sẽ được GIỮ NGUYÊN. Các vùng chưa duyệt sẽ bị thay bằng kết quả quét mới."
        confirmLabel="Quét lại"
        onCancel={() => setConfirmRescan(false)}
        onConfirm={() => {
          setConfirmRescan(false)
          runScan(true)
        }}
      />

      {/* ----- File goc da doi ----- */}
      <PracticeDialog
        open={needsSourceConfirmation}
        title="File gốc đã đổi"
        wide
        actions={
          <>
            <button
              type="button"
              className="btn-danger"
              disabled={resolveSource.isPending}
              onClick={() => resolveSource.mutate(false)}
            >
              Không, xoá vùng và quét lại
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={resolveSource.isPending}
              onClick={() => resolveSource.mutate(true)}
            >
              Có, giống nhau
            </button>
          </>
        }
      >
        <p>File gốc đã đổi. Bản mới có giống ~90% bản cũ không?</p>
        <p>
          Chọn &quot;Có&quot; để giữ nguyên các vùng và đáp án đã làm. Chọn &quot;Không&quot; để xoá toàn bộ vùng, đáp án nháp
          và cần quét lại.
        </p>
      </PracticeDialog>

      {/* ----- Cac man hinh phu toan cua so ----- */}
      {overlay === 'makeExam' && <PracticeMakeExamOverlay fileId={fileId} onClose={() => setOverlay('none')} />}
      {overlay === 'edit' && <PracticeEditOverlay fileId={fileId} onClose={() => setOverlay('none')} />}
      {overlay === 'play' && <PracticePlayOverlay fileId={fileId} onClose={() => setOverlay('none')} />}
      {overlay === 'history' && <PracticeHistoryOverlay fileId={fileId} onClose={() => setOverlay('none')} />}
    </div>
  )
}

function scanLabel(status: string, completed: boolean): string {
  if (status === 'failed') return 'Lỗi quét'
  if (completed || status === 'done') return 'Đã quét'
  return 'Chưa quét'
}

function scanBadgeClass(status: string, isScanning: boolean): string {
  if (isScanning) return ' is-busy'
  if (status === 'failed') return ' is-error'
  if (status === 'done') return ' is-ok'
  return ''
}

interface ActionButtonProps {
  icon: React.JSX.Element
  label: string
  onClick: () => void
  // Co gia tri = nut bi tat va gia tri nay la tooltip giai thich.
  disabledReason?: string | null
  busy?: boolean
  highlight?: boolean
}

function ActionButton({ icon, label, onClick, disabledReason, busy, highlight }: ActionButtonProps): React.JSX.Element {
  const disabled = Boolean(disabledReason)
  // Nut bi tat khong nhan su kien chuot trong mot so truong hop nen boc span de
  // tooltip (title) luon hien khi re chuot vao.
  return (
    <span className="practice-action-wrap" title={disabledReason ?? undefined}>
      <button
        type="button"
        className={`practice-action${highlight ? ' is-highlight' : ''}`}
        disabled={disabled}
        onClick={onClick}
      >
        {busy ? <Loader2 size={15} className="practice-spin" /> : icon}
        {label}
      </button>
    </span>
  )
}

export default PracticeFilePage
