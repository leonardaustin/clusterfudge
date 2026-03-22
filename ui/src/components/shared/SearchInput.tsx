interface SearchInputProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ placeholder = 'Filter...', value, onChange }: SearchInputProps) {
  return (
    <div className="search-input">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
