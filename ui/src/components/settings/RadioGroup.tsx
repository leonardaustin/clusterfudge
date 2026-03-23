interface RadioGroupProps {
  options: { label: string; value: string }[]
  value: string
  onChange?: (value: string) => void
}

export function RadioGroup({ options, value, onChange }: RadioGroupProps) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`settings-radio-option${value === opt.value ? ' active' : ''}`}
        >
          <input
            type="radio"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange?.(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
