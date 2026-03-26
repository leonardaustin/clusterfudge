import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { NamespaceItem } from '@/data/types'

const h = createColumnHelper<NamespaceItem>()

export const namespaceColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('labels', {
    header: 'LABELS',
    size: 300,
    cell: (i) => {
      const l = i.getValue() as Record<string, string> | undefined
      if (!l) return '—'
      const entries = Object.entries(l).filter(
        ([k]) => !k.startsWith('kubernetes.io/')
      )
      return (
        entries
          .map(([k, v]) => `${k}=${v}`)
          .slice(0, 3)
          .join(', ') || '—'
      )
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
