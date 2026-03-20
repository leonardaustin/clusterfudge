import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOS } from '@/hooks/useOS'

describe('useOS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects mac', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    const { result } = renderHook(() => useOS())
    expect(result.current).toBe('mac')
  })

  it('detects windows', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    const { result } = renderHook(() => useOS())
    expect(result.current).toBe('windows')
  })

  it('defaults to linux', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' })
    const { result } = renderHook(() => useOS())
    expect(result.current).toBe('linux')
  })
})
