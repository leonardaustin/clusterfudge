import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Deployment } from '@/data/types'

const h = createColumnHelper<Deployment>()

export const deploymentColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('ready', { header: 'READY', size: 80 }),
  h.accessor('upToDate', { header: 'UP-TO-DATE', size: 80 }),
  h.accessor('available', { header: 'AVAILABLE', size: 80 }),
  h.accessor('strategy', { header: 'STRATEGY', size: 100 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
