import { useEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import type {
  HighlightColor,
  HighlightData,
  NewAnnotation,
  NoteData,
  Point,
  StrokeData
} from '@shared/types/annotation'

interface AnnotationLayerProps {
  pageNumber: number
  zoom: number
}

type Draft =
  | {
      kind: 'rect'
      startX: number
      startY: number
      x: number
      y: number
      width: number
      height: number
    }
  | { kind: 'stroke'; points: Point[] }

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const HIGHLIGHT_COLOR_HEX: Record<HighlightColor, string> = {
  red: '#ff6b6b',
  yellow: '#ffd43b',
  blue: '#4dabf7',
  white: '#ffffff',
  none: 'transparent'
}
const PENCIL_COLOR_HEX: Record<HighlightColor, string> = {
  red: '#e03131',
  yellow: '#e6a700',
  blue: '#1971c2',
  white: '#ffffff',
  none: 'transparent'
}
// Mau nen hop ghi chu dung chung bang mau voi highlight (thay vi chi dieu
// khien mau CHU nhu truoc) - "khong co mau" giu dung kieu Typewriter trong
// suot cu, chu luon 1 mau muc co dinh de doc duoc tren moi nen mau.
const NOTE_BG_HEX: Record<HighlightColor, string> = HIGHLIGHT_COLOR_HEX
const NOTE_TEXT_COLOR = '#1a1a1a'
const NOTE_MIN_WIDTH = 60
const NOTE_MIN_HEIGHT = 28
const DEFAULT_NOTE_FONT_SIZE = 14
const NOTE_MIN_FONT_SIZE = 6

function noteFontSize(d: NoteData): number {
  return d.fontSize ?? DEFAULT_NOTE_FONT_SIZE
}
// Net but chi thuong rat mong (1-2px), kho nhan dup trung chinh xac - luon
// danh 1 vung bat chuot toi thieu rong hon nhieu so voi net ve THAT, bat
// ke do day thuc te la bao nhieu.
const PENCIL_MIN_HIT_WIDTH = 16

// 'none'/thieu du lieu (ghi chu tao truoc khi co truong textColor) = mau
// muc mac dinh co dinh, khong phai mau trong suot nhu highlight/pencil.
function noteTextColorHex(textColor: HighlightColor | undefined): string {
  if (!textColor || textColor === 'none') return NOTE_TEXT_COLOR
  return PENCIL_COLOR_HEX[textColor]
}

function pointsToPath(points: Point[], zoom: number): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * zoom} ${p.y * zoom}`).join(' ')
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Xoa tu do (nhu tay xoa that): tach mang diem cua 1 net but chi thanh nhieu
// doan rieng biet tai vi tri con tro tay xoa di qua (trong ban kinh radius),
// giu lai cac doan con nguyen ven o 2 dau.
function splitStrokeAtEraser(points: Point[], eraserPos: Point, radius: number): Point[][] {
  const segments: Point[][] = []
  let current: Point[] = []
  for (const p of points) {
    if (Math.hypot(p.x - eraserPos.x, p.y - eraserPos.y) <= radius) {
      if (current.length > 1) segments.push(current)
      current = []
    } else {
      current.push(p)
    }
  }
  if (current.length > 1) segments.push(current)
  if (segments.length === 0 && current.length <= 1) {
    return []
  }
  return segments.length > 0 ? segments : [points]
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

// Khung bao (bounding box) cua 1 chi tiet - dung de ve hinh chu nhat net
// dut + 4 hinh vuong o goc khi chon, va lam co so tinh resize. Voi highlight
// day chinh la du lieu that; voi but chi la khung bao nho nhat chua tat ca
// diem cua net ve.
function getBoundingBox(a: NewAnnotation): Rect | null {
  if (a.type === 'highlight' || a.type === 'note') {
    const d = a.data as HighlightData | NoteData
    return { x: d.x, y: d.y, width: d.width, height: d.height }
  }
  if (a.type === 'pencil') {
    const d = a.data as StrokeData
    if (d.points.length === 0) return null
    let minX = d.points[0].x
    let maxX = d.points[0].x
    let minY = d.points[0].y
    let maxY = d.points[0].y
    for (const p of d.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  return null
}

// Tinh khung bao MOI khi keo 1 goc (corner) - goc DOI DIEN voi corner dang
// keo luon giu co dinh (lam diem neo), chi goc dang keo di chuyen theo con
// tro. minWidth/minHeight chan khong cho khung bao qua nho/lat nguoc.
function resizeBoxFromCorner(
  box: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number
): Rect {
  const { x, y, width, height } = box
  if (corner === 'se') {
    return { x, y, width: Math.max(minWidth, width + dx), height: Math.max(minHeight, height + dy) }
  }
  if (corner === 'sw') {
    const w = Math.max(minWidth, width - dx)
    return { x: x + width - w, y, width: w, height: Math.max(minHeight, height + dy) }
  }
  if (corner === 'ne') {
    const h = Math.max(minHeight, height - dy)
    return { x, y: y + height - h, width: Math.max(minWidth, width + dx), height: h }
  }
  const w = Math.max(minWidth, width - dx)
  const h = Math.max(minHeight, height - dy)
  return { x: x + width - w, y: y + height - h, width: w, height: h }
}

// Highlight phai luon giu hinh CHU NHAT (yeu cau cua user), nen tay xoa
// khong the "khoet" tu do nhu but chi - thay vao do lay hinh vuong quanh
// con tro tay xoa lam "lo cat", tru lo do khoi hinh chu nhat highlight,
// tra ve toi da 4 hinh chu nhat con lai bao quanh (tren/duoi/trai/phai) -
// giong cach cac trinh do hoa "subtract rectangle" pho bien.
function subtractRect(rect: HighlightData, hole: Rect): HighlightData[] {
  if (!rectsOverlap(rect, hole)) return [rect]
  const rx1 = rect.x
  const ry1 = rect.y
  const rx2 = rect.x + rect.width
  const ry2 = rect.y + rect.height
  const hx1 = Math.max(rx1, hole.x)
  const hy1 = Math.max(ry1, hole.y)
  const hx2 = Math.min(rx2, hole.x + hole.width)
  const hy2 = Math.min(ry2, hole.y + hole.height)

  const pieces: HighlightData[] = []
  if (hy1 > ry1) pieces.push({ ...rect, x: rx1, y: ry1, width: rect.width, height: hy1 - ry1 })
  if (hy2 < ry2) pieces.push({ ...rect, x: rx1, y: hy2, width: rect.width, height: ry2 - hy2 })
  if (hx1 > rx1) pieces.push({ ...rect, x: rx1, y: hy1, width: hx1 - rx1, height: hy2 - hy1 })
  if (hx2 < rx2) pieces.push({ ...rect, x: hx2, y: hy1, width: rx2 - hx2, height: hy2 - hy1 })
  return pieces.filter((p) => p.width > 0.5 && p.height > 0.5)
}

function eraseAtPoint(
  annotations: NewAnnotation[],
  pageNumber: number,
  point: Point,
  radius: number
): { changed: boolean; next: NewAnnotation[] } {
  let changed = false
  const next: NewAnnotation[] = []
  const hole: Rect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }

  for (const a of annotations) {
    if (a.pageNumber !== pageNumber) {
      next.push(a)
      continue
    }

    if (a.type === 'pencil') {
      const d = a.data as StrokeData
      let hits = false
      for (let i = 0; i < d.points.length - 1; i++) {
        if (distanceToSegment(point, d.points[i], d.points[i + 1]) <= radius) {
          hits = true
          break
        }
      }
      if (!hits && d.points.length === 1) {
        hits = Math.hypot(d.points[0].x - point.x, d.points[0].y - point.y) <= radius
      }
      if (!hits) {
        next.push(a)
        continue
      }
      changed = true
      const segments = splitStrokeAtEraser(d.points, point, radius)
      for (const seg of segments) {
        next.push({ id: crypto.randomUUID(), pageNumber, type: 'pencil', data: { ...d, points: seg } })
      }
      continue
    }

    if (a.type === 'highlight') {
      const d = a.data as HighlightData
      if (!rectsOverlap(d, hole)) {
        next.push(a)
        continue
      }
      changed = true
      for (const piece of subtractRect(d, hole)) {
        next.push({ id: crypto.randomUUID(), pageNumber, type: 'highlight', data: piece })
      }
      continue
    }

    next.push(a)
  }

  return { changed, next }
}

interface ResizeStart {
  noteId: string
  corner: Corner
  // true = tay cam goc (che do da CHON) - doi ca kich thuoc hop LAN co chu
  // cung luc. false = tay cam don o goc duoi-phai (che do binh thuong) -
  // chi doi kich thuoc hop, giu nguyen co chu.
  scaleFont: boolean
  startX: number
  startY: number
  box: Rect
  fontSize: number
  moved: boolean
}

interface DragStart {
  noteId: string
  startX: number
  startY: number
  origX: number
  origY: number
  moved: boolean
}

interface ShapeResizeStart {
  id: string
  type: 'highlight' | 'pencil'
  corner: Corner
  startX: number
  startY: number
  box: Rect
  points?: Point[]
  moved: boolean
}

const MIN_SHAPE_SIZE = 8
const HANDLE_SIZE = 10

function AnnotationLayer({ pageNumber, zoom }: AnnotationLayerProps): React.JSX.Element {
  const annotations = useAnnotationStore((s) => s.annotations)
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const textColor = useAnnotationStore((s) => s.textColor)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const eraserRadius = useAnnotationStore((s) => s.eraserRadius)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const setSelectedId = useAnnotationStore((s) => s.setSelectedId)
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation)
  const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const beginBatch = useAnnotationStore((s) => s.beginBatch)
  const setAnnotationsSilent = useAnnotationStore((s) => s.setAnnotationsSilent)
  const commitBatch = useAnnotationStore((s) => s.commitBatch)
  const abortBatch = useAnnotationStore((s) => s.abortBatch)
  const rollbackBatch = useAnnotationStore((s) => s.rollbackBatch)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null)
  const isErasing = useRef(false)
  const resizeStart = useRef<ResizeStart | null>(null)
  const dragStart = useRef<DragStart | null>(null)
  const shapeResizeStart = useRef<ShapeResizeStart | null>(null)
  const editOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber)
  const drawable = tool === 'highlight' || tool === 'pencil' || tool === 'note'
  const selectedShape = pageAnnotations.find(
    (a) => a.id === selectedId && (a.type === 'highlight' || a.type === 'pencil')
  )
  const selectedShapeBox = selectedShape ? getBoundingBox(selectedShape) : null

  useEffect(() => {
    return () => {
      if (editOpenTimer.current) clearTimeout(editOpenTimer.current)
    }
  }, [])

  function toContentPoint(e: { clientX: number; clientY: number; currentTarget: Element }): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom
    }
  }

  // Huy net ve/hop dang tao (chi la state cuc bo, chua ghi vao store) va
  // hoan tac net xoa dang do dang (DA ghi tam vao store qua batch) - dung
  // khi phat hien co CHAM TAY (bat ke may ngon), de nhuong toan bo cu chi
  // cham cho dieu huong/pinch-zoom. Cong cu se duoc AttachmentViewerPanel.tsx
  // tam tat luc bat dau cham va tu bat lai sau khi het cham hoan toan.
  const cancelToolGesture = (): void => {
    setDraft(null)
    if (isErasing.current) {
      isErasing.current = false
      rollbackBatch()
    }
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.pointerType === 'touch') {
      cancelToolGesture()
      return
    }

    const p = toContentPoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    // Bam vao khoang trong SVG (khong trung 1 chi tiet nao - cac chi tiet
    // tu stopPropagation khi nhan dup trung) = bo chon. Neu day la nhat
    // dau cua 1 lan nhan dup vao dung chi tiet, onDoubleClick cua chi tiet
    // do se tu chon lai ngay sau (chay sau cung nen thang the).
    setSelectedId(null)

    if (tool === 'eraser') {
      isErasing.current = true
      beginBatch()
      const { changed, next } = eraseAtPoint(
        useAnnotationStore.getState().annotations,
        pageNumber,
        p,
        eraserRadius
      )
      if (changed) setAnnotationsSilent(next)
      return
    }

    if (!drawable) return

    if (tool === 'pencil') {
      setDraft({ kind: 'stroke', points: [p] })
    } else if (tool === 'highlight' || tool === 'note') {
      setDraft({ kind: 'rect', startX: p.x, startY: p.y, x: p.x, y: p.y, width: 0, height: 0 })
    }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.pointerType === 'touch') return

    const p = toContentPoint(e)

    if (tool === 'eraser') {
      setEraserCursor(p)
      if (!isErasing.current) return
      const { changed, next } = eraseAtPoint(
        useAnnotationStore.getState().annotations,
        pageNumber,
        p,
        eraserRadius
      )
      if (changed) setAnnotationsSilent(next)
      return
    }

    if (!draft) return
    if (draft.kind === 'stroke') {
      setDraft({ ...draft, points: [...draft.points, p] })
    } else {
      setDraft({
        ...draft,
        x: Math.min(draft.startX, p.x),
        y: Math.min(draft.startY, p.y),
        width: Math.abs(p.x - draft.startX),
        height: Math.abs(p.y - draft.startY)
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.pointerType === 'touch') return

    if (tool === 'eraser') {
      if (isErasing.current) commitBatch()
      isErasing.current = false
      return
    }

    if (!draft) return

    if (draft.kind === 'stroke' && draft.points.length > 1 && tool === 'pencil') {
      addAnnotation({
        id: crypto.randomUUID(),
        pageNumber,
        type: 'pencil',
        data: { color, strokeWidth, points: draft.points }
      })
    } else if (draft.kind === 'rect' && draft.width > 4 && draft.height > 4) {
      if (tool === 'highlight') {
        addAnnotation({
          id: crypto.randomUUID(),
          pageNumber,
          type: 'highlight',
          data: { x: draft.x, y: draft.y, width: draft.width, height: draft.height, color }
        })
      } else if (tool === 'note') {
        const id = crypto.randomUUID()
        addAnnotation({
          id,
          pageNumber,
          type: 'note',
          data: { x: draft.x, y: draft.y, width: draft.width, height: draft.height, text: '', color, textColor }
        })
        setEditingNoteId(id)
      }
    }

    setDraft(null)
  }

  const updateNoteText = (noteId: string, text: string, height?: number): void => {
    const note = annotations.find((a) => a.id === noteId)
    if (!note || note.type !== 'note') return
    const d = note.data as NoteData
    updateAnnotation(noteId, { ...d, text, height: height ?? d.height })
  }

  // Hop ghi chu tu dai ra theo chu khi go: chi thao tac DOM truc tiep luc
  // dang go (khong ghi vao store moi lan go phim, tranh spam lich su Quay
  // lai) - kich thuoc thuc te chi duoc luu lai 1 lan khi blur (ham
  // updateNoteText o tren).
  const handleNoteInput = (e: React.FormEvent<HTMLTextAreaElement>, noteHeight: number): void => {
    const el = e.currentTarget
    el.style.height = 'auto'
    const grown = el.scrollHeight
    el.style.height = `${grown}px`
    const box = el.closest('.annotation-note-box') as HTMLElement | null
    if (box) {
      box.style.height = `${Math.max(noteHeight * zoom, grown)}px`
    }
  }

  // Keo tu than hop = DI CHUYEN toi vi tri bat ky. Neu tha ra ma khong he
  // di chuyen (chi la 1 cai bam) thi coi nhu bam de mo sua chu, khong ghi
  // gi vao lich su Quay lai ca.
  const handleNoteBoxPointerDown = (e: React.PointerEvent, noteId: string, d: NoteData): void => {
    if (tool === 'eraser') return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragStart.current = { noteId, startX: e.clientX, startY: e.clientY, origX: d.x, origY: d.y, moved: false }
    beginBatch()
  }

  const handleNoteBoxPointerMove = (e: React.PointerEvent): void => {
    const drag = dragStart.current
    if (!drag) return
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3) return
      drag.moved = true
    }
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    const current = useAnnotationStore.getState().annotations
    const next = current.map((a) =>
      a.id === drag.noteId && a.type === 'note'
        ? { ...a, data: { ...(a.data as NoteData), x: drag.origX + dx, y: drag.origY + dy } }
        : a
    )
    setAnnotationsSilent(next)
  }

  // Bam 1 cai = mo sua chu (nhu truoc). Nhung phai CHO 1 nhip (khong mo
  // ngay) de kip phan biet voi bam DUP = chon chi tiet (xem
  // handleNoteBoxDoubleClick huy lich hen nay) - neu khong, cai bam dau
  // tien cua 1 lan nhan dup se lo mo sua truoc khi kip chon. Rieng khi dang
  // o cong cu "Chon", bam 1 cai la chon luon, khong can cho/khong mo sua.
  const handleNoteBoxPointerUp = (noteId: string): void => {
    const drag = dragStart.current
    if (!drag) return
    dragStart.current = null
    if (drag.moved) {
      commitBatch()
      return
    }
    abortBatch()
    if (tool === 'select') {
      setSelectedId(noteId)
      return
    }
    if (editOpenTimer.current) clearTimeout(editOpenTimer.current)
    editOpenTimer.current = setTimeout(() => {
      editOpenTimer.current = null
      setEditingNoteId(noteId)
    }, 250)
  }

  // isEditing: bo qua khi dang go chu (de nhan dup CHON TU trong textarea -
  // hanh vi native cua trinh duyet - hoat dong binh thuong, khong bi giat).
  const handleNoteBoxDoubleClick = (noteId: string, isEditing: boolean): void => {
    if (isEditing) return
    if (editOpenTimer.current) {
      clearTimeout(editOpenTimer.current)
      editOpenTimer.current = null
    }
    setSelectedId(noteId)
  }

  // Resize highlight/but chi tu 1 trong 4 tay cam goc cua khung bao (chi
  // hien khi da CHON chi tiet). Highlight: goc moi = du lieu hinh chu nhat
  // moi luon. But chi: khong co khai niem "kich thuoc" truc tiep - phai
  // SCALE toan bo tap diem tu khung bao CU sang khung bao MOI (ty le rieng
  // cho truc x/y), giu nguyen hinh dang tuong doi cua net ve.
  const handleShapeResizeStart = (e: React.PointerEvent, a: NewAnnotation, corner: Corner): void => {
    if (a.type !== 'highlight' && a.type !== 'pencil') return
    e.stopPropagation()
    e.preventDefault()
    const box = getBoundingBox(a)
    if (!box) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    shapeResizeStart.current = {
      id: a.id,
      type: a.type,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      box,
      points: a.type === 'pencil' ? (a.data as StrokeData).points : undefined,
      moved: false
    }
    beginBatch()
  }

  const handleShapeResizeMove = (e: React.PointerEvent): void => {
    const start = shapeResizeStart.current
    if (!start) return
    if (!start.moved) {
      if (Math.hypot(e.clientX - start.startX, e.clientY - start.startY) < 3) return
      start.moved = true
    }
    const dx = (e.clientX - start.startX) / zoom
    const dy = (e.clientY - start.startY) / zoom
    const nextBox = resizeBoxFromCorner(start.box, start.corner, dx, dy, MIN_SHAPE_SIZE, MIN_SHAPE_SIZE)

    const current = useAnnotationStore.getState().annotations
    const next = current.map((a) => {
      if (a.id !== start.id) return a
      if (a.type === 'highlight') {
        return { ...a, data: { ...(a.data as HighlightData), ...nextBox } }
      }
      if (a.type === 'pencil' && start.points) {
        const scaleX = start.box.width > 0.01 ? nextBox.width / start.box.width : 1
        const scaleY = start.box.height > 0.01 ? nextBox.height / start.box.height : 1
        const newPoints = start.points.map((p) => ({
          x: nextBox.x + (p.x - start.box.x) * scaleX,
          y: nextBox.y + (p.y - start.box.y) * scaleY
        }))
        return { ...a, data: { ...(a.data as StrokeData), points: newPoints } }
      }
      return a
    })
    setAnnotationsSilent(next)
  }

  const handleShapeResizeEnd = (): void => {
    const start = shapeResizeStart.current
    if (!start) return
    shapeResizeStart.current = null
    if (start.moved) {
      commitBatch()
    } else {
      abortBatch()
    }
  }

  // Resize tu 1 trong 4 tay cam goc: hop phai luon bao du toan bo chu, du
  // cho chieu rong bi keo nho lai (chu se xuong dong nhieu hon) - vua keo
  // vua do lai scrollHeight cua noi dung THEO be rong moi de dam bao chieu
  // cao khong bao gio nho hon muc chu can, chi duoc phep du ra chu khong
  // duoc thieu. Neu keo tu goc TREN (nw/ne) ma bi ep tang chieu cao do
  // rang buoc nay, phai day canh TREN len them (khong duoc dich canh DUOI,
  // vi goc doi dien phai la diem neo co dinh).
  const handleResizeStart = (
    e: React.PointerEvent,
    noteId: string,
    d: NoteData,
    corner: Corner,
    scaleFont: boolean
  ): void => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    resizeStart.current = {
      noteId,
      corner,
      scaleFont,
      startX: e.clientX,
      startY: e.clientY,
      box: { x: d.x, y: d.y, width: d.width, height: d.height },
      fontSize: noteFontSize(d),
      moved: false
    }
    beginBatch()
  }

  const handleResizeMove = (e: React.PointerEvent): void => {
    const start = resizeStart.current
    if (!start) return
    if (!start.moved) {
      if (Math.hypot(e.clientX - start.startX, e.clientY - start.startY) < 3) return
      start.moved = true
    }
    const dx = (e.clientX - start.startX) / zoom
    const dy = (e.clientY - start.startY) / zoom
    let nextBox = resizeBoxFromCorner(start.box, start.corner, dx, dy, NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT)
    let nextFontSize = start.fontSize
    if (start.scaleFont) {
      const fontScale = start.box.height > 0.01 ? nextBox.height / start.box.height : 1
      nextFontSize = Math.max(NOTE_MIN_FONT_SIZE, start.fontSize * fontScale)
    }

    const box = (e.target as Element).closest('.annotation-note-box') as HTMLElement | null
    const contentEl = box?.querySelector('p, textarea') as HTMLElement | null
    if (box && contentEl) {
      box.style.width = `${nextBox.width * zoom}px`
      if (start.scaleFont) {
        contentEl.style.fontSize = `${nextFontSize * zoom}px`
      }
      // contentEl co CSS height:100% - phai tam bo no (auto) truoc khi do
      // scrollHeight, khong thi scrollHeight chi tra ve chieu cao HIEN TAI
      // cua hop (chua thu nho) chu khong phai muc chu THAT SU can, khien
      // hop hau nhu khong bao gio thu nho duoc khi keo len (bug "cham hon
      // nhip chuot"). Do o day THEO co chu moi (da set o tren) - dam bao
      // hop van bao du chu du khi chu to len cung luc.
      const prevHeight = contentEl.style.height
      contentEl.style.height = 'auto'
      const requiredHeight = contentEl.scrollHeight / zoom
      contentEl.style.height = prevHeight
      if (requiredHeight > nextBox.height) {
        const extra = requiredHeight - nextBox.height
        const growUp = start.corner === 'nw' || start.corner === 'ne'
        nextBox = {
          ...nextBox,
          height: requiredHeight,
          y: growUp ? nextBox.y - extra : nextBox.y
        }
      }
      box.style.width = `${nextBox.width * zoom}px`
      box.style.height = `${nextBox.height * zoom}px`
      box.style.left = `${nextBox.x * zoom}px`
      box.style.top = `${nextBox.y * zoom}px`
    }

    const current = useAnnotationStore.getState().annotations
    const next = current.map((a) =>
      a.id === start.noteId && a.type === 'note'
        ? {
            ...a,
            data: {
              ...(a.data as NoteData),
              ...nextBox,
              ...(start.scaleFont ? { fontSize: nextFontSize } : {})
            }
          }
        : a
    )
    setAnnotationsSilent(next)
  }

  const handleResizeEnd = (): void => {
    const start = resizeStart.current
    if (!start) return
    resizeStart.current = null
    if (start.moved) {
      commitBatch()
    } else {
      abortBatch()
    }
  }

  return (
    <div className="annotation-layer">
      <svg
        className="annotation-layer-svg"
        style={{ pointerEvents: drawable || tool === 'eraser' || tool === 'select' ? 'auto' : 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setEraserCursor(null)}
      >
        {pageAnnotations
          .filter((a) => a.type === 'highlight')
          .map((a) => {
            const d = a.data as HighlightData
            return (
              <rect
                key={a.id}
                x={d.x * zoom}
                y={d.y * zoom}
                width={d.width * zoom}
                height={d.height * zoom}
                fill={HIGHLIGHT_COLOR_HEX[d.color]}
                opacity={0.4}
                // pointer-events cua chi tiet nay LUON bat, bat ke svg cha
                // dang 'none' hay khong (vd dang khong bat cong cu nao, de
                // van keo-di-chuyen-file duoc binh thuong) - de nhan dup
                // (hoac bam 1 cai khi dang o cong cu Chon) chon duoc moi luc.
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  if (tool !== 'select') return
                  e.stopPropagation()
                  setSelectedId(a.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setSelectedId(a.id)
                }}
              />
            )
          })}
        {pageAnnotations
          .filter((a) => a.type === 'pencil')
          .map((a) => {
            const d = a.data as StrokeData
            const path = pointsToPath(d.points, zoom)
            return (
              <g key={a.id}>
                <path
                  d={path}
                  stroke={PENCIL_COLOR_HEX[d.color]}
                  strokeWidth={d.strokeWidth * zoom}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  pointerEvents="none"
                />
                {/* Vung bat chuot rieng, RONG hon net ve thuc te va trong
                    suot - net mong rat kho nhan trung khi chi dua vao chinh
                    no lam vung bat chuot. */}
                <path
                  d={path}
                  stroke="transparent"
                  strokeWidth={Math.max(d.strokeWidth * zoom, PENCIL_MIN_HIT_WIDTH)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    if (tool !== 'select') return
                    e.stopPropagation()
                    setSelectedId(a.id)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setSelectedId(a.id)
                  }}
                />
              </g>
            )
          })}

        {/* Khung bao net dut + 4 tay cam goc cho highlight/but chi dang duoc
            chon - keo 1 goc de doi kich thuoc (highlight: doi thang hinh
            chu nhat; but chi: scale toan bo net ve theo khung moi). */}
        {selectedShape && selectedShapeBox && (
          <g>
            <rect
              x={selectedShapeBox.x * zoom}
              y={selectedShapeBox.y * zoom}
              width={selectedShapeBox.width * zoom}
              height={selectedShapeBox.height * zoom}
              fill="none"
              stroke="#1971c2"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              pointerEvents="none"
            />
            {(
              [
                ['nw', selectedShapeBox.x, selectedShapeBox.y],
                ['ne', selectedShapeBox.x + selectedShapeBox.width, selectedShapeBox.y],
                ['sw', selectedShapeBox.x, selectedShapeBox.y + selectedShapeBox.height],
                ['se', selectedShapeBox.x + selectedShapeBox.width, selectedShapeBox.y + selectedShapeBox.height]
              ] as [Corner, number, number][]
            ).map(([corner, cx, cy]) => (
              <rect
                key={corner}
                x={cx * zoom - HANDLE_SIZE / 2}
                y={cy * zoom - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                fill="#ffffff"
                stroke="#1971c2"
                strokeWidth={1.5}
                style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                onPointerDown={(e) => handleShapeResizeStart(e, selectedShape, corner)}
                onPointerMove={handleShapeResizeMove}
                onPointerUp={handleShapeResizeEnd}
              />
            ))}
          </g>
        )}

        {draft?.kind === 'stroke' && tool === 'pencil' && (
          <path
            d={pointsToPath(draft.points, zoom)}
            stroke={PENCIL_COLOR_HEX[color]}
            strokeWidth={strokeWidth * zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
        {draft?.kind === 'rect' && tool === 'highlight' && (
          <rect
            x={draft.x * zoom}
            y={draft.y * zoom}
            width={draft.width * zoom}
            height={draft.height * zoom}
            fill={HIGHLIGHT_COLOR_HEX[color]}
            opacity={0.4}
          />
        )}
        {draft?.kind === 'rect' && tool === 'note' && (
          <rect
            x={draft.x * zoom}
            y={draft.y * zoom}
            width={draft.width * zoom}
            height={draft.height * zoom}
            className="annotation-note-draft-rect"
          />
        )}
        {tool === 'eraser' && eraserCursor && (
          <circle
            cx={eraserCursor.x * zoom}
            cy={eraserCursor.y * zoom}
            r={eraserRadius * zoom}
            className="annotation-eraser-cursor"
          />
        )}
      </svg>

      {pageAnnotations
        .filter((a) => a.type === 'note')
        .map((a) => {
          const d = a.data as NoteData
          const isEditing = editingNoteId === a.id
          const isSelected = selectedId === a.id
          return (
            <div
              key={a.id}
              className={`annotation-note-box${isEditing ? ' is-editing' : ''}${isSelected ? ' is-selected' : ''}`}
              style={{
                left: d.x * zoom,
                top: d.y * zoom,
                width: d.width * zoom,
                height: d.height * zoom,
                color: noteTextColorHex(d.textColor),
                background: d.color === 'none' ? undefined : NOTE_BG_HEX[d.color],
                borderColor: isEditing
                  ? undefined
                  : isSelected
                    ? '#1971c2'
                    : d.color === 'none'
                      ? undefined
                      : 'rgba(0, 0, 0, 0.15)'
              }}
              onClick={() => {
                if (tool === 'eraser' && !isEditing) removeAnnotation(a.id)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                handleNoteBoxDoubleClick(a.id, isEditing)
              }}
              onPointerDown={(e) => !isEditing && handleNoteBoxPointerDown(e, a.id, d)}
              onPointerMove={handleNoteBoxPointerMove}
              onPointerUp={() => handleNoteBoxPointerUp(a.id)}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  defaultValue={d.text}
                  style={{ color: noteTextColorHex(d.textColor), fontSize: noteFontSize(d) * zoom }}
                  onInput={(e) => handleNoteInput(e, d.height)}
                  onBlur={(e) => {
                    const grownHeight = Math.max(d.height, e.currentTarget.scrollHeight / zoom)
                    updateNoteText(a.id, e.target.value, grownHeight)
                    setEditingNoteId(null)
                  }}
                />
              ) : (
                <p style={{ fontSize: noteFontSize(d) * zoom }}>{d.text}</p>
              )}
              {isSelected ? (
                (['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                  <div
                    key={corner}
                    className={`annotation-note-resize-handle annotation-note-resize-handle-${corner}`}
                    onPointerDown={(e) => handleResizeStart(e, a.id, d, corner, true)}
                    onPointerMove={handleResizeMove}
                    onPointerUp={handleResizeEnd}
                  />
                ))
              ) : (
                tool !== 'eraser' && (
                  <div
                    className="annotation-note-resize-handle annotation-note-resize-handle-se"
                    onPointerDown={(e) => handleResizeStart(e, a.id, d, 'se', false)}
                    onPointerMove={handleResizeMove}
                    onPointerUp={handleResizeEnd}
                  />
                )
              )}
            </div>
          )
        })}
    </div>
  )
}

export default AnnotationLayer
