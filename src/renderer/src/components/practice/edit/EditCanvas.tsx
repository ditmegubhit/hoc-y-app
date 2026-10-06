import { memo, useMemo, useRef, useState } from 'react'
import type { PracticeRegion, Rect } from '@shared/types/practice'
import {
  MIN_BOX_SIZE,
  RESIZE_HANDLES,
  clampRectToImage,
  cycleHit,
  handlePosition,
  hitCandidates,
  moveRect,
  pickHit,
  pointInRect,
  rectFromPoints,
  rectHeight,
  rectWidth,
  regionVisualState,
  resizeRectByHandle,
  sameRect,
  scaleRect,
  suspectReasonText,
  type Point,
  type ResizeHandle
} from '@shared/practice/editLogic'
import { contrastingMarkerColor, resolveRegionMaskColor, resolveRegionMaskOpacity } from '@shared/practice/maskColor'
import type { PracticePageGeometry } from '@renderer/components/practice/PracticePageViewer'
import type { EditMode, EditTool } from './editTypes'

// Lop phu SVG tren trang: ve cac o che (mau rieng ?? mau chung, do mo rieng ?? do mo chung),
// vien theo trang thai, vung nghi rac bang nen doi nghich + nhan ly do; cho keo di chuyen /
// doi co vung dang chon, ve vung moi, ve khung crop. Toa do SVG = toa do ANH.
// Luc dang keo chi giu trang thai cuc bo (draft), chi bao ra ngoai khi tha chuot.

const HIT_TOLERANCE_PX = 4
const HANDLE_PX = 9
const EDGE_HANDLE_MIN_PX = 24
const CLICK_MOVE_PX = 3
const SUSPECT_MIN_OPACITY = 0.45

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

type DragKind = 'move' | 'resize' | 'draw' | 'crop'

interface DragState {
  kind: DragKind
  regionId: string | null
  handle: ResizeHandle | null
  start: Point
  original: Rect | null
  moved: boolean
  wasSelected: boolean
  candidates: string[]
}

interface Draft {
  kind: DragKind
  regionId: string | null
  rect: Rect
}

export interface EditCanvasProps {
  geom: PracticePageGeometry
  /** Cac vung cua trang dang xem. */
  regions: PracticeRegion[]
  fileMaskColor: string
  fileMaskOpacity: number
  mode: EditMode
  tool: EditTool
  /** Vung dang chon (chon vung) / dang xet (trinh tu). */
  activeId: string | null
  onSelect: (id: string | null) => void
  /** box theo he toa do tham chieu cua vung (refWidth x refHeight). */
  onCommitBox: (region: PracticeRegion, box: Rect) => void
  onCommitCrop: (region: PracticeRegion, crop: Rect) => void
  /** box theo toa do ANH. */
  onDrawRegion: (box: Rect, imageWidth: number, imageHeight: number) => void
  /** Goi sau moi thao tac chuot (de dua con tro ve o dap an). */
  onSettle: () => void
}

function fillOf(region: PracticeRegion, fileColor: string, fileOpacity: number): { fill: string; fillOpacity: number } {
  const color = resolveRegionMaskColor(region.colorOverride, fileColor)
  const opacity = resolveRegionMaskOpacity(region.opacityOverride, fileOpacity)
  if (region.suspect) return { fill: contrastingMarkerColor(color), fillOpacity: Math.max(opacity, SUSPECT_MIN_OPACITY) }
  return { fill: color, fillOpacity: opacity }
}

interface LabelProps {
  region: PracticeRegion
  box: Rect
  scale: number
  imageHeight: number
}

function SuspectLabel({ region, box, scale, imageHeight }: LabelProps): React.JSX.Element {
  const fontSize = 10.5 / scale
  const above = box.y0 > fontSize * 1.6 || box.y1 + fontSize * 1.6 > imageHeight
  return (
    <text
      className="pe-suspect-text"
      x={box.x0}
      y={above ? box.y0 - 3 / scale : box.y1 + fontSize + 2 / scale}
      fontSize={fontSize}
      strokeWidth={3 / scale}
    >
      Nghi rác: {suspectReasonText(region)}
    </text>
  )
}

interface LayerProps {
  regions: PracticeRegion[]
  boxes: Map<string, Rect>
  fileMaskColor: string
  fileMaskOpacity: number
  skipId: string | null
  scale: number
  imageHeight: number
}

// Lop cac vung KHONG phai vung dang xet: nhom lai de khong ve lai khi dang keo.
const RegionLayer = memo(function RegionLayer({
  regions,
  boxes,
  fileMaskColor,
  fileMaskOpacity,
  skipId,
  scale,
  imageHeight
}: LayerProps): React.JSX.Element {
  return (
    <>
      {regions.map((region) => {
        if (region.id === skipId) return null
        const box = boxes.get(region.id)
        if (!box) return null
        const state = regionVisualState(region)
        return (
          <g key={region.id}>
            <rect
              className={`pe-region is-${state}${region.suspect ? ' is-suspect' : ''}`}
              x={box.x0}
              y={box.y0}
              width={Math.max(1, rectWidth(box))}
              height={Math.max(1, rectHeight(box))}
              style={fillOf(region, fileMaskColor, fileMaskOpacity)}
              vectorEffect="non-scaling-stroke"
            />
            {region.suspect && <SuspectLabel region={region} box={box} scale={scale} imageHeight={imageHeight} />}
          </g>
        )
      })}
    </>
  )
})

export default function EditCanvas(props: EditCanvasProps): React.JSX.Element {
  const { geom, regions, fileMaskColor, fileMaskOpacity, mode, tool, activeId } = props
  const { imageWidth: W, imageHeight: H, scale } = geom
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const lastRectRef = useRef<Rect | null>(null)
  const suppressClickRef = useRef(false)
  const latest = useRef(props)
  latest.current = props

  const boxes = useMemo(() => {
    const map = new Map<string, Rect>()
    for (const region of regions) map.set(region.id, scaleRect(region.labelBox, region.refWidth, region.refHeight, W, H))
    return map
  }, [regions, W, H])
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes

  const active = activeId ? (regions.find((r) => r.id === activeId) ?? null) : null
  const activeBase = active ? (boxes.get(active.id) ?? null) : null
  const draggingActive = draft && draft.regionId === active?.id && (draft.kind === 'move' || draft.kind === 'resize')
  const activeBox = draggingActive && draft ? draft.rect : activeBase

  const toImagePoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height }
  }
  const clampPoint = (p: Point): Point => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) })

  const beginDrag = (e: React.PointerEvent, state: DragState): void => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = state
    lastRectRef.current = state.original
    setDraft(state.original ? { kind: state.kind, regionId: state.regionId, rect: state.original } : null)

    const onMove = (ev: PointerEvent): void => {
      const d = dragRef.current
      if (!d) return
      const p = toImagePoint(ev)
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      if (!d.moved && Math.hypot(dx, dy) * scale >= CLICK_MOVE_PX) d.moved = true
      if (!d.moved) return
      let rect: Rect
      if (d.kind === 'move' && d.original) rect = moveRect(d.original, dx, dy, W, H)
      else if (d.kind === 'resize' && d.original && d.handle) rect = resizeRectByHandle(d.original, d.handle, dx, dy, W, H)
      else rect = rectFromPoints(d.start, clampPoint(p))
      lastRectRef.current = rect
      setDraft({ kind: d.kind, regionId: d.regionId, rect })
    }

    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      const d = dragRef.current
      const finalRect = lastRectRef.current
      dragRef.current = null
      lastRectRef.current = null
      setDraft(null)
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      const L = latest.current
      if (commit && d) {
        const region = d.regionId ? (L.regions.find((r) => r.id === d.regionId) ?? null) : null
        if ((d.kind === 'move' || d.kind === 'resize') && region) {
          if (d.moved && finalRect && d.original) {
            if (!sameRect(finalRect, d.original, 0.5)) {
              L.onCommitBox(region, scaleRect(finalRect, W, H, region.refWidth, region.refHeight))
            }
          } else if (d.kind === 'move' && d.wasSelected && L.mode === 'select') {
            // Bam (khong keo) vao vung dang chon: xoay vong sang vung chong len nhau.
            const next = cycleHit(d.candidates, d.regionId)
            if (next && next !== d.regionId) L.onSelect(next)
          }
        } else if (d.kind === 'draw' && finalRect) {
          if (rectWidth(finalRect) >= MIN_BOX_SIZE && rectHeight(finalRect) >= MIN_BOX_SIZE) {
            L.onDrawRegion(clampRectToImage(finalRect, W, H), W, H)
          }
        } else if (d.kind === 'crop' && finalRect) {
          const target = L.activeId ? (L.regions.find((r) => r.id === L.activeId) ?? null) : null
          if (target && rectWidth(finalRect) >= MIN_BOX_SIZE * 2 && rectHeight(finalRect) >= MIN_BOX_SIZE * 2) {
            L.onCommitCrop(target, scaleRect(clampRectToImage(finalRect, W, H), W, H, target.refWidth, target.refHeight))
          }
        }
      }
      L.onSettle()
    }
    const onUp = (): void => finish(true)
    const onCancel = (): void => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const handleLayerPointerDown = (e: React.PointerEvent<SVGGElement>): void => {
    if (e.button !== 0 || tool !== 'select') return
    const p = toImagePoint(e)
    const tolerance = HIT_TOLERANCE_PX / scale
    if (mode === 'sequence') {
      // Trinh tu: chi vung hien hanh duoc keo; cac vung khac chi de nhin.
      if (!activeId || !activeBase || !pointInRect(activeBase, p.x, p.y, tolerance)) return
      beginDrag(e, { kind: 'move', regionId: activeId, handle: null, start: p, original: activeBase, moved: false, wasSelected: true, candidates: [activeId] })
      return
    }
    const items = regions.flatMap((r) => {
      const box = boxesRef.current.get(r.id)
      return box ? [{ id: r.id, box }] : []
    })
    const candidates = hitCandidates(items, p.x, p.y, tolerance)
    const picked = pickHit(candidates, activeId)
    const pickedBox = picked ? boxesRef.current.get(picked) : null
    if (!picked || !pickedBox) return
    if (picked !== activeId) props.onSelect(picked)
    beginDrag(e, {
      kind: 'move',
      regionId: picked,
      handle: null,
      start: p,
      original: pickedBox,
      moved: false,
      wasSelected: picked === activeId,
      candidates
    })
  }

  const handleToolPointerDown = (e: React.PointerEvent<SVGRectElement>): void => {
    if (e.button !== 0) return
    if (tool === 'crop' && !active) return
    const start = clampPoint(toImagePoint(e))
    beginDrag(e, {
      kind: tool === 'draw' ? 'draw' : 'crop',
      regionId: null,
      handle: null,
      start,
      original: null,
      moved: false,
      wasSelected: false,
      candidates: []
    })
  }

  const handleHandlePointerDown = (e: React.PointerEvent<SVGRectElement>, handle: ResizeHandle): void => {
    if (e.button !== 0 || !activeId || !activeBase) return
    beginDrag(e, { kind: 'resize', regionId: activeId, handle, start: toImagePoint(e), original: activeBase, moved: false, wasSelected: true, candidates: [] })
  }

  const cropBase = active?.cropBox
    ? scaleRect(active.cropBox, active.refWidth, active.refHeight, W, H)
    : null
  const cropDraft = draft && draft.kind === 'crop' ? draft.rect : null
  const cropRect = cropDraft ?? cropBase
  const drawDraft = draft && draft.kind === 'draw' ? draft.rect : null

  const handleSize = HANDLE_PX / scale
  const showHandles = tool === 'select' && active && activeBox && draft?.kind !== 'move' && draft?.kind !== 'draw' && draft?.kind !== 'crop'

  return (
    <svg
      ref={svgRef}
      className={`pe-canvas is-${mode} is-tool-${tool}`}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      onClick={(e) => {
        if (suppressClickRef.current) return
        if (e.target === e.currentTarget && mode === 'select' && tool === 'select') props.onSelect(null)
      }}
    >
      <g data-viewer-no-pan="" onPointerDown={handleLayerPointerDown}>
        <RegionLayer
          regions={regions}
          boxes={boxes}
          fileMaskColor={fileMaskColor}
          fileMaskOpacity={fileMaskOpacity}
          skipId={activeId}
          scale={scale}
          imageHeight={H}
        />
        {active && activeBox && (
          <g>
            <rect
              className="pe-active-halo"
              x={activeBox.x0}
              y={activeBox.y0}
              width={Math.max(1, rectWidth(activeBox))}
              height={Math.max(1, rectHeight(activeBox))}
              vectorEffect="non-scaling-stroke"
            />
            <rect
              className={`pe-region is-active is-${regionVisualState(active)}${active.suspect ? ' is-suspect' : ''}`}
              x={activeBox.x0}
              y={activeBox.y0}
              width={Math.max(1, rectWidth(activeBox))}
              height={Math.max(1, rectHeight(activeBox))}
              style={fillOf(active, fileMaskColor, fileMaskOpacity)}
              vectorEffect="non-scaling-stroke"
            />
            {active.suspect && <SuspectLabel region={active} box={activeBox} scale={scale} imageHeight={H} />}
          </g>
        )}
      </g>

      {cropRect && (
        <g className="pe-crop-group" pointerEvents="none">
          <rect
            className="pe-crop"
            x={cropRect.x0}
            y={cropRect.y0}
            width={Math.max(1, rectWidth(cropRect))}
            height={Math.max(1, rectHeight(cropRect))}
            vectorEffect="non-scaling-stroke"
          />
          <text className="pe-crop-text" x={cropRect.x0 + 3 / scale} y={cropRect.y0 + 12 / scale} fontSize={10.5 / scale} strokeWidth={3 / scale}>
            Khung crop
          </text>
        </g>
      )}

      {drawDraft && (
        <rect
          className="pe-draft"
          x={drawDraft.x0}
          y={drawDraft.y0}
          width={Math.max(1, rectWidth(drawDraft))}
          height={Math.max(1, rectHeight(drawDraft))}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {tool !== 'select' && (
        <rect className="pe-catch" x={0} y={0} width={W} height={H} data-viewer-no-pan="" onPointerDown={handleToolPointerDown} />
      )}

      {showHandles && activeBox && (
        <g data-viewer-no-pan="">
          {RESIZE_HANDLES.filter((handle) => {
            // Vung nho tren man hinh: tay cam canh (n/s/e/w) phu kin giua vung nen khong keo di chuyen duoc
            // (bam giua trung tay cam) -> chi giu 4 tay cam goc cho den khi vung du lon.
            if (handle === 'n' || handle === 's') return rectHeight(activeBox) * scale >= EDGE_HANDLE_MIN_PX
            if (handle === 'e' || handle === 'w') return rectWidth(activeBox) * scale >= EDGE_HANDLE_MIN_PX
            return true
          }).map((handle) => {
            const pos = handlePosition(activeBox, handle)
            return (
              <rect
                key={handle}
                className="pe-handle"
                x={pos.x - handleSize / 2}
                y={pos.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                style={{ cursor: HANDLE_CURSOR[handle] }}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => handleHandlePointerDown(e, handle)}
              />
            )
          })}
        </g>
      )}
    </svg>
  )
}
