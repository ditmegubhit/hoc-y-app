import type { LessonWidgetProps } from '../widgetRegistry'

function AttachmentsWidget({}: LessonWidgetProps): React.JSX.Element {
  return (
    <section className="lesson-widget">
      <h3>File đính kèm</h3>
      <p className="lesson-widget-placeholder">
        Sẽ hỗ trợ đính kèm PDF / Word / PowerPoint / Ảnh ở milestone M3.
      </p>
    </section>
  )
}

export default AttachmentsWidget
