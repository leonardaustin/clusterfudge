interface SliderProps {
  value: number
  min: number
  max: number
  unit?: string
  onChange?: (value: number) => void
}

export function Slider({ value, min, max, unit, onChange }: SliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="settings-slider"
      />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>
        {value}{unit}
      </span>
    </div>
  )
}
