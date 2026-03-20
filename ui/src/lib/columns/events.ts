import { createColumnHelper } from '@tanstack/react-table'
import { StatusDot } from '@/components/cells/StatusDot'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { KubeEvent } from '@/data/types'

const h = createColumnHelper<KubeEvent>()

export const eventColumns = [
  h.accessor('type', {
    header: 'TYPE',
    size: 60,
    cell: (i) => {
      const type = i.getValue() as string
      return StatusDot({
        status: type === 'Warning' ? 'warning' : 'running',
      })
    },
  }),
  h.accessor('reason', { header: 'REASON', size: 120 }),
  h.accessor('object', { header: 'OBJECT', size: 150 }),
  h.accessor('message', { header: 'MESSAGE', size: 400 }),
  h.accessor('count', { header: 'COUNT', size: 50 }),
  h.accessor('lastSeen', {
    header: 'LAST SEEN',
    size: 80,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
