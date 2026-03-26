import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportToCsv } from '@/lib/csvExport'

describe('exportToCsv', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test')
    revokeObjectURLMock = vi.fn()
    Object.defineProperty(globalThis, 'URL', {
      value: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
      writable: true,
    })
  })

  it('does nothing for empty data', () => {
    exportToCsv('test', [], [{ key: 'name', label: 'Name' }])
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('creates correct CSV content', () => {
    const data = [
      { name: 'pod-a', status: 'Running' },
      { name: 'pod-b', status: 'Failed' },
    ]
    const columns = [
      { key: 'name' as const, label: 'Name' },
      { key: 'status' as const, label: 'Status' },
    ]

    // Mock link click
    const clickMock = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_v: string) { /* noop */ },
      set download(_v: string) { /* noop */ },
      click: clickMock,
    } as unknown as HTMLAnchorElement)

    exportToCsv('pods', data, columns)

    expect(createObjectURLMock).toHaveBeenCalled()
    const blob = createObjectURLMock.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    expect(clickMock).toHaveBeenCalled()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test')
  })
})
