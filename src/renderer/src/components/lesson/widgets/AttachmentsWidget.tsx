import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Paperclip, Plus, RotateCcw, X, RefreshCw, Link2 } from 'lucide-react'
import {
  attachmentsQueryKey,
  useAttachments,
  useAddAttachment,
  useRemoveAttachment,
  useReextractAttachment,
  useLinkAttachmentSource,
  useBulkLinkAttachmentSources
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
  const linkSource = useLinkAttachmentSource(lesson.id)
  const bulkLinkSources = useBulkLinkAttachmentSources(lesson.id)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(
    null
  )
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)

  const unlinkedCount = attachmentsQuery.data?.filter((a) => !a.sourcePath).length ?? 0

  const handleBulkLink = (): void => {
    setBulkNotice(null)
    bulkLinkSources.mutate(undefined, {
      onSuccess: (res) => {
        if (!res) return
        if (res.total === 0) {
          setBulkNotice('Mọi file đã được liên kết file gốc.')
          return
        }
        const parts = [`Đã liên kết ${res.matched}/${res.total} file`]
        if (res.ambiguous > 0) parts.push(`${res.ambiguous} file trùng tên (bỏ qua)`)
        const remain = res.total - res.matched
        if (remain > 0) parts.push(`${remain} file chưa tìm thấy — liên kết thủ công`)
        setBulkNotice(parts.join(' · '))
      }
    })
  }

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
      <div className="attachment-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={addAttachment.isPending}
          onClick={() => addAttachment.mutate()}
        >
          <Plus size={14} /> Thêm file (PDF / Word / PowerPoint / Ảnh)
        </button>
        {unlinkedCount > 0 && (
          <button
            type="button"
            className="btn-secondary"
            disabled={bulkLinkSources.isPending}
            title="Chọn 1 thư mục chứa các file gốc — app sẽ tự khớp theo tên file"
            onClick={handleBulkLink}
          >
            <Link2 size={14} />{' '}
            {bulkLinkSources.isPending ? 'Đang liên kết...' : 'Liên kết file gốc hàng loạt'}
          </button>
        )}
      </div>

      {bulkNotice && <p className="quiz-generate-hint">{bulkNotice}</p>}

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
            {att.sourcePath && (
              <span
                className="attachment-sync-icon"
                title="Tự cập nhật trong app khi file gốc trên máy thay đổi"
              >
                <RefreshCw size={12} />
              </span>
            )}
            <span className="attachment-size">{formatSize(att.fileSizeBytes)}</span>
            {!att.sourcePath && (
              <button
                type="button"
                title="Liên kết file gốc để tự cập nhật khi file thay đổi"
                disabled={linkSource.isPending}
                onClick={(e) => {
                  e.stopPropagation()
                  linkSource.mutate(att.id)
                }}
              >
                <Link2 size={13} />
              </button>
            )}
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
