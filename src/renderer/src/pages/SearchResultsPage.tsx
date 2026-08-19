import { useState } from 'react'
import { useSearch } from '@renderer/queries/search'
import SearchResultViewerModal, {
  type ViewerItem
} from '@renderer/components/search/SearchResultViewerModal'
import type { SearchResultItem } from '@shared/types/search'

interface SearchResultsPageProps {
  keyword: string
  onSelectLesson: (lessonId: string) => void
}

const SOURCE_LABEL: Record<string, string> = {
  lesson_note: 'Ghi chú bài học',
  attachment: 'Trong file đính kèm'
}

// snippet(search_index, 1, '[', ']', '…', 12) danh dau cum tu da khop bang
// "[" "]" - tach lai va boi vang phan trong ngoac, giu nguyen phan con lai.
function renderSnippet(snippet: string): React.ReactNode {
  const parts = snippet.split(/(\[[^\]]*\])/)
  return parts.map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return <mark key={i}>{part.slice(1, -1)}</mark>
    }
    return part ? <span key={i}>{part}</span> : null
  })
}

function SearchResultsPage({
  keyword,
  onSelectLesson
}: SearchResultsPageProps): React.JSX.Element {
  const { data: groups, isLoading } = useSearch(keyword)
  const [viewing, setViewing] = useState<SearchResultItem | null>(null)

  if (isLoading) return <div className="lesson-workspace-empty">Đang tìm...</div>

  if (!groups || groups.length === 0) {
    return (
      <div className="lesson-workspace-empty">Không tìm thấy kết quả nào cho "{keyword}".</div>
    )
  }

  const viewerItem: ViewerItem | null = viewing ? { ...viewing, keyword } : null
  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div className="search-results">
      <h2>
        Kết quả tìm kiếm: "{keyword}"{' '}
        <span className="search-result-count">({totalCount} kết quả)</span>
      </h2>
      {groups.map((group) => (
        <section key={group.topicId} className="search-result-group">
          <h3>{group.topicName}</h3>
          <ul>
            {group.items.map((item, idx) => (
              <li key={`${item.sourceType}-${item.sourceId}-${item.unitType}-${item.unitIndex}-${idx}`}>
                <button
                  type="button"
                  className="search-result-item"
                  onClick={() => setViewing(item)}
                >
                  <strong>{item.lessonTitle}</strong>
                  <span className="search-result-source">
                    {SOURCE_LABEL[item.sourceType] ?? item.sourceType}
                  </span>
                  <span className="search-result-snippet">{renderSnippet(item.snippet)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SearchResultViewerModal
        item={viewerItem}
        onClose={() => setViewing(null)}
        onOpenLesson={onSelectLesson}
      />
    </div>
  )
}

export default SearchResultsPage
