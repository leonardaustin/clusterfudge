import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { ConfigMap } from '@/data/types'

const h = createColumnHelper<ConfigMap>()

export const configMapColumns = [
  h.accessor('name', { header: 'NAME', size: 350 }),
  h.accessor('dataKeys', { header: 'KEYS', size: 80 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
