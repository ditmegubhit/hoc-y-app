import { useEffect, useRef, useState } from 'react'
import { usePageImage } from '@renderer/queries/attachmentView'
import type { AnatomyLabelCandidate, Rect } from '@shared/types/anatomyQuiz'

interface Props {
  attachmentId: string
  pageNumber: number
  candidates: AnatomyLabelCandidate[]
  mode?: 'edit' | 'fill' | 'preview'
  editTool?: 'select' | 'add' | 'crop'
  currentCandidateId?: string | null
  selectedId?: string | null
  onSelect?: (candidateId: string) => void
  onDrawNewBox?: (box: Rect, refWidth: number, refHeight: number) => void
  onUpdateBox?: (candidateId: string, box: Rect) => void
  onSetCrop?: (box: Rect) => void
}

const STATUS_COLOR: Record<string, string> = { pending: '#facc15', confirmed: '#4ade80', rejected: '#6b7280' }
const MIN_SIZE = 6
type Drag = { kind: 'draw' | 'move' | 'resize'; id?: string; startX: number; startY: number; original?: Rect }

export default function AnatomyPageReviewCanvas({
  attachmentId, pageNumber, candidates, mode = 'edit', editTool = 'select',
  currentCandidateId = null, selectedId = null, onSelect, onDrawNewBox, onUpdateBox, onSetCrop
}: Props): React.JSX.Element {
  const pageImage = usePageImage(attachmentId, 'page', pageNumber, true)
  const imgRef = useRef<HTMLImageElement>(null)
  const [displayedWidth, setDisplayedWidth] = useState(0)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [draft, setDraft] = useState<Rect | null>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const image = imgRef.current
    if (!image) return
    const update = (): void => setDisplayedWidth(image.clientWidth)
    update(); const observer = new ResizeObserver(update); observer.observe(image)
    return () => observer.disconnect()
  }, [pageImage.data])

  const scale = displayedWidth > 0 && natural ? displayedWidth / natural.width : 0
  const point = (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const image = imgRef.current
    if (!image) return null
    const rect = image.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const toNatural = (box: Rect): Rect => ({ x0: box.x0 / scale, y0: box.y0 / scale, x1: box.x1 / scale, y1: box.y1 / scale })

  const startDraw = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (mode !== 'edit' || editTool === 'select') return
    const p = point(event); if (!p) return
    drag.current = { kind: 'draw', startX: p.x, startY: p.y }
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startCandidateDrag = (event: React.PointerEvent<SVGRectElement>, candidate: AnatomyLabelCandidate, kind: 'move' | 'resize'): void => {
    if (mode !== 'edit' || editTool !== 'select') return
    event.stopPropagation(); onSelect?.(candidate.id)
    const p = point(event); if (!p) return
    const original = { x0: candidate.labelBox.x0 * scale, y0: candidate.labelBox.y0 * scale, x1: candidate.labelBox.x1 * scale, y1: candidate.labelBox.y1 * scale }
    drag.current = { kind, id: candidate.id, startX: p.x, startY: p.y, original }
    setDraft(original)
  }
  const move = (event: React.PointerEvent<SVGSVGElement>): void => {
    const active = drag.current; const p = point(event)
    if (!active || !p || !draft) return
    if (active.kind === 'draw') setDraft({ x0: active.startX, y0: active.startY, x1: p.x, y1: p.y })
    else if (active.kind === 'move' && active.original) {
      const dx = p.x - active.startX; const dy = p.y - active.startY
      setDraft({ x0: active.original.x0 + dx, y0: active.original.y0 + dy, x1: active.original.x1 + dx, y1: active.original.y1 + dy })
    } else if (active.original) setDraft({ ...active.original, x1: Math.max(active.original.x0 + MIN_SIZE, p.x), y1: Math.max(active.original.y0 + MIN_SIZE, p.y) })
  }
  const finish = (): void => {
    const active = drag.current
    if (!active || !draft || !natural || scale === 0) { drag.current = null; setDraft(null); return }
    const normalized = { x0: Math.min(draft.x0, draft.x1), y0: Math.min(draft.y0, draft.y1), x1: Math.max(draft.x0, draft.x1), y1: Math.max(draft.y0, draft.y1) }
    if (normalized.x1 - normalized.x0 >= MIN_SIZE && normalized.y1 - normalized.y0 >= MIN_SIZE) {
      const box = toNatural(normalized)
      if (active.kind === 'draw') {
        if (editTool === 'crop') onSetCrop?.(box)
        else onDrawNewBox?.(box, natural.width, natural.height)
      } else if (active.id) onUpdateBox?.(active.id, box)
    }
    drag.current = null; setDraft(null)
  }

  const selected = candidates.find((candidate) => candidate.id === selectedId)
  return <div className="anatomy-review-canvas-wrap">
    {pageImage.data ? <>
      <img ref={imgRef} className="anatomy-review-canvas-image"
        src={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`} alt={`Trang ${pageNumber}`}
        onLoad={(event) => { setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setDisplayedWidth(event.currentTarget.clientWidth) }} />
      {scale > 0 && natural && <svg className="anatomy-review-canvas-overlay" width={displayedWidth}
        height={displayedWidth * natural.height / natural.width}
        style={{ cursor: mode === 'edit' && editTool !== 'select' ? 'crosshair' : 'default' }}
        onPointerDown={startDraw} onPointerMove={move} onPointerUp={finish} onPointerLeave={finish}>
        {mode === 'fill' || mode === 'preview' ? candidates.map((candidate) => {
          const box = candidate.labelBox; const current = candidate.id === currentCandidateId
          return <rect key={candidate.id} x={box.x0 * scale} y={box.y0 * scale}
            width={(box.x1 - box.x0) * scale} height={(box.y1 - box.y0) * scale}
            className={mode === 'preview'
              ? (current ? 'anatomy-mask-box anatomy-mask-box--preview-target' : 'anatomy-mask-box')
              : (current ? 'anatomy-mask-box--current-outline' : 'anatomy-mask-box--authoring')} />
        }) : candidates.map((candidate) => {
          const box = candidate.labelBox; const selectedNow = candidate.id === selectedId
          return <rect key={candidate.id} x={box.x0 * scale} y={box.y0 * scale}
            width={(box.x1 - box.x0) * scale} height={(box.y1 - box.y0) * scale}
            fill={selectedNow ? 'rgba(74,222,128,.3)' : 'rgba(17,24,39,.08)'}
            stroke={STATUS_COLOR[candidate.status] ?? '#facc15'} strokeWidth={selectedNow ? 3 : 1.5}
            strokeDasharray={selectedNow ? undefined : '4 3'} style={{ cursor: editTool === 'select' ? 'move' : 'crosshair' }}
            onPointerDown={(event) => startCandidateDrag(event, candidate, 'move')} />
        })}
        {mode === 'edit' && selected?.cropBox && <rect x={selected.cropBox.x0 * scale} y={selected.cropBox.y0 * scale}
          width={(selected.cropBox.x1 - selected.cropBox.x0) * scale} height={(selected.cropBox.y1 - selected.cropBox.y0) * scale}
          fill="none" stroke="#22d3ee" strokeWidth="3" strokeDasharray="8 5" />}
        {mode === 'edit' && selected && editTool === 'select' && <rect
          x={selected.labelBox.x1 * scale - 6} y={selected.labelBox.y1 * scale - 6} width="12" height="12"
          fill="#fff" stroke="#16a34a" strokeWidth="2" style={{ cursor: 'nwse-resize' }}
          onPointerDown={(event) => startCandidateDrag(event, selected, 'resize')} />}
        {draft && <rect x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)}
          width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)}
          fill="rgba(79,172,254,.25)" stroke="#4facfe" strokeWidth="2" />}
      </svg>}
    </> : <div className="lesson-widget-placeholder">Đang tải ảnh...</div>}
  </div>
}
