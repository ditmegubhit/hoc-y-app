import { FileText, Folder } from 'lucide-react'
import { usePracticeSearch } from '@renderer/queries/practice'

interface PracticeSearchResultsProps {
  keyword: string
  onSelectFile: (fileId: string) => void
}

// Ket qua tim theo TEN file/thu muc trong khu Thuc hanh GP (kem duong dan thu muc).
function PracticeSearchResults({ keyword, onSelectFile }: PracticeSearchResultsProps): React.JSX.Element {
  const { data: results, isLoading } = usePracticeSearch(keyword)

  if (isLoading) return <div className="lesson-workspace-empty">Đang tìm...</div>
  if (!results || results.length === 0) {
    return <div className="lesson-workspace-empty">Không có file hay thư mục nào tên khớp &quot;{keyword}&quot;.</div>
  }

  return (
    <div className="practice-search-results">
      <h3 className="practice-search-title">
        Kết quả theo tên: &quot;{keyword}&quot; <span className="search-result-count">({results.length})</span>
      </h3>
      <ul>
        {results.map(({ node, pathNames }) => {
          const isFile = node.kind === 'file'
          return (
            <li key={node.id}>
              <button
                type="button"
                className="practice-search-item"
                disabled={!isFile}
                title={isFile ? 'Mở file này' : 'Thư mục - tìm trong cây bên trái'}
                onClick={() => onSelectFile(node.id)}
              >
                <span className="practice-search-icon">{isFile ? <FileText size={15} /> : <Folder size={15} />}</span>
                <span className="practice-search-name">{node.name}</span>
                <span className="practice-search-path">{pathNames.length > 0 ? pathNames.join(' / ') : 'Gốc'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default PracticeSearchResults
