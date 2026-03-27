import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ namespace: 'default', name: 'my-secret' })),
  }
})

vi.mock('@/wailsjs/go/handlers/SecretHandler', () => ({
  GetSecret: vi.fn().mockResolvedValue({
    name: 'my-secret',
    namespace: 'default',
    type: 'Opaque',
    data: {
      username: '******',
      password: '******',
    },
  }),
  RevealSecretKey: vi.fn().mockResolvedValue('decoded-value'),
}))

import { GetSecret, RevealSecretKey } from '@/wailsjs/go/handlers/SecretHandler'
import { SecretDetail } from '@/pages/SecretDetail'

const mockGetSecret = vi.mocked(GetSecret)
const mockRevealSecretKey = vi.mocked(RevealSecretKey)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSecret.mockResolvedValue({
    name: 'my-secret',
    namespace: 'default',
    type: 'Opaque',
    data: {
      username: '******',
      password: '******',
    },
  })
  mockRevealSecretKey.mockResolvedValue('decoded-value')
})

function renderSecretDetail() {
  return render(
    <MemoryRouter>
      <SecretDetail />
    </MemoryRouter>
  )
}

describe('SecretDetail', () => {
  it('renders loading state initially', () => {
    // Use a never-resolving promise to keep loading state
    mockGetSecret.mockReturnValue(new Promise(() => {}))
    renderSecretDetail()
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders secret metadata after loading', async () => {
    await act(async () => { renderSecretDetail() })
    // 'my-secret' appears in header title and metadata value
    expect(screen.getAllByText('my-secret').length).toBeGreaterThan(0)
    // 'default' appears in namespace value and subtitle
    expect(screen.getAllByText('default').length).toBeGreaterThan(0)
    expect(screen.getByText('Opaque')).toBeDefined()
  })

  it('renders data keys with masked values', async () => {
    await act(async () => { renderSecretDetail() })
    expect(screen.getByText('username')).toBeDefined()
    expect(screen.getByText('password')).toBeDefined()
    // Both keys should have masked values
    const maskedValues = screen.getAllByText('******')
    expect(maskedValues.length).toBe(2)
  })

  it('shows Show buttons for each key', async () => {
    await act(async () => { renderSecretDetail() })
    const showButtons = screen.getAllByText('Show')
    expect(showButtons.length).toBe(2)
  })

  it('reveals a secret value when Show is clicked', async () => {
    await act(async () => { renderSecretDetail() })

    const showButtons = screen.getAllByText('Show')
    await act(async () => {
      fireEvent.click(showButtons[0])
    })

    expect(mockRevealSecretKey).toHaveBeenCalledWith('default', 'my-secret', 'username')
    expect(screen.getByText('decoded-value')).toBeDefined()
    // The clicked button should now say "Hide"
    expect(screen.getByText('Hide')).toBeDefined()
  })

  it('hides a revealed value when Hide is clicked', async () => {
    await act(async () => { renderSecretDetail() })

    // First reveal
    const showButtons = screen.getAllByText('Show')
    await act(async () => {
      fireEvent.click(showButtons[0])
    })

    expect(screen.getByText('decoded-value')).toBeDefined()

    // Now hide
    const hideButton = screen.getByText('Hide')
    await act(async () => {
      fireEvent.click(hideButton)
    })

    // Should be masked again
    await waitFor(() => {
      expect(screen.queryByText('decoded-value')).toBeNull()
    })
    // All values should be masked again
    const maskedValues = screen.getAllByText('******')
    expect(maskedValues.length).toBe(2)
  })

  it('shows error state when fetch fails', async () => {
    mockGetSecret.mockRejectedValue(new Error('secret not found'))
    await act(async () => { renderSecretDetail() })
    expect(screen.getByText(/secret not found/)).toBeDefined()
    expect(screen.getAllByText('Back to list').length).toBeGreaterThan(0)
  })

  it('shows back to list link', async () => {
    await act(async () => { renderSecretDetail() })
    expect(screen.getByText('Back to list')).toBeDefined()
  })

  it('shows data key count', async () => {
    await act(async () => { renderSecretDetail() })
    expect(screen.getByText('Data (2 keys)')).toBeDefined()
  })
})
