import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { StatefulSet } from '@/data/types'

const h = createColumnHelper<StatefulSet>()

export const statefulSetColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('ready', { header: 'READY', size: 80 }),
  h.accessor('replicas', { header: 'REPLICAS', size: 80 }),
  h.accessor('serviceName', { header: 'SERVICE', size: 140 }),
  h.accessor('updateStrategy', { header: 'UPDATE STRATEGY', size: 140 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
