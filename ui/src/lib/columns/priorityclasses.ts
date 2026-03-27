import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { PriorityClass } from '@/data/types'

const h = createColumnHelper<PriorityClass>()

export const priorityClassColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('value', { header: 'VALUE', size: 100 }),
  h.accessor('globalDefault', {
    header: 'GLOBAL DEFAULT',
    size: 120,
    cell: (i) => (i.getValue() ? 'true' : 'false'),
  }),
  h.accessor('description', { header: 'DESCRIPTION', size: 300 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
