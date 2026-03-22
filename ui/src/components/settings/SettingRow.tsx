import type { ReactNode } from 'react'

interface SettingRowProps {
  label: string
  description?: string
  htmlFor?: string
  children: ReactNode
}

export function SettingRow({ label, description, htmlFor, children }: SettingRowProps) {
  return (
    <div className="settings-row">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="settings-label">{label}</label>
        ) : (
          <div className="settings-label">{label}</div>
        )}
        {description && <div className="settings-description">{description}</div>}
      </div>
      {children}
    </div>
  )
}
