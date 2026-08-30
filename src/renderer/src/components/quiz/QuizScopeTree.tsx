import { useMemo } from 'react'
import { ChevronRight, Folder, BookOpen } from 'lucide-react'
import { useTopics } from '@renderer/queries/topics'
import { useLessons } from '@renderer/queries/lessons'

interface QuizScopeTreeProps {
  rootTopicId: string
  selected: string[] // lessonId[]
  expanded: string[] // topicId[]
  onToggleLesson: (lessonId: string) => void
  onToggleTopic: (lessonIdsUnderTopic: string[], shouldSelect: boolean) => void
  onToggleExpand: (topicId: string) => void
}

function TriStateCheckbox({
  state,
  onChange
}: {
  state: 'none' | 'some' | 'all'
  onChange: () => void
}): React.JSX.Element {
  return (
    <input
      type="checkbox"
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some'
      }}
      onChange={onChange}
    />
  )
}

function QuizScopeTree({
  rootTopicId,
  selected,
  expanded,
  onToggleLesson,
  onToggleTopic,
  onToggleExpand
}: QuizScopeTreeProps): React.JSX.Element {
  const topicsQuery = useTopics()
  const lessonsQuery = useLessons()

  const { childTopicsOf, childLessonsOf, descendantLessonIds } = useMemo(() => {
    const topics = topicsQuery.data ?? []
    const lessons = lessonsQuery.data ?? []
    const childTopicsOf = (parentId: string | null): typeof topics =>
      topics.filter((t) => t.parentId === parentId)
    const childLessonsOf = (topicId: string): typeof lessons =>
      lessons.filter((l) => l.topicId === topicId)
    const descendantLessonIds = (topicId: string): string[] => {
      const acc: string[] = []
      const walk = (tid: string): void => {
        for (const l of childLessonsOf(tid)) acc.push(l.id)
        for (const st of childTopicsOf(tid)) walk(st.id)
      }
      walk(topicId)
      return acc
    }
    return { childTopicsOf, childLessonsOf, descendantLessonIds }
  }, [topicsQuery.data, lessonsQuery.data])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const expandedSet = useMemo(() => new Set(expanded), [expanded])

  const topicState = (topicId: string): 'none' | 'some' | 'all' => {
    const ids = descendantLessonIds(topicId)
    if (ids.length === 0) return 'none'
    const picked = ids.filter((id) => selectedSet.has(id)).length
    if (picked === 0) return 'none'
    if (picked === ids.length) return 'all'
    return 'some'
  }

  const renderTopic = (topicId: string, topicName: string, depth: number): React.JSX.Element => {
    const subTopics = childTopicsOf(topicId)
    const lessons = childLessonsOf(topicId)
    const hasChildren = subTopics.length > 0 || lessons.length > 0
    const isOpen = expandedSet.has(topicId)
    const state = topicState(topicId)

    return (
      <div key={topicId}>
        <div className="quiz-scope-tree-node" style={{ paddingLeft: `${depth * 1.1}rem` }}>
          {hasChildren ? (
            <button
              type="button"
              className={`quiz-scope-tree-toggle${isOpen ? ' quiz-scope-tree-toggle--open' : ''}`}
              onClick={() => onToggleExpand(topicId)}
              title={isOpen ? 'Thu gọn' : 'Mở rộng'}
            >
              <ChevronRight size={14} />
            </button>
          ) : (
            <span className="quiz-scope-tree-spacer" />
          )}
          <TriStateCheckbox
            state={state}
            onChange={() => onToggleTopic(descendantLessonIds(topicId), state !== 'all')}
          />
          <Folder size={13} />
          <span>{topicName}</span>
        </div>
        {isOpen && (
          <>
            {subTopics.map((st) => renderTopic(st.id, st.name, depth + 1))}
            {lessons.map((l) => (
              <div
                key={l.id}
                className="quiz-scope-tree-node"
                style={{ paddingLeft: `${(depth + 1) * 1.1}rem` }}
              >
                <span className="quiz-scope-tree-spacer" />
                <input
                  type="checkbox"
                  checked={selectedSet.has(l.id)}
                  onChange={() => onToggleLesson(l.id)}
                />
                <BookOpen size={13} />
                <span>{l.title}</span>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  const rootChildren = childTopicsOf(rootTopicId)
  const rootLessons = childLessonsOf(rootTopicId)

  return (
    <div className="quiz-scope-tree">
      {rootChildren.map((st) => renderTopic(st.id, st.name, 0))}
      {rootLessons.map((l) => (
        <div key={l.id} className="quiz-scope-tree-node">
          <span className="quiz-scope-tree-spacer" />
          <input
            type="checkbox"
            checked={selectedSet.has(l.id)}
            onChange={() => onToggleLesson(l.id)}
          />
          <BookOpen size={13} />
          <span>{l.title}</span>
        </div>
      ))}
      {rootChildren.length === 0 && rootLessons.length === 0 && (
        <p className="lesson-widget-placeholder">Chủ đề này chưa có bài học nào.</p>
      )}
    </div>
  )
}

export default QuizScopeTree
