import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsBar } from '@/components/cells/MetricsBar'

describe('MetricsBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<MetricsBar percent={50} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('shows percentage label by default', () => {
    render(<MetricsBar percent={42} />)
    expect(screen.getByText('42%')).toBeTruthy()
  })

  it('shows custom label when provided', () => {
    render(<MetricsBar percent={50} label="500m / 1000m" />)
    expect(screen.getByText('500m / 1000m')).toBeTruthy()
  })

  it('clamps percent to 0-100', () => {
    const { container } = render(<MetricsBar percent={150} />)
    // The inner fill bar should have width 100%
    const fill = container.querySelectorAll('div')[2] as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('applies green color for low usage', () => {
    const { container } = render(<MetricsBar percent={30} />)
    const fill = container.querySelectorAll('div')[2]
    expect(fill.className).toContain('bg-status-running')
  })

  it('applies yellow color for medium usage', () => {
    const { container } = render(<MetricsBar percent={75} />)
    const fill = container.querySelectorAll('div')[2]
    expect(fill.className).toContain('bg-status-pending')
  })

  it('applies red color for high usage', () => {
    const { container } = render(<MetricsBar percent={95} />)
    const fill = container.querySelectorAll('div')[2]
    expect(fill.className).toContain('bg-status-error')
  })
})
