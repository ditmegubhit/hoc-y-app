import { CheckSquare, ListOrdered, MousePointerClick, Square, X } from 'lucide-react'
import ShortcutHelp from './ShortcutHelp'
import type { EditMode } from './editTypes'

// Dau hop thoai: tieu de + "?" + chon che do (nho lan chon gan nhat) + (trinh tu) trang bat dau
// va pham vi + (ca hai) danh dau trang da duyet + thoat.

interface EditHeaderProps {
  fileName: string
  mode: EditMode
  onMode: (mode: EditMode) => void
  totalPages: number | null
  page: number
  startPage: number
  onStartPage: (page: number) => void
  allRegions: boolean
  onAllRegions: (all: boolean) => void
  pageReviewed: boolean
  pageReviewBusy: boolean
  onTogglePageReview: () => void
  summary: string
  onClose: () => void
}

export default function EditHeader({
  fileName,
  mode,
  onMode,
  totalPages,
  page,
  startPage,
  onStartPage,
  allRegions,
  onAllRegions,
  pageReviewed,
  pageReviewBusy,
  onTogglePageReview,
  summary,
  onClose
}: EditHeaderProps): React.JSX.Element {
  const pageOptions: number[] = []
  const max = totalPages ?? Math.max(startPage, page)
  for (let i = 1; i <= max; i += 1) pageOptions.push(i)

  return (
    <header className="pe-head">
      <div className="pe-head-title">
        <h2>Sửa đáp án</h2>
        <ShortcutHelp mode={mode} />
        <span className="pe-file-name" title={fileName}>
          {fileName}
        </span>
      </div>

      <div className="pe-seg" role="group" aria-label="Chế độ sửa">
        <button
          type="button"
          className={`pe-seg-btn${mode === 'sequence' ? ' is-active' : ''}`}
          aria-pressed={mode === 'sequence'}
          title="Duyệt lần lượt từng vùng: xác nhận xong tự sang vùng kế"
          onClick={() => onMode('sequence')}
        >
          <ListOrdered size={13} aria-hidden="true" /> Sửa trình tự
        </button>
        <button
          type="button"
          className={`pe-seg-btn${mode === 'select' ? ' is-active' : ''}`}
          aria-pressed={mode === 'select'}
          title="Xem cả trang, bấm vào vùng bất kỳ để sửa"
          onClick={() => onMode('select')}
        >
          <MousePointerClick size={13} aria-hidden="true" /> Sửa chọn vùng
        </button>
      </div>

      {mode === 'sequence' && (
        <div className="pe-scope">
          <label className="pe-scope-field">
            <span>Từ trang</span>
            <select
              className="pe-select"
              value={startPage}
              onChange={(e) => {
                onStartPage(Number(e.target.value))
                e.currentTarget.blur()
              }}
            >
              {pageOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`pe-switch${allRegions ? ' is-on' : ''}`}
            role="switch"
            aria-checked={allRegions}
            title={allRegions ? 'Đang duyệt TẤT CẢ vùng (kể cả đã duyệt)' : 'Đang chỉ duyệt vùng CHƯA duyệt; bấm để duyệt tất cả vùng'}
            onClick={(e) => {
              onAllRegions(!allRegions)
              e.currentTarget.blur()
            }}
          >
            <span className="pe-switch-knob" aria-hidden="true" />
            Tất cả vùng
          </button>
        </div>
      )}

      <div className="pe-head-right">
        <span className="pe-summary">{summary}</span>
        <button
          type="button"
          className={`pe-btn is-small${pageReviewed ? ' is-on' : ''}`}
          aria-pressed={pageReviewed}
          disabled={pageReviewBusy}
          title={`Đánh dấu trang ${page} là đã duyệt xong (chỉ để bạn theo dõi)`}
          onClick={(e) => {
            onTogglePageReview()
            e.currentTarget.blur()
          }}
        >
          {pageReviewed ? <CheckSquare size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />} Trang {page}{' '}
          đã duyệt
        </button>
        <button type="button" className="pe-btn is-small" onClick={onClose} title="Thoát màn Sửa đáp án">
          <X size={13} aria-hidden="true" /> Thoát
        </button>
      </div>
    </header>
  )
}
