import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Secret } from '@/data/types'

const h = createColumnHelper<Secret>()

export const secretColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('type', { header: 'TYPE', size: 200 }),
  h.accessor('dataKeys', { header: 'KEYS', size: 80 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
