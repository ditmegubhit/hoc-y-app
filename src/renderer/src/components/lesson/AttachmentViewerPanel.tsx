import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import type { Attachment } from '@shared/types/attachment'
import PdfImageViewer, { BASE_CONTENT_WIDTH } from './viewer/PdfImageViewer'
import ResizeHandle from '@renderer/components/common/ResizeHandle'
import { useAnnotationStore, type AnnotationTool } from '@renderer/stores/annotationStore'

interface AttachmentViewerPanelProps {
  attachment: Attachment
  onClose: () => void
  width: number
  onWidthChange: (width: number) => void
}

const VIEWABLE_TYPES = new Set(['pdf', 'png', 'jpg', 'jpeg', 'docx', 'pptx'])
const MIN_PANEL_WIDTH = 320
// Tang gioi han tren de nguoi dung co the keo panel chiem nhieu khong gian
// hon ve phia phai tren man hinh rong, van chua toi (toolbox 44px + khoang
// cach) nam ben phai panel.
const MAX_PANEL_WIDTH = 1400

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const DEFAULT_ZOOM = 0.75
const ZOOM_STEP = 0.1
// Padding cua .pdf-viewer-scroll (0.6rem = 9.6px moi ben) cong them vien
// cua trang (1px) - tru di khoi be rong kha dung khi tinh zoom "vua khit".
const VIEWER_PADDING = 22

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

  // LessonWorkspacePage gan key={attachment.id} cho component nay - moi lan
  // doi file se remount hoan toan. Thay vi luon bat dau o 75% co dinh, tu
  // tinh zoom sao cho be rong noi dung VUA KHIT be rong panel hien tai
  // (kieu "Fit Width" cua cac trinh doc PDF) - chay truoc khi ve hinh
  // (useLayoutEffect) de khong bi nhap nhay 75% roi moi nhay sang zoom that.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const availableWidth = el.clientWidth - VIEWER_PADDING
    if (availableWidth <= 0) return
    setZoom(clampZoom(availableWidth / BASE_CONTENT_WIDTH))
  }, [])

  // O day chi can nap chu thich da luu cua dung file nay tu DB vao store
  // luc mount.
  useEffect(() => {
    let cancelled = false
    window.api.attachments.getAnnotations({ attachmentId: attachment.id }).then((list) => {
      if (cancelled) return
      useAnnotationStore
        .getState()
        .loadAnnotations(
          attachment.id,
          list.map(({ id, pageNumber, type, data }) => ({ id, pageNumber, type, data }))
        )
    })
    return () => {
      cancelled = true
    }
  }, [attachment.id])

  // Diem "neo" cho lan phong to/thu nho GAN NHAT - toa do man hinh (clientX/Y)
  // cua con tro chuot hoac tam diem 2 ngon tay, cung voi zoom NGAY TRUOC luc
  // doi. Sau khi zoom doi (DOM da co be rong moi), useLayoutEffect ben duoi
  // dung diem neo nay de dieu chinh scrollLeft/scrollTop sao cho DUNG diem
  // noi dung do van nam duoi con tro/tay - khong con "phong to mac dinh o
  // goc trai tren cung" nua.
  const zoomAnchor = useRef<{ clientX: number; clientY: number; prevZoom: number } | null>(null)

  useLayoutEffect(() => {
    const el = bodyRef.current
    const anchor = zoomAnchor.current
    if (!el || !anchor) return
    zoomAnchor.current = null
    const rect = el.getBoundingClientRect()
    const offsetX = anchor.clientX - rect.left
    const offsetY = anchor.clientY - rect.top
    const contentX = (el.scrollLeft + offsetX) / anchor.prevZoom
    const contentY = (el.scrollTop + offsetY) / anchor.prevZoom
    el.scrollLeft = contentX * zoom - offsetX
    el.scrollTop = contentY * zoom - offsetY
  }, [zoom])

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
      setZoom((z) => {
        zoomAnchor.current = { clientX: e.clientX, clientY: e.clientY, prevZoom: z }
        return clampZoom(z + delta)
      })
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
  // Keo tu do 1 ngon = di chuyen (pan) noi dung file ca chieu ngang lan doc
  // - chi voi ngon tay that (khong phai chuot, vi chuot da co scrollbar/
  // wheel san). Cong cu chu thich (neu dang bat) da duoc tam tat ngay khi
  // cham (xem activeTouchPointers/disabledTool ben duoi) nen luon duoc
  // phep pan, khong con can kiem tra tool === 'none' o day nua.
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  // So ngon tay CHAM (khac activePointers - gom ca chuot). Cham ngon dau
  // tien (tu 0 len 1) se tam tat cong cu chu thich dang bat, luu lai de
  // bat lai dung cong cu do khi het cham HOAN TOAN (ve 0).
  const activeTouchPointers = useRef(new Set<number>())
  const disabledTool = useRef<AnnotationTool | null>(null)

  const handleBodyPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (e.pointerType === 'touch') {
      const wasEmpty = activeTouchPointers.current.size === 0
      activeTouchPointers.current.add(e.pointerId)
      if (wasEmpty) {
        const currentTool = useAnnotationStore.getState().tool
        if (currentTool !== 'none') {
          disabledTool.current = currentTool
          useAnnotationStore.getState().setTool('none')
        }
      }
    }

    if (activePointers.current.size === 2) {
      const [p1, p2] = Array.from(activePointers.current.values())
      pinchStartDistance.current = pointerDistance(p1, p2)
      pinchStartZoom.current = zoom
      panStart.current = null
    } else if (activePointers.current.size === 1 && e.pointerType === 'touch' && bodyRef.current) {
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: bodyRef.current.scrollLeft,
        scrollTop: bodyRef.current.scrollTop
      }
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
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      setZoom((z) => {
        zoomAnchor.current = { clientX: midX, clientY: midY, prevZoom: z }
        return clampZoom(pinchStartZoom.current * scale)
      })
      return
    }

    if (activePointers.current.size === 1 && panStart.current && bodyRef.current) {
      e.preventDefault()
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      bodyRef.current.scrollLeft = panStart.current.scrollLeft - dx
      bodyRef.current.scrollTop = panStart.current.scrollTop - dy
    }
  }

  const handleBodyPointerEnd = (e: React.PointerEvent<HTMLDivElement>): void => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) {
      pinchStartDistance.current = null
    }
    if (activePointers.current.size === 0) {
      panStart.current = null
    }

    if (e.pointerType === 'touch') {
      activeTouchPointers.current.delete(e.pointerId)
      if (activeTouchPointers.current.size === 0 && disabledTool.current) {
        useAnnotationStore.getState().setTool(disabledTool.current)
        disabledTool.current = null
      }
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
