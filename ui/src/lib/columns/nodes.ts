import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { ClusterNode } from '@/data/types'

const h = createColumnHelper<ClusterNode>()

export const nodeColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 200 }),
  h.accessor('roles', { header: 'ROLES', size: 100 }),
  h.accessor('version', { header: 'VERSION', size: 100 }),
  h.accessor('cpuCores', { header: 'CPU', size: 80 }),
  h.accessor('memory', { header: 'MEMORY', size: 80 }),
  h.accessor('pods', { header: 'PODS', size: 60 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
