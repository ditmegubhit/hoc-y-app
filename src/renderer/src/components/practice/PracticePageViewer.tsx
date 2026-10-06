import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { usePageCount, usePageImage } from '@renderer/queries/attachmentView'
import type { Rect } from '@shared/types/practice'

// ============================================================================
// PracticePageViewer - xem MOT trang PDF cua file thuc hanh, vua khit khung.
//
// - Anh trang = pixel cua trang o RENDER_SCALE (usePageImage, id file thuc hanh
//   dung chung attachments.getPageImage). Anh luon duoc dat theo kieu "contain":
//   giu dung ti le, KHONG keo gian, khong thanh cuon - vua trong khung (tru le
//   nho PADDING moi ben).
// - Ctrl + lan chuot (hoac pinch tren touchpad) = zoom quanh con tro; khi da zoom
//   (zoom > 1) keo chuot de di chuyen, lan chuot (khong Ctrl) cung di chuyen.
//   Nut "Vua khit" (goc duoi phai) ve lai ca trang.
// - Doi trang / doi file / doi kich thuoc khung / doi `resetKey` thi tu ve vua khit.
//
// HE TOA DO LOP PHU (renderOverlay):
//   renderOverlay(geom) duoc render ben trong mot div position:absolute phu DUNG
//   len anh (kich thuoc displayWidth x displayHeight px, di chuyen/zoom cung anh).
//   Nen dung <svg viewBox={`0 0 ${geom.imageWidth} ${geom.imageHeight}`}
//   width="100%" height="100%"> -> toa do ben trong svg la TOA DO ANH (pixel anh
//   da render), khong can tu nhan scale. Neu ve bang DOM thuong thi nhan
//   geom.scale (= displayWidth / imageWidth).
//   Vung (PracticeRegion) luu toa do trong he refWidth x refHeight; doi sang toa do
//   anh bang scaleRectToImage(rect, refWidth, refHeight, imageWidth, imageHeight)
//   (thuong refWidth == imageWidth nen he so = 1, nhung LUON quy doi de an toan).
//   Chuot -> toa do anh: lay getBoundingClientRect() cua lop phu, roi
//   x = (clientX - rect.left) / geom.scale, y = (clientY - rect.top) / geom.scale.
//   Phan tu tuong tac trong lop phu nen them thuoc tinh data-viewer-no-pan (hoac
//   stopPropagation o pointerdown) de khong bi coi la keo di chuyen trang.
//   Neu can ve bang chuot o muc zoom > 1: dat primaryPan={false} -> chi nut giua
//   chuot keo di chuyen, chuot trai danh cho lop phu.
// ============================================================================

export interface PracticePageGeometry {
  imageWidth: number
  imageHeight: number
  displayWidth: number
  displayHeight: number
  // displayWidth / imageWidth
  scale: number
}

export interface PracticePageViewerProps {
  fileId: string
  pageNumber: number
  onPageChange?: (page: number) => void
  // Mac dinh lay tu usePageCount.
  totalPages?: number | null
  renderOverlay?: (geom: PracticePageGeometry) => React.ReactNode
  // Thanh dieu huong tren khung (trang truoc/sau + o nhap so trang). Can onPageChange.
  showNav?: boolean
  // Doi gia tri nay thi ve vua khit (vd khi doi bo cuc ben ngoai).
  resetKey?: string | number
  // true (mac dinh): keo chuot trai len nen de di chuyen khi da zoom.
  primaryPan?: boolean
  hideZoomControls?: boolean
  className?: string
}

/** Doi hinh chu nhat tu he (refWidth x refHeight) sang toa do anh da render. */
export function scaleRectToImage(
  rect: Rect,
  refWidth: number,
  refHeight: number,
  imageWidth: number,
  imageHeight: number
): Rect {
  const sx = refWidth > 0 ? imageWidth / refWidth : 1
  const sy = refHeight > 0 ? imageHeight / refHeight : 1
  return { x0: rect.x0 * sx, y0: rect.y0 * sy, x1: rect.x1 * sx, y1: rect.y1 * sy }
}

const PADDING = 6
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const BUTTON_ZOOM_STEP = 1.25

interface ViewState {
  zoom: number
  pan: { x: number; y: number }
}

const FIT_VIEW: ViewState = { zoom: 1, pan: { x: 0, y: 0 } }

// Kich thuoc PNG doc thang tu IHDR (24 byte dau = 32 ky tu base64) - biet kich
// thuoc truoc khi anh giai ma xong, khong nhay bo cuc.
function readPngSize(base64: string): { width: number; height: number } | null {
  try {
    const bin = atob(base64.slice(0, 32))
    if (bin.length < 24) return null
    if (bin.charCodeAt(1) !== 0x50 || bin.charCodeAt(2) !== 0x4e || bin.charCodeAt(3) !== 0x47) return null
    const u32 = (o: number): number =>
      ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0
    const width = u32(16)
    const height = u32(20)
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function PracticePageViewer({
  fileId,
  pageNumber,
  onPageChange,
  totalPages,
  renderOverlay,
  showNav = false,
  resetKey,
  primaryPan = true,
  hideZoomControls = false,
  className
}: PracticePageViewerProps): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<ViewState>(FIT_VIEW)
  const [loadedSize, setLoadedSize] = useState<{ src: string; width: number; height: number } | null>(null)
  const [pageDraft, setPageDraft] = useState<string | null>(null)

  const pageCountQuery = usePageCount(fileId, totalPages === undefined)
  const total = totalPages !== undefined ? totalPages : (pageCountQuery.data ?? null)

  const pageImage = usePageImage(fileId, 'page', pageNumber, true)
  // Doc truoc trang ke tiep cho dieu huong muot.
  usePageImage(fileId, 'page', pageNumber + 1, showNav && total !== null && pageNumber < total)

  const src = pageImage.data ? `data:${pageImage.data.mimeType};base64,${pageImage.data.base64}` : null
  const pngSize = useMemo(() => (pageImage.data ? readPngSize(pageImage.data.base64) : null), [pageImage.data])
  const imageSize = pngSize ?? (loadedSize && loadedSize.src === src ? loadedSize : null)
  const imageWidth = imageSize?.width ?? 0
  const imageHeight = imageSize?.height ?? 0

  // ----- Kich thuoc khung -----
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setStage((prev) => (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ----- Hinh hoc -----
  const availableW = Math.max(0, stage.width - PADDING * 2)
  const availableH = Math.max(0, stage.height - PADDING * 2)
  const fit = imageWidth > 0 && imageHeight > 0 ? Math.min(availableW / imageWidth, availableH / imageHeight) : 0
  const scale = fit * view.zoom
  const displayWidth = imageWidth * scale
  const displayHeight = imageHeight * scale

  // Ref phan anh gia tri moi nhat cho cac listener native (wheel) - tranh closure cu.
  const latest = useRef({ stage, fit, imageWidth, imageHeight, availableW, availableH, zoom: view.zoom })
  useLayoutEffect(() => {
    latest.current = { stage, fit, imageWidth, imageHeight, availableW, availableH, zoom: view.zoom }
  })

  const clampPanLatest = (pan: { x: number; y: number }, zoom: number): { x: number; y: number } => {
    const l = latest.current
    const dw = l.imageWidth * l.fit * zoom
    const dh = l.imageHeight * l.fit * zoom
    const maxX = Math.max(0, (dw - l.availableW) / 2)
    const maxY = Math.max(0, (dh - l.availableH) / 2)
    return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) }
  }

  // Doi trang/file/khung/resetKey -> ve vua khit.
  useEffect(() => {
    setView(FIT_VIEW)
  }, [fileId, pageNumber, resetKey, stage.width, stage.height])

  const zoomTo = (compute: (zoom: number) => number, anchor?: { clientX: number; clientY: number }): void => {
    const el = stageRef.current
    setView((prev) => {
      const nextZoom = clamp(compute(prev.zoom), MIN_ZOOM, MAX_ZOOM)
      if (nextZoom === prev.zoom) return prev
      let qx = 0
      let qy = 0
      if (anchor && el) {
        const rect = el.getBoundingClientRect()
        qx = anchor.clientX - rect.left - latest.current.stage.width / 2
        qy = anchor.clientY - rect.top - latest.current.stage.height / 2
      }
      const ratio = nextZoom / prev.zoom
      const pan = { x: qx - (qx - prev.pan.x) * ratio, y: qy - (qy - prev.pan.y) * ratio }
      return { zoom: nextZoom, pan: clampPanLatest(pan, nextZoom) }
    })
  }

  // Ctrl+lan = zoom quanh con tro; lan thuong khi da zoom = di chuyen. Phai gan
  // native voi passive:false de preventDefault co tac dung.
  const zoomToRef = useRef(zoomTo)
  useLayoutEffect(() => {
    zoomToRef.current = zoomTo
  })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const step = Math.min(Math.abs(e.deltaY), 100) * 0.0016
        const factor = Math.exp(e.deltaY < 0 ? step : -step)
        zoomToRef.current((z) => z * factor, { clientX: e.clientX, clientY: e.clientY })
        return
      }
      if (latest.current.zoom <= MIN_ZOOM) return
      e.preventDefault()
      setView((prev) => {
        if (prev.zoom <= MIN_ZOOM) return prev
        return { zoom: prev.zoom, pan: clampPanLatest({ x: prev.pan.x - e.deltaX, y: prev.pan.y - e.deltaY }, prev.zoom) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- Keo de di chuyen -----
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; pan: { x: number; y: number } } | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.target instanceof Element && e.target.closest('[data-viewer-no-pan]')) return
    const isMiddle = e.button === 1
    if (!isMiddle && !(e.button === 0 && primaryPan)) return
    if (view.zoom <= MIN_ZOOM) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, pan: view.pan }
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const pan = { x: drag.pan.x + (e.clientX - drag.startX), y: drag.pan.y + (e.clientY - drag.startY) }
    setView((prev) => ({ zoom: prev.zoom, pan: clampPanLatest(pan, prev.zoom) }))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ----- Hien thi -----
  const geom: PracticePageGeometry | null =
    imageWidth > 0 && fit > 0
      ? { imageWidth, imageHeight, displayWidth, displayHeight, scale }
      : null

  const left = (stage.width - displayWidth) / 2 + view.pan.x
  const top = (stage.height - displayHeight) / 2 + view.pan.y
  const isFit = view.zoom === MIN_ZOOM

  const canNav = showNav && onPageChange !== undefined
  const commitPageDraft = (): void => {
    const draft = pageDraft
    setPageDraft(null)
    if (draft === null || !onPageChange) return
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n)) return
    const max = total ?? Number.MAX_SAFE_INTEGER
    const target = clamp(n, 1, max)
    if (target !== pageNumber) onPageChange(target)
  }

  const stageClass = `practice-viewer-stage${view.zoom > MIN_ZOOM && primaryPan ? ' is-pannable' : ''}${dragging ? ' is-dragging' : ''}`

  return (
    <div className={`practice-viewer${className ? ` ${className}` : ''}`}>
      {canNav && (
        <div className="practice-viewer-nav">
          <button
            type="button"
            title="Trang trước"
            disabled={pageNumber <= 1}
            onClick={() => onPageChange?.(pageNumber - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="practice-viewer-pageinput">
            <span>Trang</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Số trang"
              value={pageDraft ?? String(pageNumber)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setPageDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={commitPageDraft}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  setPageDraft(null)
                  e.currentTarget.blur()
                }
              }}
            />
            <span>/ {total ?? '…'}</span>
          </span>
          <button
            type="button"
            title="Trang sau"
            disabled={total !== null && pageNumber >= total}
            onClick={() => onPageChange?.(pageNumber + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className={stageClass}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {src && geom ? (
          <div
            className="practice-viewer-canvas"
            style={{ width: displayWidth, height: displayHeight, transform: `translate(${left}px, ${top}px)` }}
          >
            <img
              className="practice-viewer-img"
              src={src}
              alt={`Trang ${pageNumber}`}
              draggable={false}
              onLoad={(e) =>
                setLoadedSize({ src, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
              }
            />
            {renderOverlay && <div className="practice-viewer-overlay">{renderOverlay(geom)}</div>}
          </div>
        ) : src ? (
          // Chua biet kich thuoc (khong phai PNG) - cho onLoad.
          <img
            className="practice-viewer-probe"
            src={src}
            alt=""
            onLoad={(e) =>
              setLoadedSize({ src, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
            }
          />
        ) : (
          <div className="practice-viewer-status">
            {pageImage.isError || (pageImage.isSuccess && !pageImage.data)
              ? 'Không tải được trang này.'
              : 'Đang tải trang…'}
          </div>
        )}

        {!hideZoomControls && (
          <div className="practice-viewer-controls" data-viewer-no-pan="">
            <button
              type="button"
              title="Thu nhỏ (Ctrl + lăn chuột xuống)"
              disabled={isFit}
              onClick={() => zoomTo((z) => z / BUTTON_ZOOM_STEP)}
            >
              <ZoomOut size={14} />
            </button>
            <span className="practice-viewer-zoomvalue">{Math.round(view.zoom * 100)}%</span>
            <button
              type="button"
              title="Phóng to (Ctrl + lăn chuột lên)"
              disabled={view.zoom >= MAX_ZOOM}
              onClick={() => zoomTo((z) => z * BUTTON_ZOOM_STEP)}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              title="Đưa về cả trang vừa khít khung"
              disabled={isFit && view.pan.x === 0 && view.pan.y === 0}
              onClick={() => setView(FIT_VIEW)}
            >
              <Maximize size={14} /> Vừa khít
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PracticePageViewer
