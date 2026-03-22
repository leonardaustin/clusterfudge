import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { PV } from '@/data/types'

const h = createColumnHelper<PV>()

export const pvColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('capacity', { header: 'CAPACITY', size: 100 }),
  h.accessor('accessModes', {
    header: 'ACCESS MODES',
    size: 120,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '—',
  }),
  h.accessor('reclaimPolicy', { header: 'RECLAIM POLICY', size: 120 }),
  h.accessor('storageClass', { header: 'STORAGE CLASS', size: 140 }),
  h.accessor('claimRef', {
    header: 'CLAIM',
    size: 180,
    cell: (i) => {
      const c = i.getValue() as { namespace: string; name: string } | undefined
      return c ? `${c.namespace}/${c.name}` : '—'
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
