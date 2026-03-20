import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

type RBACTab = 'roles' | 'clusterRoles' | 'roleBindings' | 'clusterRoleBindings'

interface RBACRule {
  apiGroups: string[]
  resources: string[]
  verbs: string[]
}

const roleColumns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'rules', label: 'Rules', className: 'col-xs' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const clusterRoleColumns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'rules', label: 'Rules', className: 'col-xs' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const roleBindingColumns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'role', label: 'Role', className: 'col-md' },
  { key: 'subjects', label: 'Subjects', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const clusterRoleBindingColumns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'role', label: 'Role', className: 'col-md' },
  { key: 'subjects', label: 'Subjects', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const tabs: { key: RBACTab; label: string }[] = [
  { key: 'roles', label: 'Roles' },
  { key: 'clusterRoles', label: 'ClusterRoles' },
  { key: 'roleBindings', label: 'RoleBindings' },
  { key: 'clusterRoleBindings', label: 'ClusterRoleBindings' },
]

const ruleTableStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 'var(--text-2xs)',
  borderCollapse: 'collapse',
  marginTop: 'var(--space-2)',
}

const ruleCellStyle: React.CSSProperties = {
  padding: 'var(--space-1) var(--space-2)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}

const ruleHeaderStyle: React.CSSProperties = {
  ...ruleCellStyle,
  fontWeight: 600,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase' as const,
  fontSize: 'var(--text-3xs, 10px)',
  letterSpacing: '0.05em',
}

function RulesDetail({ rules }: { rules: RBACRule[] }) {
  return (
    <table style={ruleTableStyle}>
      <thead>
        <tr>
          <th scope="col" style={ruleHeaderStyle}>API Groups</th>
          <th scope="col" style={ruleHeaderStyle}>Resources</th>
          <th scope="col" style={ruleHeaderStyle}>Verbs</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule, i) => (
          <tr key={i}>
            <td className="mono" style={ruleCellStyle}>{rule.apiGroups.map(g => g || '""').join(', ')}</td>
            <td className="mono" style={ruleCellStyle}>{rule.resources.join(', ')}</td>
            <td className="mono" style={ruleCellStyle}>{rule.verbs.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function parseRules(rawRules: Record<string, unknown>[]): RBACRule[] {
  if (!rawRules) return []
  return rawRules.map((rule: Record<string, unknown>) => ({
    apiGroups: (rule.apiGroups || []) as string[],
    resources: (rule.resources || []) as string[],
    verbs: (rule.verbs || []) as string[],
  }))
}

function formatSubjects(subjects: Record<string, unknown>[]): string {
  if (!subjects || subjects.length === 0) return '\u2014'
  return subjects.map((s: Record<string, unknown>) => {
    const ns = s.namespace ? `${s.namespace}/` : ''
    return `${s.kind}:${ns}${s.name}`
  }).join(', ')
}

function formatRoleRef(roleRef: Record<string, unknown> | undefined): string {
  if (!roleRef) return '\u2014'
  return `${roleRef.kind}/${roleRef.name}`
}

const PATH_TO_TAB: Record<string, RBACTab> = {
  '/rbac/roles': 'roles',
  '/rbac/clusterroles': 'clusterRoles',
  '/rbac/rolebindings': 'roleBindings',
  '/rbac/clusterrolebindings': 'clusterRoleBindings',
}

const TAB_TO_PATH: Record<RBACTab, string> = {
  roles: '/rbac/roles',
  clusterRoles: '/rbac/clusterroles',
  roleBindings: '/rbac/rolebindings',
  clusterRoleBindings: '/rbac/clusterrolebindings',
}

export function RBACList() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab: RBACTab = PATH_TO_TAB[location.pathname] || 'roles'
  const [filter, setFilter] = useState('')

  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const namespace = useClusterStore((s) => s.selectedNamespace)

  const rolesCfg = RESOURCE_CONFIG.roles
  const clusterRolesCfg = RESOURCE_CONFIG.clusterroles
  const roleBindingsCfg = RESOURCE_CONFIG.rolebindings
  const clusterRoleBindingsCfg = RESOURCE_CONFIG.clusterrolebindings

  const { data: roleItems } = useKubeResources({
    group: rolesCfg.group, version: rolesCfg.version, resource: rolesCfg.plural, namespace,
  })
  const { data: clusterRoleItems } = useKubeResources({
    group: clusterRolesCfg.group, version: clusterRolesCfg.version, resource: clusterRolesCfg.plural, namespace: '',
  })
  const { data: roleBindingItems } = useKubeResources({
    group: roleBindingsCfg.group, version: roleBindingsCfg.version, resource: roleBindingsCfg.plural, namespace,
  })
  const { data: clusterRoleBindingItems } = useKubeResources({
    group: clusterRoleBindingsCfg.group, version: clusterRoleBindingsCfg.version, resource: clusterRoleBindingsCfg.plural, namespace: '',
  })

  const roles = roleItems.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      namespace: item.namespace,
      rules: parseRules((r.rules || []) as Record<string, unknown>[]),
      age: formatAge(creationTimestamp(item)),
    }
  })

  const clusterRoles = clusterRoleItems.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      rules: parseRules((r.rules || []) as Record<string, unknown>[]),
      age: formatAge(creationTimestamp(item)),
    }
  })

  const roleBindings = roleBindingItems.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      namespace: item.namespace,
      role: formatRoleRef(r.roleRef as Record<string, unknown> | undefined),
      subjects: formatSubjects((r.subjects || []) as Record<string, unknown>[]),
      age: formatAge(creationTimestamp(item)),
    }
  })

  const clusterRoleBindings = clusterRoleBindingItems.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      role: formatRoleRef(r.roleRef as Record<string, unknown> | undefined),
      subjects: formatSubjects((r.subjects || []) as Record<string, unknown>[]),
      age: formatAge(creationTimestamp(item)),
    }
  })

  const lowerFilter = filter.toLowerCase()
  const filteredRoles = roles.filter((r) => r.name.toLowerCase().includes(lowerFilter))
  const filteredClusterRoles = clusterRoles.filter((r) => r.name.toLowerCase().includes(lowerFilter))
  const filteredRoleBindings = roleBindings.filter((r) => r.name.toLowerCase().includes(lowerFilter))
  const filteredClusterRoleBindings = clusterRoleBindings.filter((r) => r.name.toLowerCase().includes(lowerFilter))

  const toggleExpanded = (key: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="RBAC" subtitle="Roles, bindings, and access control">
        <SearchInput placeholder="Filter RBAC resources..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div className="detail-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`detail-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => navigate(TAB_TO_PATH[tab.key])}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'roles' && (
        <ResourceTable columns={roleColumns} data={filteredRoles} renderRow={(r) => {
              const key = `${r.namespace}/${r.name}`
              const isExpanded = expandedRoles.has(key)
              return (
                <React.Fragment key={key}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(key)}>
                    <td className="name-cell">
                      <span style={{ marginRight: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
                        {isExpanded ? '\u25BC' : '\u25B6'}
                      </span>
                      {r.name}
                    </td>
                    <td className="mono">{r.namespace}</td>
                    <td className="tabular">{r.rules.length}</td>
                    <td>{r.age}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${key}-rules`}>
                      <td colSpan={4} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--bg-secondary, var(--surface-1))' }}>
                        <RulesDetail rules={r.rules} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            }} />
      )}

      {activeTab === 'clusterRoles' && (
        <ResourceTable columns={clusterRoleColumns} data={filteredClusterRoles} renderRow={(r) => {
              const isExpanded = expandedRoles.has(r.name)
              return (
                <React.Fragment key={r.name}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(r.name)}>
                    <td className="name-cell">
                      <span style={{ marginRight: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
                        {isExpanded ? '\u25BC' : '\u25B6'}
                      </span>
                      {r.name}
                    </td>
                    <td className="tabular">{r.rules.length}</td>
                    <td>{r.age}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${r.name}-rules`}>
                      <td colSpan={3} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--bg-secondary, var(--surface-1))' }}>
                        <RulesDetail rules={r.rules} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            }} />
      )}

      {activeTab === 'roleBindings' && (
        <ResourceTable columns={roleBindingColumns} data={filteredRoleBindings} renderRow={(r) => (
              <tr key={`${r.namespace}/${r.name}`}>
                <td className="name-cell">{r.name}</td>
                <td className="mono">{r.namespace}</td>
                <td className="mono">{r.role}</td>
                <td className="mono">{r.subjects}</td>
                <td>{r.age}</td>
              </tr>
            )} />
      )}

      {activeTab === 'clusterRoleBindings' && (
        <ResourceTable columns={clusterRoleBindingColumns} data={filteredClusterRoleBindings} renderRow={(r) => (
              <tr key={r.name}>
                <td className="name-cell">{r.name}</td>
                <td className="mono">{r.role}</td>
                <td className="mono">{r.subjects}</td>
                <td>{r.age}</td>
              </tr>
            )} />
      )}
    </div>
  )
}
