import { BookOpen, FolderTree, ListChecks, Clock, Plus } from 'lucide-react'
import { useTopics, useCreateTopic } from '@renderer/queries/topics'
import { useLessons, useRecentLessons } from '@renderer/queries/lessons'
import { useQuestionBankCount } from '@renderer/queries/questionBank'

interface HomePageProps {
  onSelectLesson: (lessonId: string) => void
}

function formatRelativeTime(sqliteDatetime: string): string {
  // SQLite datetime('now') tra ve "YYYY-MM-DD HH:MM:SS" (UTC, cach nhau bang space,
  // khong co 'T'/'Z') - phai chuyen dung dinh dang ISO truoc khi parse, neu khong
  // Date se hieu nham la gio dia phuong.
  const isoUtc = `${sqliteDatetime.replace(' ', 'T')}Z`
  const diffMs = Date.now() - new Date(isoUtc).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  return `${days} ngày trước`
}

function HomePage({ onSelectLesson }: HomePageProps): React.JSX.Element {
  const topicsQuery = useTopics()
  const lessonsQuery = useLessons()
  const questionCountQuery = useQuestionBankCount()
  const recentQuery = useRecentLessons(5)
  const createTopic = useCreateTopic()

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>Chào bạn 👋</h1>
        <p className="home-subtitle">Hôm nay ôn tập gì nào?</p>
      </div>

      <div className="home-stats">
        <div className="stat-card">
          <FolderTree size={22} className="stat-icon" />
          <div>
            <div className="stat-value">{topicsQuery.data?.length ?? '—'}</div>
            <div className="stat-label">Chủ đề</div>
          </div>
        </div>
        <div className="stat-card">
          <BookOpen size={22} className="stat-icon" />
          <div>
            <div className="stat-value">{lessonsQuery.data?.length ?? '—'}</div>
            <div className="stat-label">Bài học</div>
          </div>
        </div>
        <div className="stat-card">
          <ListChecks size={22} className="stat-icon" />
          <div>
            <div className="stat-value">{questionCountQuery.data ?? '—'}</div>
            <div className="stat-label">Câu hỏi đã lưu</div>
          </div>
        </div>
      </div>

      <div className="home-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={createTopic.isPending}
          onClick={() => createTopic.mutate({ parentId: null, name: 'Chủ đề mới' })}
        >
          <Plus size={16} /> Tạo chủ đề mới
        </button>
      </div>

      <section className="home-recent">
        <h2>
          <Clock size={18} /> Bài học gần đây
        </h2>
        {recentQuery.data && recentQuery.data.length === 0 && (
          <p className="lesson-widget-placeholder">
            Chưa có bài học nào. Tạo chủ đề rồi thêm bài học để bắt đầu học nhé.
          </p>
        )}
        <ul className="recent-lesson-list">
          {recentQuery.data?.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                className="recent-lesson-item"
                onClick={() => onSelectLesson(lesson.id)}
              >
                <BookOpen size={16} className="recent-lesson-icon" />
                <div className="recent-lesson-info">
                  <strong>{lesson.title}</strong>
                  <span className="recent-lesson-meta">
                    {lesson.topicName} · {formatRelativeTime(lesson.updatedAt)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default HomePage
