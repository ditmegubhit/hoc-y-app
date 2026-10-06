import { CheckCircle2, RotateCcw } from 'lucide-react'
import type { SequenceStats } from './editTypes'

// Man "Da duyet xong" cua che do Sua trinh tu + tom tat phien.

interface SequenceDoneProps {
  stats: SequenceStats
  queueSize: number
  onlyUnreviewed: boolean
  startPage: number
  onRestart: () => void
  onShowAll: () => void
  onSwitchToSelect: () => void
  onClose: () => void
}

export default function SequenceDone({
  stats,
  queueSize,
  onlyUnreviewed,
  startPage,
  onRestart,
  onShowAll,
  onSwitchToSelect,
  onClose
}: SequenceDoneProps): React.JSX.Element {
  const nothing = queueSize === 0
  return (
    <div className="pe-done" role="status">
      <div className="pe-done-card">
        <CheckCircle2 size={34} className="pe-done-icon" aria-hidden="true" />
        <h3>{nothing ? 'Không có vùng nào để duyệt' : 'Đã duyệt xong'}</h3>
        {nothing ? (
          <p className="pe-muted">
            {onlyUnreviewed
              ? `Từ trang ${startPage} trở đi không còn vùng nào chưa duyệt.`
              : `Từ trang ${startPage} trở đi không có vùng nào.`}
          </p>
        ) : (
          <ul className="pe-done-stats">
            <li>
              <strong>{stats.confirmed}</strong> đã xác nhận
            </li>
            <li>
              <strong>{stats.maskOnly}</strong> chỉ che
            </li>
            <li>
              <strong>{stats.deleted}</strong> đã xoá
            </li>
            <li>
              <strong>{stats.skipped}</strong> bỏ qua
            </li>
          </ul>
        )}
        <div className="pe-done-actions">
          {onlyUnreviewed && (
            <button type="button" className="pe-btn" onClick={onShowAll} title="Duyệt lại cả những vùng đã duyệt">
              Xem lại tất cả vùng
            </button>
          )}
          {!nothing && stats.skipped > 0 && (
            <button type="button" className="pe-btn" onClick={onRestart} title="Quét lại danh sách vùng chưa duyệt (gồm cả vùng vừa bỏ qua)">
              <RotateCcw size={13} /> Duyệt lại các vùng còn lại
            </button>
          )}
          <button type="button" className="pe-btn" onClick={onSwitchToSelect}>
            Sang Sửa chọn vùng
          </button>
          <button type="button" className="pe-btn is-primary" onClick={onClose}>
            Thoát
          </button>
        </div>
      </div>
    </div>
  )
}
