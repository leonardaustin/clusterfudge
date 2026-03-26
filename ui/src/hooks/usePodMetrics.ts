import { useState, useEffect, useRef } from "react";
import { GetPodMetrics } from "../wailsjs/go/handlers/ResourceHandler";
import type { PodUsage } from "../wailsjs/go/handlers/ResourceHandler";

const POLL_INTERVAL_MS = 15_000;
const MAX_CONSECUTIVE_ERRORS = 3;

export function usePodMetrics(namespace: string) {
  const [metrics, setMetrics] = useState<Map<string, PodUsage>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let consecutiveErrors = 0;

    async function fetchMetrics() {
      try {
        const result = await GetPodMetrics(namespace);
        if (cancelled) return;

        const map = new Map<string, PodUsage>();
        if (result) {
          for (const pod of result) {
            map.set(`${pod.namespace}/${pod.podName}`, pod);
          }
        }
        setMetrics(map);
        setError(null);
        consecutiveErrors = 0;
      } catch (err: unknown) {
        if (!cancelled) {
          consecutiveErrors++;
          setError(err instanceof Error ? err.message : String(err));
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [namespace]);

  return { metrics, isLoading, error };
}
