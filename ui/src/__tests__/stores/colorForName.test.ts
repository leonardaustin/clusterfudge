import { describe, it, expect } from 'vitest'
import { colorForName } from '@/stores/clusterStore'

describe('colorForName', () => {
  it('returns deterministic color for same name', () => {
    const a = colorForName('prod')
    const b = colorForName('prod')
    expect(a).toBe(b)
  })

  it('returns a hex color from the palette', () => {
    const color = colorForName('staging')
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('produces different colors for different names', () => {
    const colors = new Set(['prod', 'staging', 'dev', 'test'].map(colorForName))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles empty string without throwing', () => {
    expect(() => colorForName('')).not.toThrow()
    expect(colorForName('')).toMatch(/^#/)
  })
})
