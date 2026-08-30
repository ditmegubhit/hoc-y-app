import { useEffect, useState } from 'react'
import { NotebookPen, ChevronRight } from 'lucide-react'
import LessonEditor from '../LessonEditor'
import { useUpdateLesson } from '@renderer/queries/lessons'
import type { LessonWidgetProps } from '../widgetRegistry'

function previewText(notesText: string | null): string {
  const t = (notesText ?? '').trim()
  if (!t) return 'Chưa có ghi chú.'
  return t.length > 140 ? `${t.slice(0, 140)}…` : t
}

function NotesWidget({ lesson }: LessonWidgetProps): React.JSX.Element {
  const updateLesson = useUpdateLesson()
  const [open, setOpen] = useState(false)

  // Doi bai hoc -> thu gon lai (moi bai bat dau o trang thai dong).
  useEffect(() => {
    setOpen(false)
  }, [lesson.id])

  return (
    <section className="lesson-widget notes-widget">
      <div className="notes-widget-header">
        <h3>
          <NotebookPen size={16} /> Ghi chú
        </h3>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight
            size={14}
            className={`notes-widget-chevron${open ? ' notes-widget-chevron--open' : ''}`}
          />
          {open ? 'Đóng' : 'Mở'}
        </button>
      </div>

      {open ? (
        <LessonEditor
          lessonId={lesson.id}
          initialContentJson={lesson.notesJson}
          onSave={(notesJson, notesText) => {
            updateLesson.mutate({ id: lesson.id, notesJson, notesText })
          }}
        />
      ) : (
        <p
          className="notes-widget-preview"
          onClick={() => setOpen(true)}
          title="Bấm để mở ghi chú"
        >
          {previewText(lesson.notesText)}
        </p>
      )}
    </section>
  )
}

export default NotesWidget
