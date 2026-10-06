import type { ReactNode } from 'react'

// Hop thoai tu ve (khong dung window.confirm/alert - xem ConfirmDialog.tsx) cho
// khu Thuc hanh. Khac ConfirmDialog: bam ra ngoai KHONG dong (tranh bam nham
// vao lua chon pha huy du lieu), so nut tuy y.
interface PracticeDialogProps {
  open: boolean
  title: string
  children: ReactNode
  actions: ReactNode
  wide?: boolean
}

function PracticeDialog({ open, title, children, actions, wide }: PracticeDialogProps): React.JSX.Element | null {
  if (!open) return null
  return (
    <div className="confirm-overlay practice-dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`confirm-dialog practice-dialog${wide ? ' is-wide' : ''}`}>
        <h3>{title}</h3>
        <div className="practice-dialog-body">{children}</div>
        <div className="confirm-actions">{actions}</div>
      </div>
    </div>
  )
}

export default PracticeDialog
