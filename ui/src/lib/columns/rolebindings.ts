import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { RoleBinding } from '@/data/types'

const h = createColumnHelper<RoleBinding>()

export const roleBindingColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('roleRef', {
    header: 'ROLE REF',
    size: 180,
    cell: (i) => {
      const r = i.getValue() as { kind: string; name: string }
      return `${r.kind}/${r.name}`
    },
  }),
  h.accessor('subjects', {
    header: 'SUBJECTS',
    size: 300,
    cell: (i) => {
      const s = i.getValue() as Array<{ kind: string; name: string }>
      return (
        s
          ?.slice(0, 3)
          .map((x) => `${x.kind}/${x.name}`)
          .join(', ') ?? '—'
      )
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
