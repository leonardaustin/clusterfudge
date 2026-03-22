import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPalette } from '@/hooks/useCommandPalette'

const initialState = useCommandPalette.getState()

function resetStore() {
  useCommandPalette.setState(initialState, true)
}

describe('useCommandPalette', () => {
  beforeEach(resetStore)

  it('starts closed', () => {
    expect(useCommandPalette.getState().isOpen).toBe(false)
  })

  it('openPalette', () => {
    useCommandPalette.getState().openPalette()
    expect(useCommandPalette.getState().isOpen).toBe(true)
  })

  it('closePalette', () => {
    useCommandPalette.getState().openPalette()
    useCommandPalette.getState().closePalette()
    expect(useCommandPalette.getState().isOpen).toBe(false)
  })

  it('togglePalette', () => {
    useCommandPalette.getState().togglePalette()
    expect(useCommandPalette.getState().isOpen).toBe(true)

    useCommandPalette.getState().togglePalette()
    expect(useCommandPalette.getState().isOpen).toBe(false)
  })
})
