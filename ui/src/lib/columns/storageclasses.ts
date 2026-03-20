import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { StorageClass } from '@/data/types'

const h = createColumnHelper<StorageClass>()

export const storageClassColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('provisioner', { header: 'PROVISIONER', size: 200 }),
  h.accessor('reclaimPolicy', { header: 'RECLAIM POLICY', size: 120 }),
  h.accessor('volumeBindingMode', { header: 'BINDING MODE', size: 140 }),
  h.accessor('allowExpansion', {
    header: 'ALLOW EXPANSION',
    size: 120,
    cell: (i) => (i.getValue() ? 'true' : 'false'),
  }),
  h.accessor('isDefault', {
    header: 'DEFAULT',
    size: 80,
    cell: (i) => (i.getValue() ? '\u2605' : ''),
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
