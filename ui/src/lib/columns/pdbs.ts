import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { PDB } from '@/data/types'

const h = createColumnHelper<PDB>()

export const pdbColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('minAvailable', { header: 'MIN AVAILABLE', size: 120 }),
  h.accessor('maxUnavailable', { header: 'MAX UNAVAILABLE', size: 130 }),
  h.accessor('allowedDisruptions', { header: 'ALLOWED', size: 80 }),
  h.accessor('currentHealthy', { header: 'HEALTHY', size: 80 }),
  h.accessor('desiredHealthy', { header: 'DESIRED', size: 80 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
