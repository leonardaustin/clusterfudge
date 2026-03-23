import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { HPA } from '@/data/types'

const h = createColumnHelper<HPA>()

export const hpaColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('reference', { header: 'REFERENCE', size: 200 }),
  h.accessor('minReplicas', { header: 'MIN PODS', size: 80 }),
  h.accessor('maxReplicas', { header: 'MAX PODS', size: 80 }),
  h.accessor('replicas', { header: 'REPLICAS', size: 80 }),
  h.accessor('metrics', {
    header: 'METRICS',
    size: 200,
    cell: (i) => (i.getValue() as string[])?.join(' / ') ?? '—',
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
