import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { CronJob } from '@/data/types'

const h = createColumnHelper<CronJob>()

export const cronJobColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('schedule', { header: 'SCHEDULE', size: 140 }),
  h.accessor('suspend', {
    header: 'SUSPEND',
    size: 80,
    cell: (i) => (i.getValue() ? 'True' : 'False'),
  }),
  h.accessor('active', { header: 'ACTIVE', size: 70 }),
  h.accessor('lastSchedule', {
    header: 'LAST SCHEDULE',
    size: 120,
    cell: (i) => {
      const val = i.getValue()
      return val
        ? RelativeTime({ value: val })
        : '—'
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
