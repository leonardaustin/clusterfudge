import { describe, it, expect } from 'vitest'
import { RESOURCE_CONFIG } from '@/lib/resourceConfig'

describe('RESOURCE_CONFIG', () => {
  it('has at least 28 resource types', () => {
    expect(Object.keys(RESOURCE_CONFIG).length).toBeGreaterThanOrEqual(28)
  })

  it('each entry has required fields', () => {
    for (const [, config] of Object.entries(RESOURCE_CONFIG)) {
      expect(config.version).toBeTruthy()
      expect(config.plural).toBeTruthy()
      expect(config.displayName).toBeTruthy()
      expect(typeof config.namespaced).toBe('boolean')
      expect(config.category).toBeTruthy()
    }
  })

  it('pods config is correct', () => {
    const pods = RESOURCE_CONFIG.pods
    expect(pods.group).toBe('')
    expect(pods.version).toBe('v1')
    expect(pods.plural).toBe('pods')
    expect(pods.displayName).toBe('Pods')
    expect(pods.namespaced).toBe(true)
    expect(pods.category).toBe('workloads')
  })

  it('nodes are not namespaced', () => {
    expect(RESOURCE_CONFIG.nodes.namespaced).toBe(false)
  })

  it('clusterroles are not namespaced', () => {
    expect(RESOURCE_CONFIG.clusterroles.namespaced).toBe(false)
  })

  it('deployments use apps group', () => {
    expect(RESOURCE_CONFIG.deployments.group).toBe('apps')
  })
})
