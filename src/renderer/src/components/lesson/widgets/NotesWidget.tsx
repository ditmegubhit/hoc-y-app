import { NotebookPen } from 'lucide-react'
import LessonEditor from '../LessonEditor'
import { useUpdateLesson } from '@renderer/queries/lessons'
import type { LessonWidgetProps } from '../widgetRegistry'

function NotesWidget({ lesson }: LessonWidgetProps): React.JSX.Element {
  const updateLesson = useUpdateLesson()

  return (
    <section className="lesson-widget">
      <h3>
        <NotebookPen size={16} /> Ghi chú
      </h3>
      <LessonEditor
        lessonId={lesson.id}
        initialContentJson={lesson.notesJson}
        onSave={(notesJson, notesText) => {
          updateLesson.mutate({ id: lesson.id, notesJson, notesText })
        }}
      />
    </section>
  )
}

export default NotesWidget
