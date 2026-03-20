import { useState, useEffect, useRef, useCallback } from 'react'
import { GetPodMetrics } from '../wailsjs/go/handlers/ResourceHandler'
import type { PodUsage } from '../wailsjs/go/handlers/ResourceHandler'

const POLL_INTERVAL_MS = 15_000
const MAX_DATA_POINTS = 60
const MAX_CONSECUTIVE_ERRORS = 3

export interface MetricsDataPoint {
  timestamp: number
  cpuCores: number
  memoryMiB: number
}

export interface MetricsHistory {
  /** Ring buffer of data points for the target pod */
  history: MetricsDataPoint[]
  /** Whether the first fetch is still in-flight */
  isLoading: boolean
  /** Whether metrics-server is unavailable */
  metricsUnavailable: boolean
}

/**
 * Polls GetPodMetrics every 15s and accumulates up to 60 data points
 * for a specific pod in a ring buffer.
 */
export function useMetricsHistory(namespace: string, podName: string): MetricsHistory {
  const [history, setHistory] = useState<MetricsDataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [metricsUnavailable, setMetricsUnavailable] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const consecutiveErrorsRef = useRef(0)

  const fetchAndAccumulate = useCallback(async (cancelled: { current: boolean }) => {
    try {
      const result = await GetPodMetrics(namespace)
      if (cancelled.current) return

      if (!result) {
        // metrics-server not available
        setMetricsUnavailable(true)
        setIsLoading(false)
        return
      }

      const podMetric: PodUsage | undefined = result.find(
        (m) => m.podName === podName && m.namespace === namespace
      )

      if (podMetric) {
        const point: MetricsDataPoint = {
          timestamp: Date.now(),
          cpuCores: podMetric.cpuCores,
          memoryMiB: podMetric.memoryMiB,
        }
        setHistory((prev) => {
          const next = [...prev, point]
          if (next.length > MAX_DATA_POINTS) {
            return next.slice(next.length - MAX_DATA_POINTS)
          }
          return next
        })
      }

      consecutiveErrorsRef.current = 0
      setMetricsUnavailable(false)
    } catch {
      if (cancelled.current) return
      consecutiveErrorsRef.current++
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setMetricsUnavailable(true)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } finally {
      if (!cancelled.current) {
        setIsLoading(false)
      }
    }
  }, [namespace, podName])

  useEffect(() => {
    const cancelled = { current: false }
    consecutiveErrorsRef.current = 0
    setHistory([])
    setIsLoading(true)
    setMetricsUnavailable(false)

    fetchAndAccumulate(cancelled)
    intervalRef.current = setInterval(() => fetchAndAccumulate(cancelled), POLL_INTERVAL_MS)

    return () => {
      cancelled.current = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchAndAccumulate])

  return { history, isLoading, metricsUnavailable }
}
