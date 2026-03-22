import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { ServiceAccount } from '@/data/types'

const h = createColumnHelper<ServiceAccount>()

export const serviceAccountColumns = [
  h.accessor('name', { header: 'NAME', size: 350 }),
  h.accessor('secrets', { header: 'SECRETS', size: 80 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
