import { StatusDot } from '@/components/cells/StatusDot'
import { LabelChips } from '@/components/cells/LabelChips'

interface DetailOverviewProps {
  resource: Record<string, unknown>
  resourceType: string
}

export function DetailOverview({ resource, resourceType }: DetailOverviewProps) {
  const str = (key: string) => resource[key] != null ? String(resource[key]) : undefined

  return (
    <div className="space-y-4">
      {/* Status */}
      {str('status') && (
        <Section title="Status">
          <div className="flex items-center gap-2">
            <StatusDot status={str('status')!} />
            <span className="text-sm text-text-primary capitalize">
              {str('status')}
            </span>
          </div>
        </Section>
      )}

      {/* Common fields */}
      <Section title="Metadata">
        <Field label="Name" value={str('name')} />
        <Field label="Namespace" value={str('namespace')} />
        <Field label="Age" value={str('age')} />
      </Section>

      {/* Pod-specific */}
      {resourceType === 'pods' && str('node') && (
        <Section title="Scheduling">
          <Field label="Node" value={str('node')} />
          <Field label="Pod IP" value={str('ip')} />
          <Field label="Ready" value={str('ready')} />
          <Field label="Restarts" value={String(resource.restarts ?? 0)} />
        </Section>
      )}

      {/* Deployment-specific */}
      {resourceType === 'deployments' && (
        <Section title="Replicas">
          <Field label="Ready" value={str('ready')} />
          <Field label="Up-to-date" value={str('upToDate')} />
          <Field label="Available" value={str('available')} />
          <Field label="Strategy" value={str('strategy')} />
        </Section>
      )}

      {/* Service-specific */}
      {resourceType === 'services' && (
        <Section title="Networking">
          <Field label="Type" value={str('type')} />
          <Field label="Cluster IP" value={str('clusterIP')} />
          <Field label="External IP" value={str('externalIP')} />
          <Field label="Ports" value={str('ports')} />
        </Section>
      )}

      {/* Node-specific */}
      {resourceType === 'nodes' && (
        <Section title="System Info">
          <Field label="Roles" value={str('roles')} />
          <Field label="Version" value={str('version')} />
          <Field label="CPU" value={str('cpuCores')} />
          <Field label="Memory" value={str('memory')} />
        </Section>
      )}

      {/* Labels */}
      {resource.labels != null &&
        typeof resource.labels === 'object' && (
          <Section title="Labels">
            <LabelChips
              labels={resource.labels as Record<string, string>}
              maxVisible={10}
            />
          </Section>
        )}

      {/* Generic fields fallback */}
      <Section title="All Fields">
        {Object.entries(resource)
          .filter(
            ([k]) =>
              !['name', 'namespace', 'status', 'age', 'labels'].includes(k)
          )
          .map(([key, value]) => (
            <Field
              key={key}
              label={key}
              value={
                typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value ?? '—')
              }
            />
          ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-text-tertiary w-24 flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-text-primary break-all">{value}</span>
    </div>
  )
}
