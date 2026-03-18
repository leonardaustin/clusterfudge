import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Cloud, Monitor, Container } from 'lucide-react'
import { cn } from '@/lib/utils'
import { providerGuides, type ProviderGuide } from './providerGuides'
import { CopyButton } from './CopyButton'

function providerIcon(id: string) {
  switch (id) {
    case 'eks':
    case 'gke':
    case 'aks':
      return <Cloud className="w-4 h-4" />
    case 'docker-desktop':
    case 'rancher-desktop':
      return <Monitor className="w-4 h-4" />
    default:
      return <Container className="w-4 h-4" />
  }
}

function ProviderCard({ guide }: { guide: ProviderGuide }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'hover:bg-bg-hover transition-colors',
          expanded && 'bg-bg-secondary'
        )}
      >
        <div className="w-8 h-8 rounded-md bg-bg-tertiary flex items-center justify-center text-text-secondary shrink-0">
          {providerIcon(guide.id)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">{guide.name}</div>
          <div className="text-2xs text-text-tertiary">{guide.description}</div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-primary space-y-3">
          <ol className="space-y-2">
            {guide.setupSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-2xs text-text-quaternary font-mono mt-0.5 shrink-0 w-4 text-right">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-secondary">{step.label}</div>
                  {step.command && (
                    <div className="flex items-center gap-1 mt-1 px-2 py-1.5 rounded bg-bg-tertiary font-mono text-2xs text-text-primary">
                      <span className="text-text-quaternary select-none">$</span>
                      <code className="flex-1 overflow-x-auto whitespace-nowrap">{step.command}</code>
                      <CopyButton text={step.command} />
                    </div>
                  )}
                  {step.note && (
                    <div className="text-2xs text-text-quaternary mt-1">{step.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-3 pt-1">
            {guide.docsUrl && (
              <a
                href={guide.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-2xs text-accent hover:underline"
              >
                Documentation <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface SetupGuidesProps {
  /** If true, show as compact inline section with a toggle */
  compact?: boolean
}

export function SetupGuides({ compact = false }: SetupGuidesProps) {
  const [visible, setVisible] = useState(!compact)

  const cloudProviders = providerGuides.filter((g) => g.category === 'cloud')
  const localProviders = providerGuides.filter((g) => g.category === 'local')
  const otherProviders = providerGuides.filter((g) => g.category === 'other')

  if (compact && !visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="text-2xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        Need help connecting to a cloud cluster?
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {compact && (
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">
            Setup Guides
          </span>
          <button
            onClick={() => setVisible(false)}
            className="text-2xs text-text-quaternary hover:text-text-secondary"
          >
            Hide
          </button>
        </div>
      )}

      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          Cloud Providers
        </p>
        <div className="space-y-2">
          {cloudProviders.map((g) => (
            <ProviderCard key={g.id} guide={g} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          Local Development
        </p>
        <div className="space-y-2">
          {localProviders.map((g) => (
            <ProviderCard key={g.id} guide={g} />
          ))}
        </div>
      </div>

      <div>
        <div className="space-y-2">
          {otherProviders.map((g) => (
            <ProviderCard key={g.id} guide={g} />
          ))}
        </div>
      </div>
    </div>
  )
}
