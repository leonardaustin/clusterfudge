import { describe, it, expect } from 'vitest'

/**
 * Re-implements the externalIP / status derivation logic from
 * ServiceDetail.tsx's transformServiceDetail (which is not exported).
 * This lets us validate the derivation rules in isolation.
 */
function deriveExternalIPAndStatus(spec: {
  type?: string
  externalIPs?: string[]
  loadBalancerIngress?: Array<{ ip?: string; hostname?: string }>
}): { externalIP: string; status: string } {
  const externalIPs = spec.externalIPs || []
  const ingress = spec.loadBalancerIngress || []

  let externalIP = '<none>'
  if (externalIPs.length > 0) {
    externalIP = externalIPs.join(', ')
  } else if (ingress.length > 0) {
    externalIP =
      ingress
        .map((i) => i.ip || i.hostname || '')
        .filter(Boolean)
        .join(', ') || '<pending>'
  }

  const svcType = spec.type || 'ClusterIP'
  let status = 'Active'
  if (svcType === 'LoadBalancer' && (externalIP === '<none>' || externalIP === '<pending>')) {
    status = 'Pending'
  }

  return { externalIP, status }
}

describe('ServiceDetail status derivation', () => {
  it('ClusterIP service: externalIP is <none>, status is Active', () => {
    const result = deriveExternalIPAndStatus({ type: 'ClusterIP' })
    expect(result.externalIP).toBe('<none>')
    expect(result.status).toBe('Active')
  })

  it('LoadBalancer with no ingress: externalIP is <none>, status is Pending', () => {
    const result = deriveExternalIPAndStatus({ type: 'LoadBalancer' })
    expect(result.externalIP).toBe('<none>')
    expect(result.status).toBe('Pending')
  })

  it('LoadBalancer with ingress IP: externalIP is the IP, status is Active', () => {
    const result = deriveExternalIPAndStatus({
      type: 'LoadBalancer',
      loadBalancerIngress: [{ ip: '203.0.113.10' }],
    })
    expect(result.externalIP).toBe('203.0.113.10')
    expect(result.status).toBe('Active')
  })

  it('LoadBalancer with ingress hostname only: externalIP is the hostname, status is Active', () => {
    const result = deriveExternalIPAndStatus({
      type: 'LoadBalancer',
      loadBalancerIngress: [{ hostname: 'abc123.elb.amazonaws.com' }],
    })
    expect(result.externalIP).toBe('abc123.elb.amazonaws.com')
    expect(result.status).toBe('Active')
  })

  it('LoadBalancer with ingress but empty ip/hostname: externalIP is <pending>, status is Pending', () => {
    const result = deriveExternalIPAndStatus({
      type: 'LoadBalancer',
      loadBalancerIngress: [{ ip: '', hostname: '' }],
    })
    expect(result.externalIP).toBe('<pending>')
    expect(result.status).toBe('Pending')
  })

  it('Service with spec.externalIPs: externalIP joins them, status is Active', () => {
    const result = deriveExternalIPAndStatus({
      type: 'ClusterIP',
      externalIPs: ['10.0.0.1', '10.0.0.2'],
    })
    expect(result.externalIP).toBe('10.0.0.1, 10.0.0.2')
    expect(result.status).toBe('Active')
  })
})
