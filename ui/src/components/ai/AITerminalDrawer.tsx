import { X, Bot } from 'lucide-react'
import { useEffect, useRef, useCallback } from 'react'
import { useAISession } from '@/hooks/useAISession'
import { TERMINAL_THEMES } from '@/lib/terminalThemes'
import { useSettingsStore } from '@/stores/settingsStore'
import { EventsOn } from '@/wailsjs/runtime/runtime'

interface AITerminalDrawerProps {
  namespace: string
  name: string
  providerName: string
  onClose: () => void
}

export function AITerminalDrawer({ namespace, name, providerName, onClose }: AITerminalDrawerProps) {
  const termContainerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])

  const termFontSize = useSettingsStore((s) => s.terminalFontSize)
  const termCursorStyle = useSettingsStore((s) => s.terminalCursorStyle)
  const termCursorBlink = useSettingsStore((s) => s.terminalCursorBlink)
  const termTheme = useSettingsStore((s) => s.terminalTheme) as keyof typeof TERMINAL_THEMES

  const { sessionId, status, error, write, resize } = useAISession(namespace, name, true)

  // Initialize xterm.js
  useEffect(() => {
    if (!termContainerRef.current) return

    let disposed = false
    const cleanup: Array<() => void> = []

    ;(async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('@xterm/xterm/css/xterm.css')

      if (disposed) return

      const resolvedTheme = TERMINAL_THEMES[termTheme] ?? TERMINAL_THEMES.dark

      const term = new Terminal({
        theme: resolvedTheme,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        fontSize: termFontSize,
        lineHeight: 1.4,
        cursorBlink: termCursorBlink,
        cursorStyle: termCursorStyle as 'block' | 'bar' | 'underline',
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termContainerRef.current!)
      fitAddon.fit()

      termRef.current = term

      // Send resize info after fit
      const { rows, cols } = term
      resize(rows, cols)

      // Handle user input
      const dataDisposable = term.onData((data) => {
        write(data)
      })
      cleanup.push(() => dataDisposable.dispose())

      // Handle terminal resize
      const resizeDisposable = term.onResize(({ rows, cols }) => {
        resize(rows, cols)
      })
      cleanup.push(() => resizeDisposable.dispose())

      // Container resize observer
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit()
      })
      resizeObserver.observe(termContainerRef.current!)
      cleanup.push(() => resizeObserver.disconnect())

      // Show initial message
      term.write('\x1b[90mStarting AI session...\x1b[0m\r\n')

      cleanupRef.current = cleanup
    })()

    return () => {
      disposed = true
      for (const fn of cleanup) fn()
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
      }
    }
    // Only initialize once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect PTY output to xterm when session is ready
  useEffect(() => {
    if (!sessionId || !termRef.current) return

    const term = termRef.current

    const stdoutCleanup = EventsOn(`ai:stdout:${sessionId}`, (data: unknown) => {
      term.write(data as string)
    })

    const exitCleanup = EventsOn(`ai:exit:${sessionId}`, (msg: unknown) => {
      const message = msg as string
      term.write(`\r\n\x1b[90m[AI session ended${message ? `: ${message}` : ''}]\x1b[0m\r\n`)
    })

    return () => {
      stdoutCleanup()
      exitCleanup()
    }
  }, [sessionId])

  // Show error in terminal
  useEffect(() => {
    if (status === 'error' && error && termRef.current) {
      termRef.current.write(`\x1b[31m${error}\x1b[0m\r\n`)
    }
  }, [status, error])

  // Handle Escape key to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        role="button"
        tabIndex={0}
        aria-label="Close AI session"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose() }}
      />

      {/* Drawer */}
      <div
        className="relative flex flex-col bg-bg-primary border-l border-border shadow-xl"
        style={{ width: 'min(720px, 80vw)', height: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <Bot className="w-4 h-4 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">
              {providerName}
            </div>
            <div className="text-xs text-text-tertiary truncate">
              {namespace}/{name}
            </div>
          </div>
          {status === 'starting' && (
            <span className="text-xs text-text-tertiary animate-pulse">Starting...</span>
          )}
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded transition-colors"
            title="Close AI session"
            aria-label="Close AI session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Terminal */}
        <div ref={termContainerRef} className="flex-1 min-h-0" />
      </div>
    </div>
  )
}
