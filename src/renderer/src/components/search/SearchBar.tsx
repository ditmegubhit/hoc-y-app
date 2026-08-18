interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

function SearchBar({ value, onChange }: SearchBarProps): React.JSX.Element {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Tìm kiếm trong tất cả bài học (vd: Myoglobin)..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} title="Xoá tìm kiếm">
          ✕
        </button>
      )}
    </div>
  )
}

export default SearchBar
