import type { ContainerInfo } from '../../data/types'

interface ContainerCardProps {
  container: ContainerInfo
}

export function ContainerCard({ container }: ContainerCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-2)',
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {container.name}
        </span>
        <span className="badge badge-green" style={{ fontSize: 'var(--text-2xs)' }}>
          {container.status}
        </span>
      </div>
      <div className="prop-list" style={{ fontSize: 'var(--text-xs)' }}>
        <span className="prop-label">Image</span>
        <span className="prop-value mono">{container.image}</span>
        {container.port && (
          <>
            <span className="prop-label">Port</span>
            <span className="prop-value">{container.port}</span>
          </>
        )}
        <span className="prop-label">CPU</span>
        <span className="prop-value">
          {container.cpuUsage != null ? (
            <span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{container.cpuUsage}m</span>
              <span style={{ color: 'var(--text-tertiary)' }}> used</span>
              <span style={{ color: 'var(--text-disabled)' }}> | {container.cpu}</span>
            </span>
          ) : (
            container.cpu
          )}
        </span>
        <span className="prop-label">Memory</span>
        <span className="prop-value">
          {container.memoryUsage != null ? (
            <span>
              <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{container.memoryUsage}Mi</span>
              <span style={{ color: 'var(--text-tertiary)' }}> used</span>
              <span style={{ color: 'var(--text-disabled)' }}> | {container.memory}</span>
            </span>
          ) : (
            container.memory
          )}
        </span>
        <span className="prop-label">Started</span>
        <span className="prop-value">{container.started}</span>
      </div>
    </div>
  )
}
