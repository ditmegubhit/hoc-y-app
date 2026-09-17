import { useEffect, useRef, useState } from 'react'
import { usePageImage } from '@renderer/queries/attachmentView'
import type { AnatomyLabelCandidate, Rect } from '@shared/types/anatomyQuiz'

interface AnatomyPageReviewCanvasProps {
  attachmentId: string
  pageNumber: number
  candidates: AnatomyLabelCandidate[]
  // 'edit' (mac dinh): anh day du, o la khung mau theo status, click chon,
  // ve o moi qua keo tha. 'fill': o CURRENTCANDIDATEID duoc phu den mo (con
  // doc chu) + vien vang, MOI o KHAC che den kin - chi xem, khong ve/chon.
  mode?: 'edit' | 'fill'
  currentCandidateId?: string | null
  selectedId?: string | null
  onSelect?: (candidateId: string) => void
  // Nguoi soan tu ve 1 o moi tren anh (thuat toan bo sot, hoac muon hoi 1 vi
  // tri khong co san chu thich rieng) - box theo toa do pixel cua anh goc.
  onDrawNewBox?: (box: Rect, refWidth: number, refHeight: number) => void
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#facc15',
  confirmed: '#4ade80',
  rejected: '#6b7280'
}

const MIN_DRAW_SIZE = 6 // px hien thi, duoi muc nay coi la bam nham (khong phai ve)

function AnatomyPageReviewCanvas({
  attachmentId,
  pageNumber,
  candidates,
  mode = 'edit',
  currentCandidateId = null,
  selectedId = null,
  onSelect,
  onDrawNewBox
}: AnatomyPageReviewCanvasProps): React.JSX.Element {
  const pageImage = usePageImage(attachmentId, 'page', pageNumber, true)
  const imgRef = useRef<HTMLImageElement>(null)
  const [displayedWidth, setDisplayedWidth] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const update = (): void => setDisplayedWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pageImage.data])

  const scale = displayedWidth > 0 && naturalSize ? displayedWidth / naturalSize.width : 0

  const toDisplayPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    if (!imgRef.current) return null
    const rect = imgRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (mode !== 'edit') return
    const p = toDisplayPoint(e)
    if (!p) return
    drawing.current = true
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!drawing.current) return
    const p = toDisplayPoint(e)
    if (!p || !draft) return
    setDraft({ ...draft, x1: p.x, y1: p.y })
  }

  const handlePointerUp = (): void => {
    if (!drawing.current || !draft || scale === 0 || !naturalSize) {
      drawing.current = false
      setDraft(null)
      return
    }
    drawing.current = false
    const width = Math.abs(draft.x1 - draft.x0)
    const height = Math.abs(draft.y1 - draft.y0)
    if (width >= MIN_DRAW_SIZE && height >= MIN_DRAW_SIZE) {
      const box: Rect = {
        x0: Math.min(draft.x0, draft.x1) / scale,
        y0: Math.min(draft.y0, draft.y1) / scale,
        x1: Math.max(draft.x0, draft.x1) / scale,
        y1: Math.max(draft.y0, draft.y1) / scale
      }
      onDrawNewBox?.(box, naturalSize.width, naturalSize.height)
    }
    setDraft(null)
  }

  return (
    <div className="anatomy-review-canvas-wrap">
      {pageImage.data ? (
        <>
          <img
            ref={imgRef}
            className="anatomy-review-canvas-image"
            src={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`}
            alt={`Trang ${pageNumber}`}
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
              setDisplayedWidth(img.clientWidth)
            }}
          />
          {scale > 0 && naturalSize && (
            <svg
              className="anatomy-review-canvas-overlay"
              width={displayedWidth}
              height={displayedWidth * (naturalSize.height / naturalSize.width)}
              style={{ cursor: mode === 'edit' ? 'crosshair' : 'default' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {mode === 'fill'
                ? candidates.map((c) => {
                    const box = c.labelBox
                    const isCurrent = c.id === currentCandidateId
                    return (
                      <rect
                        key={c.id}
                        x={box.x0 * scale}
                        y={box.y0 * scale}
                        width={(box.x1 - box.x0) * scale}
                        height={(box.y1 - box.y0) * scale}
                        className={isCurrent ? 'anatomy-mask-box--current-outline' : 'anatomy-mask-box'}
                      />
                    )
                  })
                : candidates.map((c) => {
                    const isSelected = c.id === selectedId
                    const color = STATUS_COLOR[c.status] ?? '#facc15'
                    const box = c.labelBox
                    return (
                      <rect
                        key={c.id}
                        x={box.x0 * scale}
                        y={box.y0 * scale}
                        width={(box.x1 - box.x0) * scale}
                        height={(box.y1 - box.y0) * scale}
                        fill={isSelected ? 'rgba(74, 222, 128, 0.25)' : 'none'}
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeDasharray={isSelected ? undefined : '4 3'}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          onSelect?.(c.id)
                        }}
                      />
                    )
                  })}
              {draft && (
                <rect
                  x={Math.min(draft.x0, draft.x1)}
                  y={Math.min(draft.y0, draft.y1)}
                  width={Math.abs(draft.x1 - draft.x0)}
                  height={Math.abs(draft.y1 - draft.y0)}
                  fill="rgba(79, 172, 254, 0.25)"
                  stroke="#4facfe"
                  strokeWidth={2}
                />
              )}
            </svg>
          )}
        </>
      ) : (
        <div className="lesson-widget-placeholder">Đang tải ảnh...</div>
      )}
    </div>
  )
}

export default AnatomyPageReviewCanvas
