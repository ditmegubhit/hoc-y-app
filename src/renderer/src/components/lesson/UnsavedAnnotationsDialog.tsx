interface UnsavedAnnotationsDialogProps {
  open: boolean
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
  onCancel: () => void
}

// Hoi khi dong panel/chuyen sang file khac luc con chu thich (highlight/net
// ve/hop ghi chu) chua luu - dung UI tu ve (khong dung window.confirm(), xem
// ghi chu trong ConfirmDialog.tsx ve ly do).
function UnsavedAnnotationsDialog({
  open,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel
}: UnsavedAnnotationsDialogProps): React.JSX.Element | null {
  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Chưa lưu chú thích</h3>
        <p>File này có chú thích (highlight/nét vẽ/ghi chú) chưa được lưu. Bạn muốn làm gì?</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            Huỷ
          </button>
          <button type="button" onClick={onDiscardAndContinue}>
            Không lưu
          </button>
          <button type="button" className="btn-primary" onClick={onSaveAndContinue}>
            Lưu và tiếp tục
          </button>
        </div>
      </div>
    </div>
  )
}

export default UnsavedAnnotationsDialog
