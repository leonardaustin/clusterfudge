import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import { MetricsBar } from '@/components/cells/MetricsBar'
import type { Pod } from '@/data/types'

const h = createColumnHelper<Pod>()

export const podColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('ready', { header: 'READY', size: 60 }),
  h.accessor('restarts', {
    header: 'RESTARTS',
    size: 80,
  }),
  h.accessor('node', { header: 'NODE', size: 120 }),
  h.accessor('ip', { header: 'IP', size: 120 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]

/** Pod columns with CPU/Memory metrics bars appended */
export const podColumnsWithMetrics = [
  ...podColumns,
  h.accessor('cpuUsage', {
    header: 'CPU',
    size: 120,
    cell: (i) => {
      const row = i.row.original
      if (row.cpuLimit == null || row.cpuLimit === 0) return '—'
      const pct = ((row.cpuUsage ?? 0) / row.cpuLimit) * 100
      return MetricsBar({ percent: pct, label: `${row.cpuUsage ?? 0}m` })
    },
  }),
  h.accessor('memoryUsage', {
    header: 'MEMORY',
    size: 120,
    cell: (i) => {
      const row = i.row.original
      if (row.memLimit == null || row.memLimit === 0) return '—'
      const pct = ((row.memoryUsage ?? 0) / row.memLimit) * 100
      return MetricsBar({ percent: pct, label: `${row.memoryUsage ?? 0}Mi` })
    },
  }),
]
