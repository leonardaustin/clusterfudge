import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { ReplicaSet } from '@/data/types'

const h = createColumnHelper<ReplicaSet>()

export const replicaSetColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('desired', { header: 'DESIRED', size: 80 }),
  h.accessor('current', { header: 'CURRENT', size: 80 }),
  h.accessor('ready', { header: 'READY', size: 80 }),
  h.accessor('owner', {
    header: 'OWNER',
    size: 180,
    cell: (i) => {
      const o = i.getValue() as { kind: string; name: string } | undefined
      return o ? `${o.kind}/${o.name}` : '—'
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
