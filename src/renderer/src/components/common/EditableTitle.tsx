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
    // Workaround cho loi da biet cua Electron (input DOM doi luc mat kha
    // nang nhan ky tu go moi, chi Backspace/Delete con hoat dong) - ep
    // webContents nhan lai focus native TRUOC khi focus input, khong dung
    // BrowserWindow.blur()/focus() nen khong gay nhap nhay active/inactive
    // o cua so. Xem chi tiet trong main/ipc/handlers/app.handler.ts.
    void window.api.app.refreshFocus().then(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
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
