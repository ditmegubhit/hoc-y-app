import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { useReportPracticeAnswer } from '@renderer/queries/practice'
import type { PracticeAnswerReportKind, ReportPracticeAnswerResult } from '@shared/types/practice'
import './practiceQuiz.css'

// Bao cao cham sai o 1 cau da bi cham SAI: bo sung dap an dung (cau tra loi cua nguoi dung cung dung)
// hoac sua dap an goc (dap an luu bi sai, thuong do OCR). Luu vao vung goc nen luot sau dung ngay.

export interface PracticeAnswerReportTarget {
  fileId: string
  attemptId: string
  /** Goi sau khi luu thanh cong, kem ket qua cham lai cau do (va ket qua luot neu da nop). */
  onReported: (result: ReportPracticeAnswerResult) => void
  /** Bao cho man cha biet dang mo bang (de tam dung dem nguoc xem dap an). */
  onOpenChange?: (open: boolean) => void
}

interface Props extends PracticeAnswerReportTarget {
  regionId: string
  submittedText: string
  correctAnswerText: string
}

const KIND_TEXT: Record<PracticeAnswerReportKind, { label: string; hint: string; field: string }> = {
  add: {
    label: 'Bổ sung đáp án đúng',
    hint: 'Câu trả lời của bạn cũng đúng. Nó được thêm vào danh sách đáp án chấp nhận, đáp án gốc giữ nguyên.',
    field: 'Đáp án cũng được chấp nhận'
  },
  replace: {
    label: 'Sửa đáp án sai',
    hint: 'Đáp án đã lưu bị sai (thường do đọc chữ nhầm). Nó được thay bằng nội dung bạn nhập.',
    field: 'Đáp án đúng mới'
  }
}

export default function PracticeAnswerReport(props: Props): React.JSX.Element {
  const { fileId, attemptId, regionId, submittedText, correctAnswerText, onReported, onOpenChange } = props
  const report = useReportPracticeAnswer(fileId)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<PracticeAnswerReportKind>('add')
  const [addText, setAddText] = useState(submittedText.trim())
  const [replaceText, setReplaceText] = useState(correctAnswerText)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    onOpenChange?.(open)
    return () => onOpenChange?.(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const text = kind === 'add' ? addText : replaceText
  const setText = kind === 'add' ? setAddText : setReplaceText

  const save = (): void => {
    if (text.trim() === '' || report.isPending) return
    setError(null)
    report.mutate(
      { attemptId, regionId, kind, text, submittedText },
      {
        onSuccess: (result) => {
          setSaved(result.isCorrect ? 'Đã lưu. Câu này được tính là đúng.' : 'Đã lưu đáp án mới. Câu trả lời của bạn vẫn chưa khớp với đáp án.')
          setOpen(false)
          onReported(result)
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Không lưu được. Hãy thử lại.')
      }
    )
  }

  if (!open) {
    return (
      <div className="pq-report">
        <button type="button" className="pq-report-toggle" onClick={() => { setSaved(null); setOpen(true) }}>
          <Flag size={13} aria-hidden="true" /> Báo cáo sai sót
        </button>
        {saved && <span className="pq-report-saved" role="status">{saved}</span>}
      </div>
    )
  }

  return (
    <div className="pq-report pq-report--open" role="group" aria-label="Báo cáo sai sót">
      <div className="pq-seg" role="radiogroup" aria-label="Loại báo cáo">
        {(Object.keys(KIND_TEXT) as PracticeAnswerReportKind[]).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value}
            className={`pq-seg-btn${kind === value ? ' is-active' : ''}`}
            onClick={() => { setKind(value); setError(null) }}>
            {KIND_TEXT[value].label}
          </button>
        ))}
      </div>
      <p className="pq-report-hint">{KIND_TEXT[kind].hint}</p>
      <label className="pq-report-field">
        <span>{KIND_TEXT[kind].field}</span>
        <input type="text" autoComplete="off" spellCheck={false} value={text} autoFocus
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.stopPropagation()
              save()
            }
          }} />
      </label>
      {error && <p className="pq-error" role="alert">{error}</p>}
      <div className="pq-report-actions">
        <button type="button" className="btn-primary" disabled={text.trim() === '' || report.isPending} onClick={save}>
          {report.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button type="button" className="btn-secondary" disabled={report.isPending} onClick={() => setOpen(false)}>Huỷ</button>
      </div>
    </div>
  )
}
