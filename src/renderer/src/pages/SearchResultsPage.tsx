import { useSearch } from '@renderer/queries/search'

interface SearchResultsPageProps {
  keyword: string
  onSelectLesson: (lessonId: string) => void
}

const SOURCE_LABEL: Record<string, string> = {
  lesson_note: 'Ghi chú bài học',
  attachment: 'Trong file đính kèm'
}

function SearchResultsPage({
  keyword,
  onSelectLesson
}: SearchResultsPageProps): React.JSX.Element {
  const { data: groups, isLoading } = useSearch(keyword)

  if (isLoading) return <div className="lesson-workspace-empty">Đang tìm...</div>

  if (!groups || groups.length === 0) {
    return (
      <div className="lesson-workspace-empty">Không tìm thấy kết quả nào cho "{keyword}".</div>
    )
  }

  return (
    <div className="search-results">
      <h2>Kết quả tìm kiếm: "{keyword}"</h2>
      {groups.map((group) => (
        <section key={group.topicId} className="search-result-group">
          <h3>{group.topicName}</h3>
          <ul>
            {group.items.map((item, idx) => (
              <li key={`${item.sourceType}-${item.sourceId}-${idx}`}>
                <button
                  type="button"
                  className="search-result-item"
                  onClick={() => onSelectLesson(item.lessonId)}
                >
                  <strong>{item.lessonTitle}</strong>
                  <span className="search-result-source">
                    {SOURCE_LABEL[item.sourceType] ?? item.sourceType}
                  </span>
                  <span className="search-result-snippet">{item.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default SearchResultsPage
