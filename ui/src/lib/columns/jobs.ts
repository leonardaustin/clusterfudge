import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Job } from '@/data/types'

const h = createColumnHelper<Job>()

export const jobColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('completions', {
    header: 'COMPLETIONS',
    size: 100,
    cell: (i) =>
      `${i.row.original.succeeded ?? 0}/${i.row.original.completions ?? 1}`,
  }),
  h.accessor('duration', { header: 'DURATION', size: 100 }),
  h.accessor('images', {
    header: 'IMAGES',
    size: 200,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '—',
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
