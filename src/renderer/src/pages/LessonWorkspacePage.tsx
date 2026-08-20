import { useState } from 'react'
import { useLesson, useUpdateLesson } from '@renderer/queries/lessons'
import EditableTitle from '@renderer/components/common/EditableTitle'
import {
  defaultLessonLayout,
  lessonWidgetRegistry
} from '@renderer/components/lesson/widgetRegistry'
import AttachmentsWidget from '@renderer/components/lesson/widgets/AttachmentsWidget'
import AttachmentViewerPanel from '@renderer/components/lesson/AttachmentViewerPanel'
import type { Attachment } from '@shared/types/attachment'

interface LessonWorkspacePageProps {
  lessonId: string | null
}

const PANEL_WIDTH_STORAGE_KEY = 'lessonAttachmentPanelWidth'
const DEFAULT_PANEL_WIDTH = 420

function readStoredPanelWidth(): number {
  const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_PANEL_WIDTH
}

function LessonWorkspacePage({ lessonId }: LessonWorkspacePageProps): React.JSX.Element {
  const { data: lesson, isLoading } = useLesson(lessonId)
  const updateLesson = useUpdateLesson()
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null)
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth)

  const handlePanelWidthChange = (width: number): void => {
    setPanelWidth(width)
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
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

  return (
    <div className="lesson-workspace-split">
      <div className="lesson-workspace-main">
        <div className="lesson-workspace">
          <EditableTitle
            value={lesson.title}
            onSave={(title) => updateLesson.mutate({ id: lesson.id, title })}
          />
          <AttachmentsWidget
            lesson={lesson}
            activeAttachmentId={activeAttachment?.id ?? null}
            onOpenAttachment={setActiveAttachment}
          />
          {defaultLessonLayout.map((kind) => {
            const Widget = lessonWidgetRegistry[kind]
            return <Widget key={kind} lesson={lesson} />
          })}
        </div>
      </div>
      {activeAttachment && (
        <AttachmentViewerPanel
          attachment={activeAttachment}
          onClose={() => setActiveAttachment(null)}
          width={panelWidth}
          onWidthChange={handlePanelWidthChange}
        />
      )}
    </div>
  )
}

export default LessonWorkspacePage
