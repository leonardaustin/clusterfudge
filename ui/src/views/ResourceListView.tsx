import { useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ResourceTable } from '@/components/table/ResourceTable'
import { SearchInput } from '@/components/table/SearchInput'
import { ColumnCustomizer, type ColumnConfig } from '@/components/table/ColumnCustomizer'
import { ErrorState } from '@/components/table/ErrorState'
import { getColumnsForResource } from '@/lib/columns'
import { RESOURCE_CONFIG } from '@/lib/resourceConfig'
import { useClusterStore } from '@/stores/clusterStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { loadColumnPrefs, mergeColumnPrefs, saveColumnPrefs } from '@/lib/columnPrefs'
import { exportToCsv } from '@/lib/csvExport'
import { Download } from 'lucide-react'
import { ResourceDetailPanel } from '@/components/detail/ResourceDetailPanel'

interface ResourceListViewProps {
  /** Override resource type instead of reading from URL params */
  resourceType?: string
  /** Static data to use instead of API fetch */
  data?: Record<string, unknown>[]
  isLoading?: boolean
  error?: string | null
}

export function ResourceListView({
  resourceType: propResourceType,
  data: propData,
  isLoading: propIsLoading,
  error: propError,
}: ResourceListViewProps = {}) {
  const { resource: urlResource } = useParams<{ resource: string }>()
  const resourceType = propResourceType ?? urlResource ?? ''
  const config = RESOURCE_CONFIG[resourceType]
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)

  const [searchValue, setSearchValue] = useState('')
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const { setSelectedResource, clearSelection } = useSelectionStore()

  // Use prop data or empty array (real data comes from hooks in actual usage)
  const data = useMemo(() => propData ?? [], [propData])
  const isLoading = propIsLoading ?? false
  const error = propError ?? null

  // Column definitions
  const allColumns = useMemo(() => getColumnsForResource(resourceType), [resourceType])

  // Column customization
  const defaultColumnConfigs: ColumnConfig[] = useMemo(
    () =>
      allColumns.map((col: { accessorKey?: string; id?: string; header?: string }) => ({
        id: (col.accessorKey ?? col.id ?? '') as string,
        label: (typeof col.header === 'string' ? col.header : col.accessorKey ?? '') as string,
        visible: true,
      })),
    [allColumns]
  )

  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(() =>
    mergeColumnPrefs(defaultColumnConfigs, loadColumnPrefs(resourceType))
  )

  const handleColumnChange = useCallback(
    (configs: ColumnConfig[]) => {
      setColumnConfigs(configs)
      saveColumnPrefs(resourceType, configs)
    },
    [resourceType]
  )

  const visibleColumns = useMemo(() => {
    const visibleIds = new Set(columnConfigs.filter((c) => c.visible).map((c) => c.id))
    return allColumns.filter(
      (col: { accessorKey?: string; id?: string }) =>
        visibleIds.has((col.accessorKey ?? col.id ?? '') as string)
    )
  }, [allColumns, columnConfigs])

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      setSelectedItem(row)
      setSelectedResource({
        kind: config?.displayName ?? resourceType,
        name: row.name as string,
        namespace: row.namespace as string | undefined,
        path: `/${config?.category ?? 'workloads'}/${resourceType}`,
        raw: row,
      })
    },
    [config, resourceType, setSelectedResource]
  )

  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null)
    clearSelection()
  }, [clearSelection])

  const handleExportCsv = useCallback(() => {
    const csvColumns = visibleColumns
      .filter((col: { accessorKey?: string }) => col.accessorKey)
      .map((col: { accessorKey?: string; header?: string }) => ({
        key: col.accessorKey as string,
        label: (typeof col.header === 'string' ? col.header : col.accessorKey ?? '') as string,
      }))
    exportToCsv(
      `${resourceType}-${new Date().toISOString().slice(0, 10)}`,
      data as Record<string, unknown>[],
      csvColumns
    )
  }, [data, resourceType, visibleColumns])

  if (!config) {
    return (
      <ErrorState
        title="Unknown resource type"
        message={`No configuration found for "${resourceType}"`}
      />
    )
  }

  if (error) {
    return <ErrorState message={error} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            {config.displayName}
          </h1>
          <p className="text-sm text-text-secondary">
            {data.length} {config.plural}
            {selectedNamespace && ` in namespace "${selectedNamespace}"`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput value={searchValue} onChange={setSearchValue} />
          <ColumnCustomizer
            columns={columnConfigs}
            onChange={handleColumnChange}
          />
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table + optional detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <ResourceTable
          data={data}
          columns={visibleColumns}
          isLoading={isLoading}
          searchValue={searchValue}
          onRowClick={handleRowClick}
          selectedRowId={selectedItem ? `${selectedItem.namespace ?? ''}/${selectedItem.name}` : undefined}
          getRowId={(row: Record<string, unknown>) =>
            `${row.namespace ?? ''}/${row.name}`
          }
        />
        {selectedItem && (
          <ResourceDetailPanel
            resource={selectedItem}
            resourceType={resourceType}
            onClose={handleCloseDetail}
          />
        )}
      </div>
    </div>
  )
}
