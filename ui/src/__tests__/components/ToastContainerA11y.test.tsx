import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector) => {
    const store = { toasts: [], removeToast: vi.fn() }
    return selector(store)
  }),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
}))

import { ToastContainer } from '@/components/notifications/ToastContainer'

describe('ToastContainer aria-live', () => {
  it('has aria-live="polite" attribute', () => {
    const { container } = render(<ToastContainer />)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeDefined()
    expect(liveRegion).not.toBeNull()
  })

  it('has aria-atomic="false" attribute', () => {
    const { container } = render(<ToastContainer />)
    const liveRegion = container.querySelector('[aria-atomic="false"]')
    expect(liveRegion).toBeDefined()
    expect(liveRegion).not.toBeNull()
  })
})
