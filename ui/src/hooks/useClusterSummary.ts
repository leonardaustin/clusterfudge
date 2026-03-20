import { useState, useEffect, useCallback, useRef } from "react";
import { GetClusterSummary } from "../wailsjs/go/handlers/ClusterHandler";
import type { ClusterSummary } from "../wailsjs/go/handlers/ClusterHandler";
import { useClusterStore } from "../stores/clusterStore";

export function useClusterSummary() {
  const [summary, setSummary] = useState<ClusterSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const activeCluster = useClusterStore((s) => s.activeCluster);
  const clusters = useClusterStore((s) => s.clusters);
  const isConnected =
    clusters.find((c) => c.name === activeCluster)?.status === "connected";

  const refresh = useCallback(async () => {
    const id = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await GetClusterSummary();
      if (id === requestIdRef.current) {
        setSummary(result);
      }
    } catch (err: unknown) {
      if (id === requestIdRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (id === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setIsLoading(false);
      return;
    }
    refresh();
  }, [isConnected, refresh]);

  return { summary, isLoading, error, refresh };
}
