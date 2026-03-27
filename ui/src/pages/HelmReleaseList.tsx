import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Search, Database, Download } from 'lucide-react'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { HelmInstallDialog } from '../components/dialogs/HelmInstallDialog'
import { useClusterStore } from '../stores/clusterStore'
import { useToastStore } from '../stores/toastStore'
import {
  ListReleases,
  UninstallRelease,
  RollbackRelease,
  ListChartRepos,
  AddChartRepo,
  RemoveChartRepo,
  SearchCharts,
  type ReleaseInfo,
  type RepoInfo,
  type ChartResult,
} from '../wailsjs/go/handlers/HelmHandler'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'chart', label: 'Chart', className: 'col-md' },
  { key: 'appVersion', label: 'App Version', className: 'col-sm' },
  { key: 'revision', label: 'Revision', className: 'col-sm' },
  { key: 'updated', label: 'Updated', className: 'col-md' },
  { key: 'actions', label: '', className: 'col-sm' },
]

function statusToColor(status: string): string {
  if (status === 'deployed') return 'running'
  if (status === 'failed') return 'failed'
  return 'pending'
}

type HelmTab = 'releases' | 'repositories' | 'search'

export function HelmReleaseList() {
  const [activeTab, setActiveTab] = useState<HelmTab>('releases')
  const [filter, setFilter] = useState('')
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()

  // Repo state
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoURL, setNewRepoURL] = useState('')

  // Search state
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<ChartResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Install dialog state
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [installChart, setInstallChart] = useState<ChartResult | null>(null)

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ListReleases(namespace)
      setReleases(data)
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to list Helm releases', description: String(err) })
    } finally {
      setLoading(false)
    }
  }, [namespace, addToast])

  const fetchRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const data = await ListChartRepos()
      setRepos(data ?? [])
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to list repositories', description: String(err) })
    } finally {
      setReposLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  useEffect(() => {
    if (activeTab === 'repositories') {
      fetchRepos()
    }
  }, [activeTab, fetchRepos])

  const handleUninstall = async (name: string, ns: string) => {
    try {
      await UninstallRelease(name, ns)
      addToast({ type: 'success', title: `Uninstalled ${name}` })
      fetchReleases()
    } catch (err) {
      addToast({ type: 'error', title: `Failed to uninstall ${name}`, description: String(err) })
    }
  }

  const handleRollback = async (name: string, ns: string, revision: number) => {
    if (revision <= 1) return
    try {
      await RollbackRelease(name, ns, revision - 1)
      addToast({ type: 'success', title: `Rolled back ${name} to revision ${revision - 1}` })
      fetchReleases()
    } catch (err) {
      addToast({ type: 'error', title: `Failed to rollback ${name}`, description: String(err) })
    }
  }

  const handleAddRepo = async () => {
    if (!newRepoName.trim() || !newRepoURL.trim()) return
    try {
      await AddChartRepo(newRepoName.trim(), newRepoURL.trim())
      addToast({ type: 'success', title: `Added repository ${newRepoName}` })
      setNewRepoName('')
      setNewRepoURL('')
      fetchRepos()
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add repository', description: String(err) })
    }
  }

  const handleRemoveRepo = async (name: string) => {
    try {
      await RemoveChartRepo(name)
      addToast({ type: 'success', title: `Removed repository ${name}` })
      fetchRepos()
    } catch (err) {
      addToast({ type: 'error', title: `Failed to remove ${name}`, description: String(err) })
    }
  }

  const handleSearch = async () => {
    if (!searchKeyword.trim()) return
    setSearchLoading(true)
    try {
      const results = await SearchCharts(searchKeyword.trim())
      setSearchResults(results ?? [])
    } catch (err) {
      addToast({ type: 'error', title: 'Search failed', description: String(err) })
    } finally {
      setSearchLoading(false)
    }
  }

  const filtered = releases.filter(
    (r) =>
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      r.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="resource-view">
      <ResourceHeader
        title="Helm"
        subtitle={activeTab === 'releases'
          ? `${releases.length} releases${namespace ? ` in ${namespace}` : ' across all namespaces'}`
          : activeTab === 'repositories'
            ? `${repos.length} repositories`
            : 'Search charts'
        }
      >
        {activeTab === 'releases' && (
          <SearchInput placeholder="Filter releases..." value={filter} onChange={setFilter} />
        )}
      </ResourceHeader>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-3 py-1 border-b border-border bg-bg-secondary"
        role="tablist"
        aria-label="Helm sections"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'releases'}
          data-testid="helm-tab-releases"
          onClick={() => setActiveTab('releases')}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            activeTab === 'releases'
              ? 'bg-bg-active text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Releases
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'repositories'}
          data-testid="helm-tab-repositories"
          onClick={() => setActiveTab('repositories')}
          className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
            activeTab === 'repositories'
              ? 'bg-bg-active text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <Database className="w-3 h-3" />
          Repositories
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'search'}
          data-testid="helm-tab-search"
          onClick={() => setActiveTab('search')}
          className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
            activeTab === 'search'
              ? 'bg-bg-active text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <Search className="w-3 h-3" />
          Search Charts
        </button>
      </div>

      {/* Releases tab */}
      {activeTab === 'releases' && (
        <>
          {loading ? (
            <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
              Loading releases...
            </div>
          ) : (
            <ResourceTable columns={columns} data={filtered} renderRow={(rel) => (
                <tr
                  key={`${rel.namespace}/${rel.name}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/helm/releases/${rel.namespace}/${rel.name}`)}
                >
                  <td className="col-status">
                    <StatusDot status={statusToColor(rel.status)} />
                  </td>
                  <td className="name-cell">{rel.name}</td>
                  <td className="mono">{rel.namespace}</td>
                  <td className="mono">{rel.chart}</td>
                  <td className="tabular">{rel.appVersion}</td>
                  <td className="tabular">{rel.revision}</td>
                  <td style={{ fontSize: 'var(--text-2xs)' }}>{rel.updated}</td>
                  <td>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {rel.revision > 1 && (
                        <button
                          className="text-2xs px-1.5 py-0.5 rounded"
                          style={{ color: 'var(--yellow)', background: 'var(--yellow-muted)' }}
                          title={`Rollback to revision ${rel.revision - 1}`}
                          onClick={() => handleRollback(rel.name, rel.namespace, rel.revision)}
                        >
                          Rollback
                        </button>
                      )}
                      <button
                        className="text-2xs px-1.5 py-0.5 rounded"
                        style={{ color: 'var(--red)', background: 'var(--red-muted)' }}
                        title="Uninstall release"
                        onClick={() => handleUninstall(rel.name, rel.namespace)}
                      >
                        Uninstall
                      </button>
                    </div>
                  </td>
                </tr>
              )} />
          )}
        </>
      )}

      {/* Repositories tab */}
      {activeTab === 'repositories' && (
        <div className="p-3">
          {/* Add repo form */}
          <div className="flex items-end gap-2 mb-4" data-testid="add-repo-form">
            <div className="flex flex-col gap-1">
              <label htmlFor="repo-name-input" className="text-2xs text-text-tertiary">Name</label>
              <input
                id="repo-name-input"
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="e.g. bitnami"
                className="text-xs px-2 py-1 rounded border border-border bg-bg-tertiary text-text-primary"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="repo-url-input" className="text-2xs text-text-tertiary">URL</label>
              <input
                id="repo-url-input"
                type="text"
                value={newRepoURL}
                onChange={(e) => setNewRepoURL(e.target.value)}
                placeholder="e.g. https://charts.bitnami.com/bitnami"
                className="text-xs px-2 py-1 rounded border border-border bg-bg-tertiary text-text-primary flex-1"
              />
            </div>
            <button
              onClick={handleAddRepo}
              disabled={!newRepoName.trim() || !newRepoURL.trim()}
              data-testid="add-repo-button"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>

          {/* Repo list */}
          {reposLoading ? (
            <div className="text-xs text-text-tertiary">Loading repositories...</div>
          ) : repos.length === 0 ? (
            <div className="text-xs text-text-tertiary" data-testid="no-repos-message">
              No repositories configured. Add one above.
            </div>
          ) : (
            <div className="space-y-1" data-testid="repo-list">
              {repos.map((repo) => (
                <div
                  key={repo.name}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-bg-secondary border border-border text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Database className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                    <span className="font-medium text-text-primary">{repo.name}</span>
                    <span className="text-text-tertiary truncate">{repo.url}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveRepo(repo.name)}
                    className="p-1 text-text-tertiary hover:text-status-error rounded transition-colors shrink-0"
                    title={`Remove ${repo.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search tab */}
      {activeTab === 'search' && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1">
              <label htmlFor="chart-search-input" className="sr-only">Search charts</label>
              <input
                id="chart-search-input"
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                placeholder="Search charts by name or description..."
                className="w-full text-xs px-2 py-1 rounded border border-border bg-bg-tertiary text-text-primary"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchKeyword.trim() || searchLoading}
              data-testid="chart-search-button"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search className="w-3 h-3" />
              Search
            </button>
          </div>

          {searchLoading ? (
            <div className="text-xs text-text-tertiary">Searching...</div>
          ) : searchResults.length === 0 ? (
            <div className="text-xs text-text-tertiary" data-testid="no-search-results">
              {searchKeyword.trim() ? 'No charts found. Try a different keyword.' : 'Enter a keyword to search charts from configured repositories.'}
            </div>
          ) : (
            <div className="space-y-1" data-testid="search-results">
              {searchResults.map((chart) => (
                <div
                  key={`${chart.repo}/${chart.name}`}
                  className="flex items-start gap-3 px-3 py-2 rounded bg-bg-secondary border border-border text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">{chart.name}</span>
                      <span className="text-text-tertiary">v{chart.version}</span>
                      {chart.appVersion && (
                        <span className="text-2xs bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded-full">
                          App {chart.appVersion}
                        </span>
                      )}
                    </div>
                    {chart.description && (
                      <p className="text-text-secondary mt-0.5 truncate">{chart.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-2xs text-text-tertiary">{chart.repo}</span>
                    <button
                      onClick={() => { setInstallChart(chart); setInstallDialogOpen(true) }}
                      className="flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: 'var(--accent)', background: 'var(--accent-muted, rgba(99,102,241,0.1))' }}
                      title={`Install ${chart.name}`}
                    >
                      <Download className="w-3 h-3" />
                      Install
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <HelmInstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        chartName={installChart?.name}
        chartVersion={installChart?.version}
        chartRepo={installChart?.repo}
        onInstalled={() => { setActiveTab('releases'); fetchReleases() }}
      />
    </div>
  )
}
