import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Ingress } from '@/data/types'

const h = createColumnHelper<Ingress>()

export const ingressColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('className', { header: 'CLASS', size: 120 }),
  h.accessor('hosts', {
    header: 'HOSTS',
    size: 200,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '—',
  }),
  h.accessor('addresses', {
    header: 'ADDRESS',
    size: 140,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '<pending>',
  }),
  h.accessor('ports', { header: 'PORTS', size: 100 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
