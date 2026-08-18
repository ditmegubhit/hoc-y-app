import { useLesson, useUpdateLesson } from '@renderer/queries/lessons'
import EditableTitle from '@renderer/components/common/EditableTitle'
import {
  defaultLessonLayout,
  lessonWidgetRegistry
} from '@renderer/components/lesson/widgetRegistry'

interface LessonWorkspacePageProps {
  lessonId: string | null
}

function LessonWorkspacePage({ lessonId }: LessonWorkspacePageProps): React.JSX.Element {
  const { data: lesson, isLoading } = useLesson(lessonId)
  const updateLesson = useUpdateLesson()

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
    <div className="lesson-workspace">
      <EditableTitle
        value={lesson.title}
        onSave={(title) => updateLesson.mutate({ id: lesson.id, title })}
      />
      {defaultLessonLayout.map((kind) => {
        const Widget = lessonWidgetRegistry[kind]
        return <Widget key={kind} lesson={lesson} />
      })}
    </div>
  )
}

export default LessonWorkspacePage
