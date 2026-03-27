import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { DaemonSet } from '@/data/types'

const h = createColumnHelper<DaemonSet>()

export const daemonSetColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('desired', { header: 'DESIRED', size: 80 }),
  h.accessor('current', { header: 'CURRENT', size: 80 }),
  h.accessor('ready', { header: 'READY', size: 80 }),
  h.accessor('upToDate', { header: 'UP-TO-DATE', size: 100 }),
  h.accessor('available', { header: 'AVAILABLE', size: 100 }),
  h.accessor('nodeSelector', { header: 'NODE SELECTOR', size: 180 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
