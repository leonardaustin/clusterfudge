import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { guideForProvider } from './providerGuides'
import { CopyButton } from './CopyButton'

interface AuthErrorHelpProps {
  authProvider?: string
  errorCode?: string
}

export function AuthErrorHelp({ authProvider, errorCode }: AuthErrorHelpProps) {
  const [expanded, setExpanded] = useState(false)

  // Only show for auth-related errors
  if (errorCode !== 'AUTH_ERROR' && errorCode !== 'CONNECTION_ERROR') return null

  const guide = guideForProvider(authProvider)
  if (!guide) return null

  const steps = guide.reauthSteps
  if (!steps || steps.length === 0) return null

  const providerLabel = guide.name

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 text-2xs',
          'text-accent hover:underline'
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        How to re-authenticate with {providerLabel}
      </button>

      {expanded && (
        <div className="mt-2 mx-1 px-3 py-2 rounded-md bg-bg-secondary border border-border space-y-2">
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-2xs text-text-quaternary font-mono mt-0.5 shrink-0 w-3 text-right">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-2xs text-text-secondary">{step.label}</div>
                  {step.command && (
                    <div className="flex items-center gap-1 mt-0.5 px-2 py-1 rounded bg-bg-tertiary font-mono text-2xs text-text-primary">
                      <span className="text-text-quaternary select-none">$</span>
                      <code className="flex-1 overflow-x-auto whitespace-nowrap">{step.command}</code>
                      <CopyButton text={step.command} />
                    </div>
                  )}
                  {step.note && (
                    <div className="text-2xs text-text-quaternary mt-0.5">{step.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="text-2xs text-text-tertiary">
            Then click the cluster above to reconnect.
          </div>
          {guide.docsUrl && (
            <a
              href={guide.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-2xs text-accent hover:underline"
            >
              {providerLabel} docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Inline re-auth help for the ConnectionLostBanner */
export function InlineAuthHelp({ authProvider }: { authProvider?: string }) {
  const guide = guideForProvider(authProvider)
  if (!guide?.reauthSteps?.length) return null

  const primaryStep = guide.reauthSteps[0]
  if (!primaryStep?.command) return null

  return (
    <span className="inline-flex items-center gap-1.5 ml-1">
      <span className="text-text-secondary">Try:</span>
      <code className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-2xs">
        {primaryStep.command}
      </code>
    </span>
  )
}
