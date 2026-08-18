import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Paperclip, Plus, RotateCcw, X } from 'lucide-react'
import {
  attachmentsQueryKey,
  useAttachments,
  useAddAttachment,
  useRemoveAttachment,
  useReextractAttachment
} from '@renderer/queries/attachments'
import type { LessonWidgetProps } from '../widgetRegistry'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Đang trích xuất...',
  done: 'Đã lập chỉ mục tìm kiếm',
  failed: 'Trích xuất lỗi',
  not_supported: 'Không hỗ trợ trích xuất nội dung (ảnh)'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentsWidget({ lesson }: LessonWidgetProps): React.JSX.Element {
  const qc = useQueryClient()
  const attachmentsQuery = useAttachments(lesson.id)
  const addAttachment = useAddAttachment(lesson.id)
  const removeAttachment = useRemoveAttachment(lesson.id)
  const reextractAttachment = useReextractAttachment(lesson.id)

  useEffect(() => {
    const unsubscribe = window.api.attachments.onExtractionUpdated(() => {
      qc.invalidateQueries({ queryKey: attachmentsQueryKey(lesson.id) })
    })
    return unsubscribe
  }, [lesson.id, qc])

  return (
    <section className="lesson-widget">
      <h3>
        <Paperclip size={16} /> File đính kèm
      </h3>
      <button
        type="button"
        className="btn-secondary"
        disabled={addAttachment.isPending}
        onClick={() => addAttachment.mutate()}
      >
        <Plus size={14} /> Thêm file (PDF / Word / PowerPoint / Ảnh)
      </button>

      {attachmentsQuery.data && attachmentsQuery.data.length === 0 && (
        <p className="lesson-widget-placeholder">Chưa có file nào được đính kèm.</p>
      )}

      <ul className="attachment-list">
        {attachmentsQuery.data?.map((att) => (
          <li key={att.id} className="attachment-item">
            <span className="attachment-name">{att.fileName}</span>
            <span className="attachment-size">{formatSize(att.fileSizeBytes)}</span>
            <span className={`attachment-status attachment-status-${att.extractionStatus}`}>
              {STATUS_LABEL[att.extractionStatus] ?? att.extractionStatus}
            </span>
            {att.extractionStatus === 'failed' && (
              <button
                type="button"
                title="Thử lại"
                onClick={() => reextractAttachment.mutate(att.id)}
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              type="button"
              title="Xoá"
              onClick={() => {
                if (window.confirm(`Xoá file "${att.fileName}"?`)) {
                  removeAttachment.mutate(att.id)
                }
              }}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default AttachmentsWidget
