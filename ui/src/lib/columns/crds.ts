import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { CRD } from '@/data/types'

const h = createColumnHelper<CRD>()

export const crdColumns = [
  h.accessor('name', { header: 'NAME', size: 300 }),
  h.accessor('group', { header: 'GROUP', size: 200 }),
  h.accessor('version', { header: 'VERSION', size: 80 }),
  h.accessor('scope', { header: 'SCOPE', size: 100 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
