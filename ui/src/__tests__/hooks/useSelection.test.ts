import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSelection } from '@/hooks/useSelection'

describe('useSelection', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current.count).toBe(0)
    expect(result.current.selected.size).toBe(0)
  })

  it('toggles selection', () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.count).toBe(1)

    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('selects all', () => {
    const { result } = renderHook(() => useSelection<{ id: string }>())
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    act(() => result.current.selectAll(items, (i) => i.id))
    expect(result.current.count).toBe(3)
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.isSelected('b')).toBe(true)
    expect(result.current.isSelected('c')).toBe(true)
  })

  it('clears all', () => {
    const { result } = renderHook(() => useSelection())
    act(() => {
      result.current.toggle('a')
      result.current.toggle('b')
    })
    expect(result.current.count).toBe(2)

    act(() => result.current.clearAll())
    expect(result.current.count).toBe(0)
  })
})
