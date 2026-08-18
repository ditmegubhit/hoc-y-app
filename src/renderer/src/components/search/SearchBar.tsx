import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

function SearchBar({ value, onChange }: SearchBarProps): React.JSX.Element {
  return (
    <div className="search-bar">
      <Search size={16} className="search-bar-icon" />
      <input
        type="text"
        placeholder="Tìm kiếm trong tất cả bài học (vd: Myoglobin)..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} title="Xoá tìm kiếm">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

export default SearchBar
