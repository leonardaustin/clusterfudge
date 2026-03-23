import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusDot } from '@/components/cells/StatusDot'

describe('StatusDot', () => {
  it('renders without crashing', () => {
    const { container } = render(<StatusDot status="running" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders an SVG icon', () => {
    const { container } = render(<StatusDot status="running" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('applies running color class', () => {
    const { container } = render(<StatusDot status="running" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('text-status-running')
  })

  it('applies error color for failed status', () => {
    const { container } = render(<StatusDot status="failed" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('text-status-error')
  })

  it('applies pending color for pending status', () => {
    const { container } = render(<StatusDot status="pending" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('text-status-pending')
  })

  it('applies pulse animation for CrashLoopBackOff', () => {
    const { container } = render(<StatusDot status="CrashLoopBackOff" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('animate-pulse')
  })

  it('handles unknown status gracefully', () => {
    const { container } = render(<StatusDot status="SomethingWeird" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('text-status-terminated')
  })

  it('is case-insensitive', () => {
    const { container } = render(<StatusDot status="RUNNING" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('text-status-running')
  })

  it('applies custom className', () => {
    const { container } = render(<StatusDot status="running" className="my-class" />)
    const svg = container.querySelector('svg')!
    expect(svg.className.baseVal).toContain('my-class')
  })
})
