import { describe, it, expect } from 'vitest'
import { providerGuides, guideForProvider } from '@/components/welcome/providerGuides'

describe('providerGuides', () => {
  it('has all expected providers', () => {
    const ids = providerGuides.map((g) => g.id)
    expect(ids).toContain('eks')
    expect(ids).toContain('gke')
    expect(ids).toContain('aks')
    expect(ids).toContain('minikube')
    expect(ids).toContain('kind')
    expect(ids).toContain('docker-desktop')
    expect(ids).toContain('rancher-desktop')
    expect(ids).toContain('generic')
  })

  it('every guide has a valid category', () => {
    for (const guide of providerGuides) {
      expect(['cloud', 'local', 'other']).toContain(guide.category)
    }
  })

  it('every guide has at least one setup step', () => {
    for (const guide of providerGuides) {
      expect(guide.setupSteps.length).toBeGreaterThan(0)
    }
  })

  it('cloud providers have re-auth steps', () => {
    for (const id of ['eks', 'gke', 'aks']) {
      const guide = guideForProvider(id)
      expect(guide).toBeDefined()
      expect(guide!.reauthSteps).toBeDefined()
      expect(guide!.reauthSteps!.length).toBeGreaterThan(0)
    }
  })

  it('local providers do not have re-auth steps', () => {
    for (const id of ['minikube', 'kind', 'docker-desktop', 'rancher-desktop']) {
      const guide = guideForProvider(id)
      expect(guide).toBeDefined()
      expect(guide!.reauthSteps).toBeUndefined()
    }
  })
})

describe('guideForProvider', () => {
  it('returns matching guide', () => {
    const guide = guideForProvider('eks')
    expect(guide).toBeDefined()
    expect(guide!.name).toBe('AWS EKS')
  })

  it('returns undefined for unknown provider', () => {
    expect(guideForProvider('unknown')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(guideForProvider(undefined)).toBeUndefined()
  })
})
