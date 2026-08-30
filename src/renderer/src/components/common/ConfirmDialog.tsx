// Hop thoai xac nhan tu ve bang React/HTML - KHONG dung window.confirm()
// (hop thoai goc cua Chromium/Electron). window.confirm()/alert() la nguyen
// nhan da duoc Electron xac nhan (issue #20821, #19977, #40212...) gay mat
// kha nang go ky tu vao input duoc focus ngay sau do, chi con Backspace/
// Delete hoat dong - dung loai bo hoan toan bang cach tu ve UI xac nhan.
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Xoá',
  cancelLabel = 'Huỷ'
}: ConfirmDialogProps): React.JSX.Element | null {
  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
