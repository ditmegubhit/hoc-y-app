import { Folder, BookOpen } from 'lucide-react'
import EditableTitle from '@renderer/components/common/EditableTitle'
import { useTopics, useUpdateTopic } from '@renderer/queries/topics'
import { useLessons } from '@renderer/queries/lessons'

interface TopicWorkspacePageProps {
  topicId: string
  onSelectTopic: (topicId: string) => void
  onSelectLesson: (lessonId: string) => void
}

function TopicWorkspacePage({
  topicId,
  onSelectTopic,
  onSelectLesson
}: TopicWorkspacePageProps): React.JSX.Element {
  const topicsQuery = useTopics()
  const lessonsQuery = useLessons()
  const updateTopic = useUpdateTopic()

  const topic = topicsQuery.data?.find((t) => t.id === topicId)
  const childTopics = topicsQuery.data?.filter((t) => t.parentId === topicId) ?? []
  const childLessons = lessonsQuery.data?.filter((l) => l.topicId === topicId) ?? []

  if (!topic) {
    return <div className="lesson-workspace-empty">Đang tải chủ đề...</div>
  }

  return (
    <div className="lesson-workspace">
      <EditableTitle
        value={topic.name}
        onSave={(name) => updateTopic.mutate({ id: topic.id, name })}
      />

      {childTopics.length === 0 && childLessons.length === 0 && (
        <p className="lesson-widget-placeholder">
          Chủ đề này chưa có chủ đề con hay bài học nào. Dùng nút +📁 / +📄 khi rê chuột vào chủ
          đề trong cây bên trái để thêm.
        </p>
      )}

      {childTopics.length > 0 && (
        <section className="topic-children-section">
          <h3>
            <Folder size={16} /> Chủ đề con
          </h3>
          <ul className="recent-lesson-list">
            {childTopics.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="recent-lesson-item"
                  onClick={() => onSelectTopic(t.id)}
                >
                  <Folder size={16} className="recent-lesson-icon" />
                  <div className="recent-lesson-info">
                    <strong>{t.name}</strong>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {childLessons.length > 0 && (
        <section className="topic-children-section">
          <h3>
            <BookOpen size={16} /> Bài học
          </h3>
          <ul className="recent-lesson-list">
            {childLessons.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="recent-lesson-item"
                  onClick={() => onSelectLesson(l.id)}
                >
                  <BookOpen size={16} className="recent-lesson-icon" />
                  <div className="recent-lesson-info">
                    <strong>{l.title}</strong>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default TopicWorkspacePage
