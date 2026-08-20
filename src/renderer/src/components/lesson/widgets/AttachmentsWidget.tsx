import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Paperclip, Plus, RotateCcw, X } from 'lucide-react'
import {
  attachmentsQueryKey,
  useAttachments,
  useAddAttachment,
  useRemoveAttachment,
  useReextractAttachment
} from '@renderer/queries/attachments'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import type { LessonWidgetProps } from '../widgetRegistry'
import type { Attachment } from '@shared/types/attachment'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Đang trích xuất...',
  ocr_processing: 'Đang nhận diện chữ (OCR)...',
  done: 'Đã lập chỉ mục tìm kiếm',
  done_empty: 'Không tìm thấy nội dung chữ (không thể tìm kiếm)',
  failed: 'Trích xuất lỗi',
  not_supported: 'Không hỗ trợ trích xuất nội dung'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AttachmentsWidgetProps extends LessonWidgetProps {
  activeAttachmentId: string | null
  onOpenAttachment: (attachment: Attachment) => void
}

function AttachmentsWidget({
  lesson,
  activeAttachmentId,
  onOpenAttachment
}: AttachmentsWidgetProps): React.JSX.Element {
  const qc = useQueryClient()
  const attachmentsQuery = useAttachments(lesson.id)
  const addAttachment = useAddAttachment(lesson.id)
  const removeAttachment = useRemoveAttachment(lesson.id)
  const reextractAttachment = useReextractAttachment(lesson.id)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(
    null
  )

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
          <li
            key={att.id}
            className={`attachment-item${att.id === activeAttachmentId ? ' attachment-item-active' : ''}`}
            onClick={() => onOpenAttachment(att)}
          >
            <span className="attachment-name">{att.fileName}</span>
            <span className="attachment-size">{formatSize(att.fileSizeBytes)}</span>
            <span className={`attachment-status attachment-status-${att.extractionStatus}`}>
              {STATUS_LABEL[att.extractionStatus] ?? att.extractionStatus}
            </span>
            {(att.extractionStatus === 'failed' || att.extractionStatus === 'done_empty') && (
              <button
                type="button"
                title="Thử lại"
                onClick={(e) => {
                  e.stopPropagation()
                  reextractAttachment.mutate(att.id)
                }}
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              type="button"
              title="Xoá"
              onClick={(e) => {
                e.stopPropagation()
                setPendingDelete({ id: att.id, fileName: att.fileName })
              }}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xác nhận xoá"
        message={pendingDelete ? `Xoá file "${pendingDelete.fileName}"?` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeAttachment.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}

export default AttachmentsWidget
