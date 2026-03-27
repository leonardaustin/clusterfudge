import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { PVC } from '@/data/types'

const h = createColumnHelper<PVC>()

export const pvcColumns = [
  h.accessor('status', {
    header: '',
    size: 40,
    cell: (i) => StatusDot({ status: i.getValue() }),
  }),
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('capacity', { header: 'CAPACITY', size: 100 }),
  h.accessor('accessModes', {
    header: 'ACCESS MODES',
    size: 120,
    cell: (i) => (i.getValue() as string[])?.join(', ') ?? '—',
  }),
  h.accessor('storageClass', { header: 'STORAGE CLASS', size: 140 }),
  h.accessor('volumeName', { header: 'VOLUME', size: 180 }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
