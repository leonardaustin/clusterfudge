interface LogLine {
  timestamp: string
  content: string
}

interface LogViewerProps {
  title: string
  lines: LogLine[]
}

export function LogViewer({ title, lines }: LogViewerProps) {
  return (
    <>
      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
        <span className="prop-group-title">{title}</span>
      </div>
      <div className="log-viewer" style={{ marginTop: 'var(--space-3)', maxHeight: '200px' }}>
        {lines.map((line, i) => (
          <div key={i} className="log-line">
            <span className="log-timestamp">{line.timestamp}</span>
            <span className="log-content">{line.content}</span>
          </div>
        ))}
      </div>
    </>
  )
}
