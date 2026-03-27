import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useVimNavigation } from '@/hooks/useVimNavigation'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function fireKey(key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
}

interface Item {
  name: string
  namespace: string
}

const items: Item[] = [
  { name: 'pod-a', namespace: 'default' },
  { name: 'pod-b', namespace: 'default' },
  { name: 'pod-c', namespace: 'default' },
]

const getItemId = (item: Item) => `${item.namespace}/${item.name}`
const getItemPath = (item: Item) => `/workloads/pods/${item.namespace}/${item.name}`
const listPath = '/workloads/pods'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('useVimNavigation', () => {
  it('j navigates to first item when nothing is selected', () => {
    renderHook(() => useVimNavigation(items, undefined, getItemId, getItemPath, listPath), { wrapper })

    act(() => fireKey('j'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-a')
  })

  it('j navigates to next item', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('j'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-b')
  })

  it('k navigates to previous item', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-b', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('k'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-a')
  })

  it('j does not go past the last item', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-c', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('j'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-c')
  })

  it('k does not go before the first item', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('k'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-a')
  })

  it('l navigates to selected item detail', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-b', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('l'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods/default/pod-b')
  })

  it('l does nothing when nothing is selected', () => {
    renderHook(
      () => useVimNavigation(items, undefined, getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('l'))

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('h navigates back to list', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('h'))

    expect(mockNavigate).toHaveBeenCalledWith('/workloads/pods')
  })

  it('does not fire when input is focused', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => fireKey('j'))

    expect(mockNavigate).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('does not fire when textarea is focused', () => {
    renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    act(() => fireKey('k'))

    expect(mockNavigate).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('does nothing with empty items', () => {
    renderHook(
      () => useVimNavigation([], undefined, getItemId, getItemPath, listPath),
      { wrapper }
    )

    act(() => fireKey('j'))

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(
      () => useVimNavigation(items, 'default/pod-a', getItemId, getItemPath, listPath),
      { wrapper }
    )

    unmount()
    act(() => fireKey('j'))

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
