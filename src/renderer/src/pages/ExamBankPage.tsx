import { useState } from 'react'
import { FileQuestion, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useExamFiles, useAddExamFile, useRemoveExamFile } from '@renderer/queries/examFiles'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Đang trích xuất...',
  done: 'Đã sẵn sàng',
  failed: 'Trích xuất lỗi'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ExamBankPage(): React.JSX.Element {
  const examFilesQuery = useExamFiles()
  const addExamFile = useAddExamFile()
  const removeExamFile = useRemoveExamFile()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(
    null
  )
  const [noticeId, setNoticeId] = useState<string | null>(null)

  return (
    <div className="lesson-workspace">
      <h2>
        <FileQuestion size={20} /> Ngân hàng đề thi
      </h2>
      <p className="lesson-widget-placeholder">
        Đưa các đề thi có sẵn (PDF/Word/PowerPoint) vào đây — sau này dùng để tạo bài kiểm tra từ
        câu hỏi nguyên văn trong đề (chưa triển khai, sẽ làm ở bước tiếp theo).
      </p>

      <button
        type="button"
        className="btn-primary"
        disabled={addExamFile.isPending}
        onClick={() => addExamFile.mutate()}
      >
        <Plus size={16} /> Thêm đề thi
      </button>

      {examFilesQuery.data && examFilesQuery.data.length === 0 && (
        <p className="lesson-widget-placeholder">Chưa có đề thi nào.</p>
      )}

      <ul className="exam-file-list">
        {examFilesQuery.data?.map((f) => (
          <li key={f.id} className="exam-file-item">
            <div className="exam-file-row">
              <div className="exam-file-info">
                <strong>{f.fileName}</strong>
                <span className="attachment-size">{formatSize(f.fileSizeBytes)}</span>
                <span className={`attachment-status attachment-status-${f.extractionStatus}`}>
                  {STATUS_LABEL[f.extractionStatus] ?? f.extractionStatus}
                </span>
              </div>
              <div className="exam-file-actions">
                <button
                  type="button"
                  disabled={f.extractionStatus !== 'done'}
                  onClick={() => setNoticeId(f.id)}
                >
                  <Sparkles size={14} /> Tạo bài kiểm tra
                </button>
                <button
                  type="button"
                  title="Xoá"
                  onClick={() => setPendingDelete({ id: f.id, fileName: f.fileName })}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            {noticeId === f.id && (
              <p className="quiz-ai-warning">
                Tính năng tạo bài kiểm tra từ đề thi đang được phát triển, sẽ có ở bước tiếp theo.
              </p>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xác nhận xoá"
        message={pendingDelete ? `Xoá đề thi "${pendingDelete.fileName}"?` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeExamFile.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

export default ExamBankPage
