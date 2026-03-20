import { useState, useEffect, useCallback, useRef } from 'react'
import {
  StartAISession,
  WriteAISession,
  ResizeAISession,
  CloseAISession,
} from '@/wailsjs/go/handlers/AIHandler'

interface AISession {
  sessionId: string
  status: 'starting' | 'running' | 'error' | 'closed'
  error: string | null
}

export function useAISession(namespace: string, name: string, active: boolean, providerID = '') {
  const [session, setSession] = useState<AISession>({
    sessionId: '',
    status: 'starting',
    error: null,
  })
  const sessionRef = useRef<string>('')

  // Start session when active becomes true
  useEffect(() => {
    if (!active || !namespace || !name) return

    let cancelled = false

    ;(async () => {
      try {
        setSession({ sessionId: '', status: 'starting', error: null })
        const id = await StartAISession(namespace, name, providerID)
        if (cancelled) {
          CloseAISession(id)
          return
        }
        sessionRef.current = id
        setSession({ sessionId: id, status: 'running', error: null })
      } catch (err) {
        if (cancelled) return
        setSession({
          sessionId: '',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return () => {
      cancelled = true
      if (sessionRef.current) {
        CloseAISession(sessionRef.current)
        sessionRef.current = ''
      }
    }
  }, [active, namespace, name, providerID])

  const write = useCallback(
    (data: string) => {
      const id = sessionRef.current
      if (id) {
        WriteAISession(id, data).catch((err: unknown) => {
          console.error('[useAISession] write failed:', err)
        })
      }
    },
    []
  )

  const resize = useCallback(
    (rows: number, cols: number) => {
      const id = sessionRef.current
      if (id) {
        ResizeAISession(id, rows, cols).catch((err: unknown) => {
          console.error('[useAISession] resize failed:', err)
        })
      }
    },
    []
  )

  const close = useCallback(() => {
    const id = sessionRef.current
    if (id) {
      CloseAISession(id)
      sessionRef.current = ''
      setSession((prev) => ({ ...prev, status: 'closed' }))
    }
  }, [])

  return { ...session, write, resize, close }
}
