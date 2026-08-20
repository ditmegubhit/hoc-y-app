import { useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import type { Attachment } from '@shared/types/attachment'
import PdfImageViewer from './viewer/PdfImageViewer'
import ResizeHandle from '@renderer/components/common/ResizeHandle'

interface AttachmentViewerPanelProps {
  attachment: Attachment
  onClose: () => void
  width: number
  onWidthChange: (width: number) => void
}

const VIEWABLE_TYPES = new Set(['pdf', 'png', 'jpg', 'jpeg', 'docx', 'pptx'])
const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 1000

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const DEFAULT_ZOOM = 0.75
const ZOOM_STEP = 0.1

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function AttachmentViewerPanel({
  attachment,
  onClose,
  width,
  onWidthChange
}: AttachmentViewerPanelProps): React.JSX.Element {
  const canViewInApp = VIEWABLE_TYPES.has(attachment.fileType)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Reset zoom moi lan mo file khac - khong giu zoom cua file truoc sang
  // file sau (gay nham lan).
  useEffect(() => {
    setZoom(DEFAULT_ZOOM)
  }, [attachment.id])

  // Ctrl/Cmd + cuon chuot de zoom (quy uoc chuan cua trinh duyet/app desktop).
  // Phai gan qua addEventListener native voi passive:false - React tu dong
  // gan listener 'wheel' o muc passive de toi uu hieu nang, khien
  // preventDefault() trong synthetic handler khong co tac dung.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((z) => clampZoom(z + delta))
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Pinch-to-zoom bang 2 ngon tay tren man hinh cam ung - theo doi tung
  // pointer dang nhan (Pointer Events gom ca touch), khi co dung 2 diem thi
  // tinh ty le khoang cach thay doi so voi luc bat dau de suy ra zoom moi.
  const activePointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistance = useRef<number | null>(null)
  const pinchStartZoom = useRef(1)

  const handleBodyPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointers.current.size === 2) {
      const [p1, p2] = Array.from(activePointers.current.values())
      pinchStartDistance.current = pointerDistance(p1, p2)
      pinchStartZoom.current = zoom
    }
  }

  const handleBodyPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!activePointers.current.has(e.pointerId)) return
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size === 2 && pinchStartDistance.current) {
      e.preventDefault()
      const [p1, p2] = Array.from(activePointers.current.values())
      const currentDistance = pointerDistance(p1, p2)
      const scale = currentDistance / pinchStartDistance.current
      setZoom(clampZoom(pinchStartZoom.current * scale))
    }
  }

  const handleBodyPointerEnd = (e: React.PointerEvent<HTMLDivElement>): void => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) {
      pinchStartDistance.current = null
    }
  }

  return (
    <aside className="lesson-attachment-panel" style={{ width }}>
      <ResizeHandle
        className="lesson-attachment-panel-resize-handle"
        value={width}
        onChange={onWidthChange}
        computeNext={(startWidth, dx) =>
          // Panel nam ben phai, keo tay cam sang trai (delta am) phai LAM
          // RONG panel ra - nen tru dx (khong cong).
          Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth - dx))
        }
      />
      <div className="lesson-attachment-panel-header">
        <span className="lesson-attachment-panel-title" title={attachment.fileName}>
          {attachment.fileName}
        </span>
        {canViewInApp && (
          <div className="lesson-attachment-panel-zoom">
            <button
              type="button"
              title="Thu nhỏ"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            >
              <ZoomOut size={14} />
            </button>
            <span className="lesson-attachment-panel-zoom-value">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              title="Phóng to"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            >
              <ZoomIn size={14} />
            </button>
          </div>
        )}
        <button type="button" title="Đóng" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div
        ref={bodyRef}
        className="lesson-attachment-panel-body"
        onPointerDown={handleBodyPointerDown}
        onPointerMove={handleBodyPointerMove}
        onPointerUp={handleBodyPointerEnd}
        onPointerCancel={handleBodyPointerEnd}
      >
        {canViewInApp ? (
          <PdfImageViewer key={attachment.id} attachment={attachment} zoom={zoom} />
        ) : (
          <div className="viewer-unsupported">
            <p>Loại file này chưa hỗ trợ xem trong app.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

export default AttachmentViewerPanel
