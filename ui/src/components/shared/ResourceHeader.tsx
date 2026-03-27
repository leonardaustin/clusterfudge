interface ResourceHeaderProps {
  title: string
  subtitle: string
  children?: React.ReactNode
}

export function ResourceHeader({ title, subtitle, children }: ResourceHeaderProps) {
  return (
    <div className="resource-header">
      <div>
        <h1>{title}</h1>
        <div className="subtitle">{subtitle}</div>
      </div>
      {children && <div className="resource-header-actions">{children}</div>}
    </div>
  )
}
