import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyButton } from './CopyButton'

interface TimeoutErrorHelpProps {
  errorCode?: string
}

interface TroubleshootStep {
  label: string
  command?: string
  note?: string
}

const troubleshootSteps: TroubleshootStep[] = [
  {
    label: 'Check if the cluster is reachable',
    command: 'kubectl cluster-info',
    note: 'If this also times out, the issue is not specific to Clusterfudge',
  },
  {
    label: 'Verify your VPN is connected (if required)',
    note: 'Many private clusters require a VPN or bastion host',
  },
  {
    label: 'Check the server address in your kubeconfig',
    command: 'kubectl config view --minify -o jsonpath=\'{.clusters[0].cluster.server}\'',
    note: 'Ensure the IP/hostname is correct and the cluster is still running',
  },
  {
    label: 'Test network connectivity to the API server',
    command: 'curl -sk --connect-timeout 5 $(kubectl config view --minify -o jsonpath=\'{.clusters[0].cluster.server}\')/version',
  },
  {
    label: 'Check for firewall or security group rules',
    note: 'Ensure port 443 (or your API server port) is open from your network',
  },
]

export function TimeoutErrorHelp({ errorCode }: TimeoutErrorHelpProps) {
  const [expanded, setExpanded] = useState(false)

  if (errorCode !== 'TIMEOUT' && errorCode !== 'CONNECTION_ERROR') return null

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
        Troubleshooting tips
      </button>

      {expanded && (
        <div className="mt-2 mx-1 px-3 py-2 rounded-md bg-bg-secondary border border-border space-y-2">
          <ol className="space-y-1.5">
            {troubleshootSteps.map((step, i) => (
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
            Once the issue is resolved, click the cluster above to retry.
          </div>
        </div>
      )}
    </div>
  )
}
