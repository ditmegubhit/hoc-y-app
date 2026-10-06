import { Crop, Eye, MousePointer2, PenLine, Scissors } from 'lucide-react'
import type { EditMode, EditTool } from './editTypes'

// Cong cu vung: Chon/di chuyen/doi co (mac dinh), Ve vung moi (chi o che do chon vung),
// Ve / Bo khung crop cho vung dang chon, Xem thu cau hoi.

interface EditToolbarProps {
  mode: EditMode
  tool: EditTool
  hasRegion: boolean
  hasCrop: boolean
  previewing: boolean
  onTool: (tool: EditTool) => void
  onClearCrop: () => void
  onPreview: () => void
}

export default function EditToolbar({
  mode,
  tool,
  hasRegion,
  hasCrop,
  previewing,
  onTool,
  onClearCrop,
  onPreview
}: EditToolbarProps): React.JSX.Element {
  return (
    <div className="pe-toolbar" role="toolbar" aria-label="Công cụ vùng">
      <button
        type="button"
        className={`pe-btn is-small${tool === 'select' ? ' is-on' : ''}`}
        aria-pressed={tool === 'select'}
        title="Chọn, kéo di chuyển, kéo tay cầm để đổi cỡ vùng che"
        onClick={() => onTool('select')}
      >
        <MousePointer2 size={12} aria-hidden="true" /> Chọn / sửa vùng
      </button>
      {mode === 'select' && (
        <button
          type="button"
          className={`pe-btn is-small${tool === 'draw' ? ' is-on' : ''}`}
          aria-pressed={tool === 'draw'}
          title="Kéo chuột trên trang để vẽ một vùng che mới"
          onClick={() => onTool(tool === 'draw' ? 'select' : 'draw')}
        >
          <PenLine size={12} aria-hidden="true" /> Vẽ vùng mới
        </button>
      )}
      <button
        type="button"
        className={`pe-btn is-small${tool === 'crop' ? ' is-on' : ''}`}
        aria-pressed={tool === 'crop'}
        disabled={!hasRegion}
        title="Kéo chuột trên trang để vẽ khung crop: phần được hiển thị riêng cho câu hỏi này"
        onClick={() => onTool(tool === 'crop' ? 'select' : 'crop')}
      >
        <Crop size={12} aria-hidden="true" /> Vẽ vùng crop
      </button>
      <button
        type="button"
        className="pe-btn is-small"
        disabled={!hasRegion || !hasCrop}
        title="Bỏ khung crop của vùng đang chọn"
        onClick={onClearCrop}
      >
        <Scissors size={12} aria-hidden="true" /> Bỏ crop
      </button>
      <button
        type="button"
        className={`pe-btn is-small${previewing ? ' is-on' : ''}`}
        disabled={!hasRegion}
        title="Xem câu hỏi sẽ trông thế nào khi thi (che đục 100%)"
        onClick={onPreview}
      >
        <Eye size={12} aria-hidden="true" /> Xem thử câu hỏi
      </button>
    </div>
  )
}
