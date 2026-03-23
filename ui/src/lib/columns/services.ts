import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Service } from '@/data/types'

const h = createColumnHelper<Service>()

export const serviceColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('type', { header: 'TYPE', size: 100 }),
  h.accessor('clusterIP', { header: 'CLUSTER IP', size: 120 }),
  h.accessor('externalIP', {
    header: 'EXTERNAL IP',
    size: 120,
    cell: (i) => i.getValue() || '<pending>',
  }),
  h.accessor('ports', { header: 'PORTS', size: 150 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
