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
    // Hoan 1 khung hinh truoc khi focus (thay vi focus ngay trong cung
    // useEffect) - giam rui ro loi Chromium/Electron da biet (input tu dong
    // focus ngay sau khi thay noi dung DOM doi luc mat kha nang nhan ky tu
    // go moi, chi Backspace/Delete con hoat dong - electron/electron#40212).
    // Nguyen nhan chinh (hop thoai window.confirm()) da duoc loai bo o
    // ConfirmDialog.tsx; day la lop phong ve them cho phan con lai.
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(raf)
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
