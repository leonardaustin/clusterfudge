import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useClusterStore } from '@/stores/clusterStore'

function RequireCluster({ children }: { children: React.ReactNode }) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  if (!activeCluster) {
    return <Navigate to="/welcome" replace />
  }
  return <>{children}</>
}

function TestApp({ initialPath = '/' }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/welcome" element={<div>Welcome Page</div>} />
        <Route path="/*" element={
          <RequireCluster>
            <Routes>
              <Route path="/overview" element={<div>Overview Page</div>} />
              <Route path="/" element={<div>Home Page</div>} />
            </Routes>
          </RequireCluster>
        } />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireCluster', () => {
  beforeEach(() => {
    useClusterStore.setState({
      activeCluster: null,
      clusters: [],
    })
  })

  it('redirects to /welcome when no active cluster', () => {
    render(<TestApp initialPath="/overview" />)
    expect(screen.getByText('Welcome Page')).toBeTruthy()
  })

  it('renders children when cluster is active', () => {
    useClusterStore.setState({ activeCluster: 'test-cluster' })
    render(<TestApp initialPath="/overview" />)
    expect(screen.getByText('Overview Page')).toBeTruthy()
  })

  it('redirects root path to /welcome when no cluster', () => {
    render(<TestApp initialPath="/" />)
    expect(screen.getByText('Welcome Page')).toBeTruthy()
  })
})
