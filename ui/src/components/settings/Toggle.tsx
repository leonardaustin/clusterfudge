interface ToggleProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`settings-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange?.(!checked)}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
}
