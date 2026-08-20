import { useEffect, useState } from 'react'
import {
  Eraser,
  Highlighter,
  MousePointer2,
  Pencil,
  Save,
  StickyNote,
  Trash2,
  Type,
  Undo2
} from 'lucide-react'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { persistAnnotations } from '@renderer/lib/annotationPersistence'
import type { HighlightColor, NoteData } from '@shared/types/annotation'

interface AnnotationToolboxProps {
  attachmentId: string
}

const COLORS: HighlightColor[] = ['red', 'yellow', 'blue', 'white', 'none']
const COLOR_LABEL: Record<HighlightColor, string> = {
  red: 'Đỏ',
  yellow: 'Vàng',
  blue: 'Xanh lam',
  white: 'Trắng',
  none: 'Không có màu'
}

// Hop cong cu chu thich file dinh kem - nam BEN NGOAI panel (sibling trong
// LessonWorkspacePage), o khoang trong ben phai panel, tu xuat hien/bien mat
// cung panel vi cung 1 dieu kien render (activeAttachment). Trang thai
// (cong cu dang chon, mau, do day net, danh sach net ve...) nam trong
// annotationStore (zustand) de AnnotationLayer o sau trong tung trang doc
// duoc ma khong can truyen prop qua nhieu tang.
//
// Mau la 1 cong cu RIENG (giong nut Font Color cua Word: bam vao hien bang
// chon mau) - ap dung chung cho ca highlight/pencil/note, khong gan rieng
// vao nut Highlight nhu ban truoc.
function AnnotationToolbox({ attachmentId }: AnnotationToolboxProps): React.JSX.Element {
  const [isSaving, setIsSaving] = useState(false)
  // Chi 1 trong 2 hop chon mau (nen/to hoac chu) duoc mo cung luc - mo hop
  // nay phai tu dong dong hop kia, khong de 2 hop chong len nhau.
  const [openPicker, setOpenPicker] = useState<'fill' | 'text' | null>(null)
  const colorPickerOpen = openPicker === 'fill'
  const textColorPickerOpen = openPicker === 'text'
  const tool = useAnnotationStore((s) => s.tool)
  const setTool = useAnnotationStore((s) => s.setTool)
  const color = useAnnotationStore((s) => s.color)
  const setColor = useAnnotationStore((s) => s.setColor)
  const textColor = useAnnotationStore((s) => s.textColor)
  const setTextColor = useAnnotationStore((s) => s.setTextColor)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const eraserRadius = useAnnotationStore((s) => s.eraserRadius)
  const setEraserRadius = useAnnotationStore((s) => s.setEraserRadius)
  const historyLength = useAnnotationStore((s) => s.history.length)
  const undo = useAnnotationStore((s) => s.undo)
  const isDirty = useAnnotationStore((s) => s.isDirty)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const setSelectedId = useAnnotationStore((s) => s.setSelectedId)
  const recolorAnnotation = useAnnotationStore((s) => s.recolorAnnotation)
  const recolorNoteText = useAnnotationStore((s) => s.recolorNoteText)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const selectedAnnotation = useAnnotationStore((s) =>
    selectedId ? s.annotations.find((a) => a.id === selectedId) : undefined
  )

  const toggleTool = (next: typeof tool): void => {
    setTool(tool === next ? 'none' : next)
  }

  const handleDeleteSelected = (): void => {
    if (!selectedId) return
    removeAnnotation(selectedId)
    setSelectedId(null)
  }

  // Ctrl+Z toan cuc de Quay lai thao tac chu thich gan nhat, phim Delete de
  // xoa chi tiet dang duoc chon (cong cu Chon) - ca 2 deu bo qua khi dang go
  // trong 1 o nhap lieu (vd hop ghi chu) de khong danh mat undo/xoa gia tri
  // cua trinh soan thao chu (native browser).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const isTyping = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
      if (isTyping) return

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useAnnotationStore.getState().undo()
        return
      }

      if (e.key === 'Delete') {
        const currentSelectedId = useAnnotationStore.getState().selectedId
        if (!currentSelectedId) return
        e.preventDefault()
        useAnnotationStore.getState().removeAnnotation(currentSelectedId)
        useAnnotationStore.getState().setSelectedId(null)
        return
      }

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const currentTool = useAnnotationStore.getState().tool
        useAnnotationStore.getState().setTool(currentTool === 'select' ? 'none' : 'select')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await persistAnnotations(attachmentId)
    } finally {
      setIsSaving(false)
    }
  }

  // Neu dang chon 1 chi tiet, hop mau (nen/to) dieu khien mau CUA CHI TIET
  // DO (bam mau la doi mau ngay) - khong thi dieu khien mau MAC DINH cho
  // net moi.
  const activeColor = selectedAnnotation?.data.color ?? color

  const handlePickColor = (c: HighlightColor): void => {
    if (selectedId) {
      recolorAnnotation(selectedId, c)
    } else {
      setColor(c)
    }
    setOpenPicker(null)
  }

  // Mau CHU rieng - chi co y nghia voi hop ghi chu (highlight/but chi
  // khong co khai niem "chu"). Neu dang chon 1 hop ghi chu, doi mau chu
  // cua dung hop do; cac truong hop khac (khong chon gi, hoac dang chon
  // highlight/but chi) thi chi doi mau chu MAC DINH cho hop ghi chu moi.
  const selectedNote = selectedAnnotation?.type === 'note' ? selectedAnnotation : undefined
  const activeTextColor = selectedNote
    ? ((selectedNote.data as NoteData).textColor ?? 'none')
    : textColor

  const handlePickTextColor = (c: HighlightColor): void => {
    if (selectedNote) {
      recolorNoteText(selectedNote.id, c)
    } else {
      setTextColor(c)
    }
    setOpenPicker(null)
  }

  return (
    <div className="annotation-toolbox">
      <div className="annotation-toolbox-group annotation-color-picker">
        <button
          type="button"
          title="Chọn màu"
          className="annotation-color-picker-button"
          onClick={() => setOpenPicker((v) => (v === 'fill' ? null : 'fill'))}
        >
          <span>A</span>
          <span className={`annotation-color-picker-bar annotation-color-fill-${activeColor}`} />
        </button>
        {colorPickerOpen && (
          <div className="annotation-color-picker-popover">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={COLOR_LABEL[c]}
                className={`annotation-color-swatch annotation-color-fill-${c}${activeColor === c ? ' is-selected' : ''}`}
                onClick={() => handlePickColor(c)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="annotation-toolbox-group annotation-color-picker">
        <button
          type="button"
          title="Màu chữ (áp dụng cho chữ trong hộp ghi chú)"
          className="annotation-color-picker-button"
          onClick={() => setOpenPicker((v) => (v === 'text' ? null : 'text'))}
        >
          <Type size={13} />
          <span className={`annotation-color-picker-bar annotation-color-fill-${activeTextColor}`} />
        </button>
        {textColorPickerOpen && (
          <div className="annotation-color-picker-popover">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={COLOR_LABEL[c]}
                className={`annotation-color-swatch annotation-color-fill-${c}${activeTextColor === c ? ' is-selected' : ''}`}
                onClick={() => handlePickTextColor(c)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        title="Chọn chi tiết (Ctrl+Shift+V) - đổi màu/xoá/đổi kích thước chi tiết đã tạo, hữu ích khi nhấn đúp khó trúng nét vẽ mỏng"
        className={tool === 'select' ? 'is-active' : ''}
        onClick={() => toggleTool('select')}
      >
        <MousePointer2 size={15} />
      </button>

      <button
        type="button"
        title="Tô đậm (highlight)"
        className={tool === 'highlight' ? 'is-active' : ''}
        onClick={() => toggleTool('highlight')}
      >
        <Highlighter size={15} />
      </button>

      <div className="annotation-toolbox-group">
        <button
          type="button"
          title="Bút chì"
          className={tool === 'pencil' ? 'is-active' : ''}
          onClick={() => toggleTool('pencil')}
        >
          <Pencil size={15} />
        </button>
        {tool === 'pencil' && (
          <input
            type="range"
            min={1}
            max={12}
            value={strokeWidth}
            title={`Độ dày nét: ${strokeWidth}px`}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          />
        )}
      </div>

      <button
        type="button"
        title="Hộp ghi chú"
        className={tool === 'note' ? 'is-active' : ''}
        onClick={() => toggleTool('note')}
      >
        <StickyNote size={15} />
      </button>

      <div className="annotation-toolbox-group">
        <button
          type="button"
          title="Tẩy (bút vẽ/highlight xoá tự do theo đường tẩy đi qua, hộp ghi chú xoá cả hộp)"
          className={tool === 'eraser' ? 'is-active' : ''}
          onClick={() => toggleTool('eraser')}
        >
          <Eraser size={15} />
        </button>
        {tool === 'eraser' && (
          <input
            type="range"
            min={4}
            max={40}
            value={eraserRadius}
            title={`Kích cỡ tẩy: ${eraserRadius}px`}
            onChange={(e) => setEraserRadius(Number(e.target.value))}
          />
        )}
      </div>

      <button
        type="button"
        title="Xoá chi tiết đã chọn (Delete) - nhấn đúp chuột hoặc dùng công cụ Chọn để chọn 1 chi tiết"
        disabled={!selectedId}
        onClick={handleDeleteSelected}
      >
        <Trash2 size={15} />
      </button>

      <button
        type="button"
        title="Quay lại (Ctrl+Z)"
        disabled={historyLength === 0}
        onClick={undo}
      >
        <Undo2 size={15} />
      </button>

      <button
        type="button"
        title={isDirty ? 'Lưu (còn thay đổi chưa lưu)' : 'Đã lưu'}
        className={isDirty ? 'is-dirty' : ''}
        disabled={isSaving}
        onClick={handleSave}
      >
        <Save size={15} />
      </button>
    </div>
  )
}

export default AnnotationToolbox
