import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupGuides } from '@/components/welcome/SetupGuides'

describe('SetupGuides', () => {
  it('renders all provider sections in full mode', () => {
    render(<SetupGuides />)

    expect(screen.getByText('Cloud Providers')).toBeDefined()
    expect(screen.getByText('Local Development')).toBeDefined()
    expect(screen.getByText('AWS EKS')).toBeDefined()
    expect(screen.getByText('Google GKE')).toBeDefined()
    expect(screen.getByText('Azure AKS')).toBeDefined()
    expect(screen.getByText('minikube')).toBeDefined()
    expect(screen.getByText('kind')).toBeDefined()
    expect(screen.getByText('Docker Desktop')).toBeDefined()
    expect(screen.getByText('Rancher Desktop')).toBeDefined()
    expect(screen.getByText('Other / Manual')).toBeDefined()
  })

  it('expands a provider card to show setup steps', async () => {
    const user = userEvent.setup()
    render(<SetupGuides />)

    // Click on AWS EKS
    await user.click(screen.getByText('AWS EKS'))

    // Should show setup steps
    expect(screen.getByText('Install the AWS CLI')).toBeDefined()
    expect(screen.getByText('Configure AWS credentials')).toBeDefined()
    expect(screen.getByText('Update your kubeconfig')).toBeDefined()
  })

  it('shows copy buttons for commands', async () => {
    const user = userEvent.setup()
    render(<SetupGuides />)

    await user.click(screen.getByText('minikube'))

    // Should have command text
    expect(screen.getByText('brew install minikube')).toBeDefined()
    expect(screen.getByText('minikube start')).toBeDefined()
  })

  it('starts hidden in compact mode and shows toggle', () => {
    render(<SetupGuides compact />)

    // Should show toggle link, not the full guides
    expect(screen.getByText('Need help connecting to a cloud cluster?')).toBeDefined()
    expect(screen.queryByText('Cloud Providers')).toBeNull()
  })

  it('expands from compact mode when clicked', async () => {
    const user = userEvent.setup()
    render(<SetupGuides compact />)

    await user.click(screen.getByText('Need help connecting to a cloud cluster?'))

    // Now shows the full guides
    expect(screen.getByText('Cloud Providers')).toBeDefined()
    expect(screen.getByText('AWS EKS')).toBeDefined()
  })

  it('can hide guides in compact mode', async () => {
    const user = userEvent.setup()
    render(<SetupGuides compact />)

    // Expand
    await user.click(screen.getByText('Need help connecting to a cloud cluster?'))
    expect(screen.getByText('Cloud Providers')).toBeDefined()

    // Hide
    await user.click(screen.getByText('Hide'))
    expect(screen.queryByText('Cloud Providers')).toBeNull()
    expect(screen.getByText('Need help connecting to a cloud cluster?')).toBeDefined()
  })

  it('shows documentation links when expanded', async () => {
    const user = userEvent.setup()
    render(<SetupGuides />)

    await user.click(screen.getByText('Google GKE'))

    const docsLink = screen.getByText('Documentation')
    expect(docsLink).toBeDefined()
    expect(docsLink.closest('a')?.getAttribute('href')).toContain('cloud.google.com')
  })
})
