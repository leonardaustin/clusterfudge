import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Sparkline } from '@/components/shared/Sparkline'

describe('Sparkline', () => {
  it('renders an SVG with the correct dimensions', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
    expect(svg?.getAttribute('width')).toBe('120')
    expect(svg?.getAttribute('height')).toBe('30')
  })

  it('renders a dashed line when data is empty', () => {
    const { container } = render(<Sparkline data={[]} />)
    const line = container.querySelector('line')
    expect(line).toBeDefined()
    expect(line?.getAttribute('stroke-dasharray')).toBe('4 2')
  })

  it('renders a polyline when data is provided', () => {
    const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).toBeDefined()
    expect(polyline?.getAttribute('points')).toBeTruthy()
  })

  it('renders a gradient fill polygon', () => {
    const { container } = render(<Sparkline data={[10, 20, 30]} />)
    const polygon = container.querySelector('polygon')
    expect(polygon).toBeDefined()
  })

  it('accepts custom dimensions', () => {
    const { container } = render(<Sparkline data={[1, 2]} width={200} height={50} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('200')
    expect(svg?.getAttribute('height')).toBe('50')
  })

  it('has an aria-label for accessibility', () => {
    const { container } = render(<Sparkline data={[1]} label="CPU usage sparkline" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('CPU usage sparkline')
    expect(svg?.getAttribute('role')).toBe('img')
  })

  it('handles single data point', () => {
    const { container } = render(<Sparkline data={[42]} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).toBeDefined()
    expect(polyline?.getAttribute('points')).toBeTruthy()
  })
})
