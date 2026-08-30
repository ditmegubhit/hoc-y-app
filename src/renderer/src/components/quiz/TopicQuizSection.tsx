import { useMemo, useState } from 'react'
import { ClipboardList, Library } from 'lucide-react'
import type { Topic } from '@shared/types/topic'
import type { QuizLaunchRequest, QuizLibraryRequest } from '@shared/types/quiz'
import { useTopics } from '@renderer/queries/topics'
import { useLessons } from '@renderer/queries/lessons'
import { useQuestionsUnderTopic } from '@renderer/queries/questionBank'
import {
  useAttemptsByTopic,
  useDeleteAttempt,
  usePlayableQuestionsForTopic,
  type QuizScope
} from '@renderer/queries/quiz'
import QuizScopeTree from './QuizScopeTree'
import QuizGeneratePanel from './QuizGeneratePanel'
import QuizAttemptHistory from './QuizAttemptHistory'
import QuizAttemptReviewModal from './QuizAttemptReviewModal'

interface TopicQuizSectionProps {
  topic: Topic
  onStartQuiz: (req: QuizLaunchRequest) => void
  onOpenLibrary: (req: QuizLibraryRequest) => void
}

function TopicQuizSection({
  topic,
  onStartQuiz,
  onOpenLibrary
}: TopicQuizSectionProps): React.JSX.Element {
  const topicsQuery = useTopics()
  const lessonsQuery = useLessons()

  const allDescendantLessonIds = useMemo(() => {
    const topics = topicsQuery.data ?? []
    const lessons = lessonsQuery.data ?? []
    const acc: string[] = []
    const walk = (tid: string): void => {
      for (const l of lessons.filter((x) => x.topicId === tid)) acc.push(l.id)
      for (const st of topics.filter((x) => x.parentId === tid)) walk(st.id)
    }
    walk(topic.id)
    return acc
  }, [topicsQuery.data, lessonsQuery.data, topic.id])

  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null)

  const scope: QuizScope = { type: 'topic', topicId: topic.id, lessonIds: selected }

  const playableQuery = usePlayableQuestionsForTopic(topic.id, selected)
  const libraryQuery = useQuestionsUnderTopic(topic.id)
  const attemptsQuery = useAttemptsByTopic(topic.id)
  const deleteAttempt = useDeleteAttempt(scope)

  const toggleLesson = (id: string): void =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const toggleTopic = (ids: string[], shouldSelect: boolean): void =>
    setSelected((s) => {
      const set = new Set(s)
      ids.forEach((id) => (shouldSelect ? set.add(id) : set.delete(id)))
      return [...set]
    })

  const toggleExpand = (id: string): void =>
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))

  return (
    <section className="lesson-widget quiz-topic-section">
      <h3>
        <ClipboardList size={16} /> Kiểm tra (cả chủ đề này)
      </h3>
      <p className="quiz-setup-available">Chọn bài học muốn đưa vào bài kiểm tra:</p>

      <div className="quiz-checklist-actions">
        <button type="button" onClick={() => setSelected(allDescendantLessonIds)}>
          Chọn tất cả
        </button>
        <button type="button" onClick={() => setSelected([])}>
          Bỏ chọn tất cả
        </button>
      </div>

      <QuizScopeTree
        rootTopicId={topic.id}
        selected={selected}
        expanded={expanded}
        onToggleLesson={toggleLesson}
        onToggleTopic={toggleTopic}
        onToggleExpand={toggleExpand}
      />

      <QuizGeneratePanel scope={scope} />

      <div className="quiz-ai-play">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            onOpenLibrary({
              scopeType: 'topic',
              lessonId: null,
              topicId: topic.id,
              title: `Ngân hàng câu hỏi: ${topic.name}`
            })
          }
        >
          <Library size={14} /> Ngân hàng câu hỏi ({libraryQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={selected.length === 0 || (playableQuery.data?.length ?? 0) === 0}
          title={selected.length === 0 ? 'Chọn ít nhất một bài học' : undefined}
          onClick={() =>
            onStartQuiz({
              scopeType: 'topic',
              topicId: topic.id,
              lessonId: null,
              lessonIds: selected,
              title: `Kiểm tra: ${topic.name}`
            })
          }
        >
          Làm bài kiểm tra
        </button>
      </div>

      <QuizAttemptHistory
        attempts={attemptsQuery.data}
        isLoading={attemptsQuery.isLoading}
        onOpenReview={setReviewAttemptId}
        onDelete={(id) => deleteAttempt.mutate(id)}
      />
      <QuizAttemptReviewModal
        attemptId={reviewAttemptId}
        onClose={() => setReviewAttemptId(null)}
      />
    </section>
  )
}

export default TopicQuizSection
