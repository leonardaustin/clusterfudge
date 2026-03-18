import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  ArrowUpDown,
  Bot,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  Terminal,
  Trash2,
  Unlock,
  Workflow,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type ResourceKind = 'Pod' | 'Deployment' | 'Node' | 'Service' | 'ConfigMap' | 'Secret' | string

export interface AIProviderOption {
  id: string
  name: string
}

export interface ResourceContextAction {
  onViewDetails?: () => void
  onViewLogs?: () => void
  onExecShell?: () => void
  onAIDiagnose?: (providerID: string) => void
  onEditYAML?: () => void
  onScale?: () => void
  onRestart?: () => void
  onDelete?: () => void
  onCordon?: () => void
  onUncordon?: () => void
  onDrain?: () => void
  onPortForward?: () => void
}

interface ResourceContextMenuProps {
  children: ReactNode
  kind: ResourceKind
  name: string
  isRunning?: boolean
  isCordoned?: boolean
  actions: ResourceContextAction
  aiProviders?: AIProviderOption[]
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  danger,
  disabled,
  onClick,
}: {
  icon: typeof Eye
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <ContextMenu.Item
      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default outline-none data-[highlighted]:bg-[var(--bg-hover)]"
      style={{
        color: danger ? 'var(--red)' : disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
        opacity: disabled ? 0.4 : 1,
      }}
      disabled={disabled}
      onSelect={onClick}
    >
      <Icon size={14} />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] ml-4" style={{ color: 'var(--text-tertiary)' }}>
          {shortcut}
        </span>
      )}
    </ContextMenu.Item>
  )
}

export function ResourceContextMenu({
  children,
  kind,
  name,
  isRunning = true,
  isCordoned = false,
  actions,
  aiProviders = [],
}: ResourceContextMenuProps) {
  const isPod = kind === 'Pod'
  const isDeployment = kind === 'Deployment'
  const isNode = kind === 'Node'
  const hasAI = aiProviders.length > 0

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[180px] rounded-md p-1 z-50"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* Header */}
          <div className="px-2 py-1.5 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {kind}
            </p>
            <p
              className="text-xs font-mono font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {name}
            </p>
          </div>

          {/* View actions */}
          <MenuItem icon={Eye} label="View Details" onClick={actions.onViewDetails} />

          {isPod && (
            <>
              <MenuItem
                icon={FileText}
                label="View Logs"
                shortcut="L"
                onClick={actions.onViewLogs}
              />
              <MenuItem
                icon={Terminal}
                label="Exec Shell"
                shortcut="S"
                disabled={!isRunning}
                onClick={actions.onExecShell}
              />
              {/* AI provider items — one per enabled provider */}
              {hasAI && aiProviders.map((provider) => (
                <MenuItem
                  key={provider.id}
                  icon={Bot}
                  label={`Debug with ${provider.name}`}
                  disabled={!isRunning}
                  onClick={() => actions.onAIDiagnose?.(provider.id)}
                />
              ))}
              {actions.onPortForward && (
                <MenuItem
                  icon={Workflow}
                  label="Port Forward"
                  disabled={!isRunning}
                  onClick={actions.onPortForward}
                />
              )}
            </>
          )}

          {isDeployment && (
            <>
              <ContextMenu.Separator
                className="h-px my-1"
                style={{ background: 'var(--border)' }}
              />
              <MenuItem
                icon={ArrowUpDown}
                label="Scale"
                onClick={actions.onScale}
              />
              <MenuItem
                icon={RefreshCw}
                label="Restart"
                onClick={actions.onRestart}
              />
            </>
          )}

          {isNode && (
            <>
              <ContextMenu.Separator
                className="h-px my-1"
                style={{ background: 'var(--border)' }}
              />
              {isCordoned ? (
                <MenuItem
                  icon={Unlock}
                  label="Uncordon"
                  onClick={actions.onUncordon}
                />
              ) : (
                <MenuItem
                  icon={Lock}
                  label="Cordon"
                  onClick={actions.onCordon}
                />
              )}
              <MenuItem
                icon={Workflow}
                label="Drain"
                onClick={actions.onDrain}
              />
            </>
          )}

          {(actions.onEditYAML || actions.onDelete) && (
            <ContextMenu.Separator
              className="h-px my-1"
              style={{ background: 'var(--border)' }}
            />
          )}

          {actions.onEditYAML && (
            <MenuItem
              icon={FileText}
              label="Edit YAML"
              onClick={actions.onEditYAML}
            />
          )}

          {actions.onDelete && (
            <>
              <ContextMenu.Separator
                className="h-px my-1"
                style={{ background: 'var(--border)' }}
              />
              <MenuItem
                icon={Trash2}
                label="Delete"
                shortcut="Del"
                danger
                onClick={actions.onDelete}
              />
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
