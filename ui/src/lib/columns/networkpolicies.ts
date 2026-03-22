import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { NetworkPolicy } from '@/data/types'

const h = createColumnHelper<NetworkPolicy>()

export const networkPolicyColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('podSelector', {
    header: 'POD SELECTOR',
    size: 200,
    cell: (i) => {
      const sel = i.getValue() as Record<string, string> | undefined
      if (!sel || Object.keys(sel).length === 0) return '<all pods>'
      return Object.entries(sel)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
    },
  }),
  h.accessor('policyTypes', {
    header: 'POLICY TYPES',
    size: 150,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '—',
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
