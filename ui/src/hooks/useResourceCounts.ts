import { useState, useEffect } from 'react'
import { ListResources } from '../wailsjs/go/handlers/ResourceHandler'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'

// Sidebar uses short aliases for some resource keys.
const KEY_ALIASES: Record<string, string> = {
  persistentvolumeclaims: 'pvcs',
  persistentvolumes: 'pvs',
  poddisruptionbudgets: 'pdbs',
}

const COUNT_RESOURCES = Object.keys(RESOURCE_CONFIG)

export function useResourceCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const clusterStatus = useClusterStore((s) =>
    s.clusters.find((c) => c.name === s.activeCluster)?.status
  )

  useEffect(() => {
    if (!activeCluster || clusterStatus !== 'connected') return
    let cancelled = false

    async function fetchCounts() {
      const results = await Promise.all(
        COUNT_RESOURCES.map(async (key) => {
          const config = RESOURCE_CONFIG[key]
          if (!config) return { key, count: 0 }
          try {
            const ns = config.namespaced ? selectedNamespace : ''
            const items = await ListResources(config.group, config.version, config.plural, ns)
            return { key, count: Array.isArray(items) ? items.length : 0 }
          } catch {
            return { key, count: 0 }
          }
        })
      )
      if (!cancelled) {
        const result: Record<string, number> = {}
        for (const { key, count } of results) {
          result[key] = count
          // Also set the alias so the sidebar can look up by short name.
          const alias = KEY_ALIASES[key]
          if (alias) result[alias] = count
        }
        setCounts(result)
      }
    }

    fetchCounts()
    return () => { cancelled = true }
  }, [activeCluster, clusterStatus, selectedNamespace])

  return counts
}
