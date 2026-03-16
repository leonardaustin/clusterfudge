import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyButton } from './CopyButton'

interface Step {
  label: string
  command?: string
  note?: string
}

interface TroubleshootingIssue {
  id: string
  title: string
  description: string
  symptoms: string[]
  steps: Step[]
}

const issues: TroubleshootingIssue[] = [
  {
    id: 'reauth',
    title: 'Expired credentials',
    description: 'Cloud provider tokens (AWS SSO, gcloud, az) expire and need to be refreshed periodically.',
    symptoms: [
      'error: You must be logged in to the server (Unauthorized)',
      'Unable to connect to the server: getting credentials: exec: executable ... failed',
      'error: the server has asked for the client to provide credentials',
    ],
    steps: [
      { label: 'AWS EKS — Re-authenticate via SSO', command: 'aws sso login --profile <profile>', note: 'Replace <profile> with your AWS profile name' },
      { label: 'AWS EKS — Verify credentials', command: 'aws sts get-caller-identity' },
      { label: 'Google GKE — Re-authenticate', command: 'gcloud auth login' },
      { label: 'Google GKE — Refresh application default credentials', command: 'gcloud auth application-default login' },
      { label: 'Azure AKS — Re-authenticate', command: 'az login' },
      { label: 'Azure AKS — Clear cached tokens and re-login', command: 'az account clear && az login' },
      { label: 'After re-authenticating, click your cluster on the Clusters tab to reconnect' },
    ],
  },
  {
    id: 'ip-whitelist',
    title: 'IP address not whitelisted',
    description: 'Many managed clusters restrict API server access to a set of allowed IP ranges. If your IP changed (new network, VPN, ISP) you may be blocked.',
    symptoms: [
      'Unable to connect to the server: i/o timeout',
      'Client.Timeout exceeded while awaiting headers',
      'connect: connection refused',
      'Connection works from office/VPN but not from home (or vice versa)',
    ],
    steps: [
      { label: 'Check your current public IP', command: 'curl -s ifconfig.me', note: 'Compare this with the allowed ranges on your cluster' },
      { label: 'AWS EKS — View allowed CIDR blocks', command: 'aws eks describe-cluster --name <cluster-name> --query "cluster.resourcesVpcConfig.publicAccessCidrs"' },
      { label: 'AWS EKS — Add your IP to the allowlist', command: 'aws eks update-cluster-config --name <cluster-name> --resources-vpc-config publicAccessCidrs="<your-ip>/32,<existing-cidrs>"', note: 'Keep existing CIDRs and append yours' },
      { label: 'Google GKE — View authorized networks', command: 'gcloud container clusters describe <cluster-name> --region <region> --format="value(masterAuthorizedNetworksConfig.cidrBlocks)"' },
      { label: 'Google GKE — Add your IP', command: 'gcloud container clusters update <cluster-name> --region <region> --enable-master-authorized-networks --master-authorized-networks <your-ip>/32' },
      { label: 'Azure AKS — View authorized IP ranges', command: 'az aks show --resource-group <group> --name <cluster-name> --query "apiServerAccessProfile.authorizedIpRanges"' },
      { label: 'Azure AKS — Add your IP', command: 'az aks update --resource-group <group> --name <cluster-name> --api-server-authorized-ip-ranges <your-ip>/32,<existing-ranges>' },
      { label: 'Alternatively, connect through a VPN that routes through an allowed network' },
    ],
  },
  {
    id: 'timeout',
    title: 'Connection timeout',
    description: 'The API server is unreachable. This is typically a network issue — VPN not connected, firewall rules, or the cluster is down.',
    symptoms: [
      'Unable to connect to the server: dial tcp ... i/o timeout',
      'Client.Timeout exceeded while awaiting headers',
      'context deadline exceeded',
    ],
    steps: [
      { label: 'Test basic connectivity with kubectl', command: 'kubectl cluster-info', note: 'If this also times out the issue is not specific to KubeViewer' },
      { label: 'Check if a VPN connection is required', note: 'Private clusters typically require a VPN or bastion host' },
      { label: 'Verify the server address in your kubeconfig', command: 'kubectl config view --minify -o jsonpath=\'{.clusters[0].cluster.server}\'' },
      { label: 'Try curling the API server directly', command: 'curl -sk --connect-timeout 5 $(kubectl config view --minify -o jsonpath=\'{.clusters[0].cluster.server}\')/version' },
      { label: 'Check if the cluster is running', note: 'For managed clusters, check the cloud console. For local clusters (minikube, kind), make sure the VM/container is running' },
    ],
  },
  {
    id: 'tls',
    title: 'TLS / certificate errors',
    description: 'The API server\'s TLS certificate cannot be verified. This can happen with self-signed certificates, expired certs, or a MITM proxy.',
    symptoms: [
      'x509: certificate signed by unknown authority',
      'x509: certificate has expired or is not yet valid',
      'x509: certificate is valid for ... not ...',
    ],
    steps: [
      { label: 'Check if the certificate is expired', command: 'echo | openssl s_client -connect <server-host>:443 2>/dev/null | openssl x509 -noout -dates' },
      { label: 'If using a self-signed CA, ensure it is referenced in kubeconfig', note: 'The certificate-authority or certificate-authority-data field in your kubeconfig should point to the cluster CA' },
      { label: 'If behind a corporate proxy, you may need to trust the proxy CA', note: 'Add the proxy CA certificate to your system trust store' },
      { label: 'As a last resort, disable TLS verification (not recommended for production)', command: 'kubectl config set-cluster <cluster-name> --insecure-skip-tls-verify=true', note: 'This disables certificate validation — only use for testing' },
    ],
  },
  {
    id: 'exec-plugin',
    title: 'Missing auth plugin or CLI tool',
    description: 'Kubeconfigs for managed clusters often use exec-based auth plugins that require a provider CLI to be installed.',
    symptoms: [
      'Unable to connect to the server: getting credentials: exec: executable ... not found',
      'exec plugin: invalid apiVersion',
      'error: exec plugin: ... does not exist',
    ],
    steps: [
      { label: 'AWS EKS — Install the AWS CLI', command: 'brew install awscli' },
      { label: 'Google GKE — Install the auth plugin', command: 'gcloud components install gke-gcloud-auth-plugin' },
      { label: 'Azure AKS — Install kubelogin', command: 'brew install Azure/kubelogin/kubelogin' },
      { label: 'Verify the plugin is on your PATH', command: 'which aws && which gke-gcloud-auth-plugin && which kubelogin', note: 'Whichever is relevant to your provider' },
      { label: 'Check the exec command in your kubeconfig', command: 'kubectl config view --minify -o jsonpath=\'{.users[0].user.exec.command}\'' },
    ],
  },
  {
    id: 'local-cluster',
    title: 'Local cluster not running',
    description: 'Local development clusters (minikube, kind, Docker Desktop) need their VM or container runtime to be running.',
    symptoms: [
      'Unable to connect to the server: dial tcp 127.0.0.1:... connect: connection refused',
      'The connection to the server localhost:8443 was refused',
      'error during connect: ... Is the docker daemon running?',
    ],
    steps: [
      { label: 'minikube — Check status and start', command: 'minikube status && minikube start' },
      { label: 'kind — List running clusters', command: 'kind get clusters' },
      { label: 'kind — Ensure Docker is running, then recreate if needed', command: 'kind create cluster' },
      { label: 'Docker Desktop — Open Docker Desktop and ensure Kubernetes is enabled in Settings > Kubernetes' },
      { label: 'Rancher Desktop — Open the app and check that Kubernetes is enabled in Preferences' },
    ],
  },
  {
    id: 'stale-kubeconfig',
    title: 'Stale or incorrect kubeconfig',
    description: 'The kubeconfig may reference a cluster that has been deleted, recreated, or whose endpoint has changed.',
    symptoms: [
      'Unable to connect to the server: dial tcp: lookup ... no such host',
      'the server could not find the requested resource',
      'Cluster connects but shows unexpected or empty namespaces',
    ],
    steps: [
      { label: 'List all contexts in your kubeconfig', command: 'kubectl config get-contexts' },
      { label: 'Check which context is active', command: 'kubectl config current-context' },
      { label: 'AWS EKS — Re-generate kubeconfig', command: 'aws eks update-kubeconfig --name <cluster-name> --region <region>' },
      { label: 'Google GKE — Re-generate kubeconfig', command: 'gcloud container clusters get-credentials <cluster-name> --region <region> --project <project>' },
      { label: 'Azure AKS — Re-generate kubeconfig', command: 'az aks get-credentials --resource-group <group> --name <cluster-name> --overwrite-existing' },
      { label: 'Remove a stale context', command: 'kubectl config delete-context <context-name>' },
    ],
  },
]

function IssueCard({ issue }: { issue: TroubleshootingIssue }) {
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
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">{issue.title}</div>
          <div className="text-2xs text-text-tertiary">{issue.description}</div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-primary space-y-4">
          {/* Symptoms */}
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              Common error messages
            </p>
            <ul className="space-y-1">
              {issue.symptoms.map((s, i) => (
                <li key={i} className="text-2xs text-text-secondary font-mono px-2 py-1 rounded bg-bg-tertiary">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Resolution steps */}
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              How to fix
            </p>
            <ol className="space-y-2">
              {issue.steps.map((step, i) => (
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
          </div>
        </div>
      )}
    </div>
  )
}

export function TroubleshootingGuide() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 className="settings-section-title">Troubleshooting</h2>
      <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
        Common connection issues and how to resolve them. Click an issue to see symptoms and fixes.
      </p>
      <div className="space-y-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  )
}
