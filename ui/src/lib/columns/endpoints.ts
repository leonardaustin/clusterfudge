import { createColumnHelper } from '@tanstack/react-table'
import { RelativeTime } from '@/components/cells/RelativeTime'
import type { Endpoint } from '@/data/types'

const h = createColumnHelper<Endpoint>()

export const endpointColumns = [
  h.accessor('name', { header: 'NAME', size: 250 }),
  h.accessor('endpoints', {
    header: 'ENDPOINTS',
    size: 400,
    cell: (i) => {
      const eps = i.getValue() as string[]
      if (!eps?.length) return '<none>'
      if (eps.length <= 3) return eps.join(', ')
      return `${eps.slice(0, 3).join(', ')} +${eps.length - 3} more`
    },
  }),
  h.accessor('age', {
    header: 'AGE',
    size: 60,
    cell: (i) => RelativeTime({ value: i.getValue() ?? '' }),
  }),
]
