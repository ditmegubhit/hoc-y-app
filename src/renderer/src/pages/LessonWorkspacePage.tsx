import { useState } from 'react'
import { useLesson, useUpdateLesson } from '@renderer/queries/lessons'
import EditableTitle from '@renderer/components/common/EditableTitle'
import {
  defaultLessonLayout,
  lessonWidgetRegistry
} from '@renderer/components/lesson/widgetRegistry'
import AttachmentsWidget from '@renderer/components/lesson/widgets/AttachmentsWidget'
import AttachmentViewerPanel from '@renderer/components/lesson/AttachmentViewerPanel'
import AnnotationToolbox from '@renderer/components/lesson/AnnotationToolbox'
import UnsavedAnnotationsDialog from '@renderer/components/lesson/UnsavedAnnotationsDialog'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { persistAnnotations } from '@renderer/lib/annotationPersistence'
import type { Attachment } from '@shared/types/attachment'
import type { QuizLaunchRequest, QuizLibraryRequest } from '@shared/types/quiz'

interface LessonWorkspacePageProps {
  lessonId: string | null
  onStartQuiz?: (req: QuizLaunchRequest) => void
  onOpenLibrary?: (req: QuizLibraryRequest) => void
}

const PANEL_WIDTH_STORAGE_KEY = 'lessonAttachmentPanelWidth'
const DEFAULT_PANEL_WIDTH = 420

function readStoredPanelWidth(): number {
  const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_PANEL_WIDTH
}

type PendingAction = { type: 'switch'; attachment: Attachment } | { type: 'close' }

function LessonWorkspacePage({
  lessonId,
  onStartQuiz,
  onOpenLibrary
}: LessonWorkspacePageProps): React.JSX.Element {
  const { data: lesson, isLoading } = useLesson(lessonId)
  const updateLesson = useUpdateLesson()
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null)
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const handlePanelWidthChange = (width: number): void => {
    setPanelWidth(width)
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
  }

  // Truoc khi doi sang file khac hoac dong panel, kiem tra chu thich (highlight/
  // net ve/hop ghi chu) cua file dang mo con thay doi chua luu khong - neu co,
  // chan lai va hoi (xem UnsavedAnnotationsDialog) thay vi mat trang im lang.
  const requestOpenAttachment = (attachment: Attachment): void => {
    if (
      activeAttachment &&
      activeAttachment.id !== attachment.id &&
      useAnnotationStore.getState().isDirty
    ) {
      setPendingAction({ type: 'switch', attachment })
      return
    }
    setActiveAttachment(attachment)
  }

  const requestCloseAttachment = (): void => {
    if (useAnnotationStore.getState().isDirty) {
      setPendingAction({ type: 'close' })
      return
    }
    setActiveAttachment(null)
  }

  const resolvePendingAction = async (save: boolean): Promise<void> => {
    if (!pendingAction) return
    if (save && activeAttachment) {
      await persistAnnotations(activeAttachment.id)
    }
    setActiveAttachment(pendingAction.type === 'switch' ? pendingAction.attachment : null)
    setPendingAction(null)
  }

  if (!lessonId) {
    return (
      <div className="lesson-workspace-empty">
        <p>Chọn một bài học ở bên trái, hoặc tạo bài học mới trong một chủ đề.</p>
      </div>
    )
  }

  if (isLoading || !lesson) {
    return <div className="lesson-workspace-empty">Đang tải bài học...</div>
  }

  // Panel file + toolbox gio la position:fixed (an len tren ca thanh tim
  // kiem, xem styles.css) nen khong con chiem cho trong luong flex nua -
  // phai tu danh rieng khoang trong ben phai cho cot noi dung bai hoc, dung
  // bang be rong panel HIEN TAI (co the keo doi) + khoang cach toi mep phai
  // cua panel (60px = gutter thanh cuon + toolbox + khoang cach, xem
  // .lesson-attachment-panel trong styles.css) + 1 khoang nho de khong
  // dinh sat panel.
  const mainContentStyle = activeAttachment ? { paddingRight: panelWidth + 60 + 12 } : undefined

  return (
    <div className="lesson-workspace-split">
      <div className="lesson-workspace-main" style={mainContentStyle}>
        <div className="lesson-workspace">
          <EditableTitle
            value={lesson.title}
            onSave={(title) => updateLesson.mutate({ id: lesson.id, title })}
          />
          <AttachmentsWidget
            lesson={lesson}
            activeAttachmentId={activeAttachment?.id ?? null}
            onOpenAttachment={requestOpenAttachment}
          />
          {defaultLessonLayout.map((kind) => {
            const Widget = lessonWidgetRegistry[kind]
            return (
              <Widget
                key={kind}
                lesson={lesson}
                onStartQuiz={onStartQuiz}
                onOpenLibrary={onOpenLibrary}
              />
            )
          })}
        </div>
      </div>
      {activeAttachment && (
        <>
          <AttachmentViewerPanel
            key={activeAttachment.id}
            attachment={activeAttachment}
            onClose={requestCloseAttachment}
            width={panelWidth}
            onWidthChange={handlePanelWidthChange}
          />
          <AnnotationToolbox attachmentId={activeAttachment.id} />
        </>
      )}
      <UnsavedAnnotationsDialog
        open={pendingAction !== null}
        onSaveAndContinue={() => resolvePendingAction(true)}
        onDiscardAndContinue={() => resolvePendingAction(false)}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}

export default LessonWorkspacePage
