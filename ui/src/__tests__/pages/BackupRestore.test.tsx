import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/BackupHandler', () => ({
  StripManifestFromString: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ListResources: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { BackupRestore } from '@/pages/BackupRestore'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BackupRestore', () => {
  it('renders with title and subtitle', () => {
    render(<BackupRestore />)
    expect(screen.getByText('Backup & Restore')).toBeDefined()
    expect(screen.getByText('Export and import Kubernetes resources')).toBeDefined()
  })

  it('renders Export and Import sections', () => {
    render(<BackupRestore />)
    expect(screen.getByText('Export')).toBeDefined()
    expect(screen.getByText('Import')).toBeDefined()
    expect(screen.getByText('Export JSON')).toBeDefined()
    expect(screen.getByText('Strip & Preview')).toBeDefined()
  })

  it('renders kind selector with default value', () => {
    render(<BackupRestore />)
    expect(screen.getByText('Deployment')).toBeDefined()
    expect(screen.getByText('Resource Kind')).toBeDefined()
  })
})
