import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthErrorHelp, InlineAuthHelp } from '@/components/welcome/AuthErrorHelp'

describe('AuthErrorHelp', () => {
  it('renders nothing when errorCode is not auth-related', () => {
    const { container } = render(
      <AuthErrorHelp authProvider="eks" errorCode="NOT_FOUND" />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when authProvider has no re-auth steps', () => {
    const { container } = render(
      <AuthErrorHelp authProvider="minikube" errorCode="AUTH_ERROR" />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when authProvider is undefined', () => {
    const { container } = render(
      <AuthErrorHelp authProvider={undefined} errorCode="AUTH_ERROR" />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows expandable help for EKS auth errors', async () => {
    const user = userEvent.setup()
    render(<AuthErrorHelp authProvider="eks" errorCode="AUTH_ERROR" />)

    // Should show toggle
    const toggle = screen.getByText(/How to re-authenticate with AWS EKS/)
    expect(toggle).toBeDefined()

    // Expand
    await user.click(toggle)

    // Should show re-auth steps
    expect(screen.getByText(/Re-authenticate with AWS SSO/)).toBeDefined()
    expect(screen.getByText('aws sso login --profile <profile>')).toBeDefined()
  })

  it('shows expandable help for GKE auth errors', async () => {
    const user = userEvent.setup()
    render(<AuthErrorHelp authProvider="gke" errorCode="AUTH_ERROR" />)

    await user.click(screen.getByText(/How to re-authenticate with Google GKE/))

    expect(screen.getByText(/Re-authenticate with Google Cloud/)).toBeDefined()
    expect(screen.getByText('gcloud auth login')).toBeDefined()
  })

  it('shows expandable help for AKS auth errors', async () => {
    const user = userEvent.setup()
    render(<AuthErrorHelp authProvider="aks" errorCode="AUTH_ERROR" />)

    await user.click(screen.getByText(/How to re-authenticate with Azure AKS/))

    expect(screen.getByText(/Re-authenticate with Azure/)).toBeDefined()
    expect(screen.getByText('az login')).toBeDefined()
  })

  it('works for CONNECTION_ERROR too', async () => {
    const user = userEvent.setup()
    render(<AuthErrorHelp authProvider="eks" errorCode="CONNECTION_ERROR" />)

    const toggle = screen.getByText(/How to re-authenticate with AWS EKS/)
    expect(toggle).toBeDefined()

    await user.click(toggle)
    expect(screen.getByText(/Re-authenticate with AWS SSO/)).toBeDefined()
  })

  it('shows reconnect hint and docs link when expanded', async () => {
    const user = userEvent.setup()
    render(<AuthErrorHelp authProvider="gke" errorCode="AUTH_ERROR" />)

    await user.click(screen.getByText(/How to re-authenticate with Google GKE/))

    expect(screen.getByText(/Then click the cluster above to reconnect/)).toBeDefined()
    const docsLink = screen.getByText(/Google GKE docs/)
    expect(docsLink.closest('a')?.getAttribute('href')).toContain('cloud.google.com')
  })
})

describe('InlineAuthHelp', () => {
  it('renders nothing when provider has no re-auth steps', () => {
    const { container } = render(<InlineAuthHelp authProvider="minikube" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when provider is undefined', () => {
    const { container } = render(<InlineAuthHelp authProvider={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows inline command for EKS', () => {
    render(<InlineAuthHelp authProvider="eks" />)
    expect(screen.getByText('aws sso login --profile <profile>')).toBeDefined()
  })

  it('shows inline command for GKE', () => {
    render(<InlineAuthHelp authProvider="gke" />)
    expect(screen.getByText('gcloud auth login')).toBeDefined()
  })

  it('shows inline command for AKS', () => {
    render(<InlineAuthHelp authProvider="aks" />)
    expect(screen.getByText('az login')).toBeDefined()
  })
})
