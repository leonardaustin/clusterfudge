import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceTable } from '@/components/table/ResourceTable'
import type { ColumnDef } from '@tanstack/react-table'

// Mock @tanstack/react-virtual so items render without real DOM measurements
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        key: i,
      })),
    scrollToIndex: vi.fn(),
  }),
}))

interface TestRow {
  id: string
  name: string
  status: string
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name', size: 200 },
  { accessorKey: 'status', header: 'Status', size: 100 },
]

const data: TestRow[] = [
  { id: '1', name: 'pod-alpha', status: 'Running' },
  { id: '2', name: 'pod-beta', status: 'Pending' },
  { id: '3', name: 'pod-gamma', status: 'Failed' },
]

describe('ResourceTable', () => {
  it('renders column headers', () => {
    render(
      <ResourceTable
        data={data}
        columns={columns}
        isLoading={false}
        getRowId={(r) => r.id}
      />
    )
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()
  })

  it('renders rows', () => {
    render(
      <ResourceTable
        data={data}
        columns={columns}
        isLoading={false}
        getRowId={(r) => r.id}
      />
    )
    expect(screen.getByText('pod-alpha')).toBeTruthy()
    expect(screen.getByText('pod-beta')).toBeTruthy()
    expect(screen.getByText('pod-gamma')).toBeTruthy()
  })

  it('shows skeleton when loading', () => {
    const { container } = render(
      <ResourceTable
        data={[]}
        columns={columns}
        isLoading={true}
        getRowId={(r: TestRow) => r.id}
      />
    )
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('shows empty state when no data', () => {
    render(
      <ResourceTable
        data={[]}
        columns={columns}
        isLoading={false}
        getRowId={(r: TestRow) => r.id}
      />
    )
    expect(screen.getByText('No resources found')).toBeTruthy()
  })

  it('calls onRowClick when a row is clicked', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <ResourceTable
        data={data}
        columns={columns}
        isLoading={false}
        onRowClick={onRowClick}
        getRowId={(r) => r.id}
      />
    )
    await user.click(screen.getByText('pod-alpha'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('filters rows with searchValue', () => {
    render(
      <ResourceTable
        data={data}
        columns={columns}
        isLoading={false}
        searchValue="beta"
        getRowId={(r) => r.id}
      />
    )
    expect(screen.getByText('pod-beta')).toBeTruthy()
    expect(screen.queryByText('pod-alpha')).toBeNull()
  })
})
