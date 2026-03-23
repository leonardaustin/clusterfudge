import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelativeTime, formatRelative } from '@/components/cells/RelativeTime'

describe('formatRelative', () => {
  it('returns pre-formatted strings as-is', () => {
    expect(formatRelative('3d')).toBe('3d')
    expect(formatRelative('2h')).toBe('2h')
    expect(formatRelative('45m')).toBe('45m')
    expect(formatRelative('12s')).toBe('12s')
  })

  it('returns non-parseable strings as-is', () => {
    expect(formatRelative('not-a-date')).toBe('not-a-date')
  })

  it('formats ISO dates to compact form', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const result = formatRelative(oneHourAgo)
    expect(result).toMatch(/^\d+[hms]$/)
  })
})

describe('RelativeTime', () => {
  it('renders without crashing', () => {
    render(<RelativeTime value="3d" />)
    expect(screen.getByText('3d')).toBeTruthy()
  })

  it('renders pre-formatted age strings', () => {
    render(<RelativeTime value="2h" />)
    expect(screen.getByText('2h')).toBeTruthy()
  })

  it('uses tabular-nums font variant', () => {
    render(<RelativeTime value="3d" />)
    const el = screen.getByText('3d')
    expect(el.style.fontVariantNumeric).toBe('tabular-nums')
  })

  it('sets title attribute to original value', () => {
    render(<RelativeTime value="3d" />)
    expect(screen.getByText('3d').getAttribute('title')).toBe('3d')
  })
})
