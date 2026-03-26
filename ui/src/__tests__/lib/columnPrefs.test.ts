import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveColumnPrefs,
  loadColumnPrefs,
  clearColumnPrefs,
  mergeColumnPrefs,
} from '@/lib/columnPrefs'

describe('columnPrefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads column preferences', () => {
    const prefs = [
      { id: 'name', label: 'Name', visible: true },
      { id: 'status', label: 'Status', visible: false },
    ]
    saveColumnPrefs('pods', prefs)
    expect(loadColumnPrefs('pods')).toEqual(prefs)
  })

  it('returns null when no preferences saved', () => {
    expect(loadColumnPrefs('pods')).toBeNull()
  })

  it('clears preferences', () => {
    saveColumnPrefs('pods', [{ id: 'name', label: 'Name', visible: true }])
    clearColumnPrefs('pods')
    expect(loadColumnPrefs('pods')).toBeNull()
  })

  describe('mergeColumnPrefs', () => {
    const defaults = [
      { id: 'name', label: 'Name', visible: true },
      { id: 'status', label: 'Status', visible: true },
      { id: 'age', label: 'Age', visible: true },
    ]

    it('returns defaults when saved is null', () => {
      expect(mergeColumnPrefs(defaults, null)).toEqual(defaults)
    })

    it('preserves saved visibility', () => {
      const saved = [
        { id: 'name', label: 'Name', visible: true },
        { id: 'status', label: 'Status', visible: false },
        { id: 'age', label: 'Age', visible: true },
      ]
      const result = mergeColumnPrefs(defaults, saved)
      expect(result.find((c) => c.id === 'status')!.visible).toBe(false)
    })

    it('preserves saved order', () => {
      const saved = [
        { id: 'age', label: 'Age', visible: true },
        { id: 'name', label: 'Name', visible: true },
        { id: 'status', label: 'Status', visible: true },
      ]
      const result = mergeColumnPrefs(defaults, saved)
      expect(result.map((c) => c.id)).toEqual(['age', 'name', 'status'])
    })

    it('adds new columns from defaults', () => {
      const saved = [
        { id: 'name', label: 'Name', visible: true },
      ]
      const result = mergeColumnPrefs(defaults, saved)
      expect(result.length).toBe(3)
      expect(result[0].id).toBe('name')
    })

    it('drops removed columns', () => {
      const saved = [
        { id: 'name', label: 'Name', visible: true },
        { id: 'removed', label: 'Removed', visible: true },
        { id: 'status', label: 'Status', visible: true },
      ]
      const result = mergeColumnPrefs(defaults, saved)
      expect(result.find((c) => c.id === 'removed')).toBeUndefined()
    })
  })
})
