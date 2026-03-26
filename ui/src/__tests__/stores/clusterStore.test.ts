import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClusterStore, type ClusterInfo } from '@/stores/clusterStore'

const initialState = useClusterStore.getState()

function resetStore() {
  useClusterStore.setState(initialState, true)
}

const makeClusters = (): ClusterInfo[] => [
  { name: 'prod', server: 'https://prod:6443', status: 'disconnected', color: '#7C5CFC', contextName: 'prod-ctx' },
  { name: 'staging', server: 'https://staging:6443', status: 'disconnected', color: '#4ADE80', contextName: 'staging-ctx' },
]

describe('clusterStore', () => {
  beforeEach(resetStore)

  it('has correct initial state', () => {
    const s = useClusterStore.getState()
    expect(s.activeCluster).toBeNull()
    expect(s.clusters).toEqual([])
    expect(s.namespaces).toEqual([])
    expect(s.selectedNamespace).toBe('')
    expect(s.k8sVersion).toBeNull()
    expect(s.customResources).toEqual([])
    expect(s.connectionError).toBeNull()
  })

  it('setActiveCluster', () => {
    useClusterStore.getState().setActiveCluster('prod')
    expect(useClusterStore.getState().activeCluster).toBe('prod')

    useClusterStore.getState().setActiveCluster(null)
    expect(useClusterStore.getState().activeCluster).toBeNull()
  })

  it('setClusters', () => {
    const clusters = makeClusters()
    useClusterStore.getState().setClusters(clusters)
    expect(useClusterStore.getState().clusters).toEqual(clusters)
  })

  it('updateClusterStatus', () => {
    useClusterStore.getState().setClusters(makeClusters())
    useClusterStore.getState().updateClusterStatus('prod', 'connected')
    expect(useClusterStore.getState().clusters[0].status).toBe('connected')
    expect(useClusterStore.getState().clusters[1].status).toBe('disconnected')
  })

  it('connectCluster sets connecting then connected on success', async () => {
    vi.doMock('@/wailsjs/go/main/App', () => ({
      ConnectCluster: vi.fn().mockResolvedValue(undefined),
    }))

    useClusterStore.getState().setClusters(makeClusters())
    const promise = useClusterStore.getState().connectCluster('prod')

    // After starting, should be connecting
    expect(useClusterStore.getState().activeCluster).toBe('prod')
    expect(useClusterStore.getState().clusters[0].status).toBe('connecting')

    await promise

    expect(useClusterStore.getState().clusters[0].status).toBe('connected')
    expect(useClusterStore.getState().connectionError).toBeNull()

    vi.doUnmock('@/wailsjs/go/main/App')
  })

  it('connectCluster sets error on failure', async () => {
    vi.doMock('@/wailsjs/go/main/App', () => ({
      ConnectCluster: vi.fn().mockRejectedValue(new Error('connection refused')),
    }))

    useClusterStore.getState().setClusters(makeClusters())
    await useClusterStore.getState().connectCluster('prod')

    expect(useClusterStore.getState().activeCluster).toBeNull()
    expect(useClusterStore.getState().clusters[0].status).toBe('error')
    expect(useClusterStore.getState().connectionError).toContain('connection refused')

    vi.doUnmock('@/wailsjs/go/main/App')
  })

  it('disconnectCluster resets cluster state', () => {
    useClusterStore.getState().setClusters(makeClusters())
    useClusterStore.getState().setActiveCluster('prod')
    useClusterStore.getState().updateClusterStatus('prod', 'connected')
    useClusterStore.getState().setNamespaces(['default', 'kube-system'])
    useClusterStore.getState().setNamespace('default')
    useClusterStore.getState().setK8sVersion('1.28.0')
    useClusterStore.getState().setCustomResources([{ label: 'Cert', group: 'cert-manager.io', resource: 'certificates', path: '/custom/certs' }])

    useClusterStore.getState().disconnectCluster()

    const s = useClusterStore.getState()
    expect(s.activeCluster).toBeNull()
    expect(s.namespaces).toEqual([])
    expect(s.selectedNamespace).toBe('')
    expect(s.k8sVersion).toBeNull()
    expect(s.customResources).toEqual([])
    // The previously active cluster should be disconnected
    expect(s.clusters.find(c => c.name === 'prod')!.status).toBe('disconnected')
  })

  it('setNamespaces and setNamespace', () => {
    useClusterStore.getState().setNamespaces(['default', 'kube-system'])
    expect(useClusterStore.getState().namespaces).toEqual(['default', 'kube-system'])

    useClusterStore.getState().setNamespace('kube-system')
    expect(useClusterStore.getState().selectedNamespace).toBe('kube-system')
  })

  it('setK8sVersion', () => {
    useClusterStore.getState().setK8sVersion('1.28.0')
    expect(useClusterStore.getState().k8sVersion).toBe('1.28.0')
  })

  it('setCustomResources', () => {
    const crds = [{ label: 'Cert', group: 'cert-manager.io', resource: 'certificates', path: '/custom/certs' }]
    useClusterStore.getState().setCustomResources(crds)
    expect(useClusterStore.getState().customResources).toEqual(crds)
  })

  it('setConnectionError', () => {
    useClusterStore.getState().setConnectionError('timeout')
    expect(useClusterStore.getState().connectionError).toBe('timeout')

    useClusterStore.getState().setConnectionError(null)
    expect(useClusterStore.getState().connectionError).toBeNull()
  })
})
