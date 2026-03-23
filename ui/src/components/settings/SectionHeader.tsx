interface SectionHeaderProps {
  title: string
  description?: string
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <>
      <h2 className="settings-section-title">{title}</h2>
      {description && (
        <p className="settings-description" style={{ marginBottom: 'var(--space-3)' }}>
          {description}
        </p>
      )}
    </>
  )
}
