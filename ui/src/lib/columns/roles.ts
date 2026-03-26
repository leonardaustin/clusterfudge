import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Role } from '@/data/types'

const h = createColumnHelper<Role>()

export const roleColumns = [
  h.accessor('name', { header: 'NAME', size: 350 }),
  h.accessor('ruleCount', { header: 'RULES', size: 80 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
