import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  // Thu gon chieu cao (dung khi dang xem 1 bai hoc, de nhuong khong gian
  // doc cho cua so file dinh kem o ben duoi) - xem App.tsx.
  compact?: boolean
}

function SearchBar({ value, onChange, compact }: SearchBarProps): React.JSX.Element {
  return (
    <div className={`search-bar${compact ? ' is-compact' : ''}`}>
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
