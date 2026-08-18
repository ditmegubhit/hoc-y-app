import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

interface EditableTitleProps {
  value: string
  onSave: (newValue: string) => void
  placeholder?: string
}

// Doi ten song trong 1 component React binh thuong (khong nam trong danh
// sach ao hoa cua react-arborist/react-window nhu truoc) - input controlled
// bang state cuc bo don gian, khong phu thuoc bat ky co che ben ngoai nao.
function EditableTitle({ value, onSave, placeholder }: EditableTitleProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const actionTakenRef = useRef(false)

  useEffect(() => {
    if (!isEditing) return
    actionTakenRef.current = false
    const el = inputRef.current
    if (!el) return
    // Blur roi focus lai NGAY TRONG TRINH DUYET (khong dung IPC/BrowserWindow
    // - khong co bat ky hieu ung hinh anh nao o cua so) truoc khi focus that.
    // Sau 1 chuoi tao-moi + dieu huong nhanh, Chromium doi luc chi nhan
    // Backspace/Delete o input moi mount ma khong nhan ky tu go moi; ep 1
    // chu ky blur/focus ngay tren chinh input nay (thay vi ca cua so) co the
    // du de trinh duyet dong bo lai trang thai nhap lieu.
    el.blur()
    requestAnimationFrame(() => {
      el.focus()
      el.select()
    })
  }, [isEditing])

  function startEdit(): void {
    setDraft(value)
    setIsEditing(true)
  }

  function commit(): void {
    if (actionTakenRef.current) return
    actionTakenRef.current = true
    setIsEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
  }

  function cancel(): void {
    if (actionTakenRef.current) return
    actionTakenRef.current = true
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="editable-title-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
      />
    )
  }

  return (
    <button type="button" className="editable-title" onClick={startEdit} title="Bấm để đổi tên">
      <span className="editable-title-text">{value}</span>
      <Pencil size={14} className="editable-title-icon" />
    </button>
  )
}

export default EditableTitle
