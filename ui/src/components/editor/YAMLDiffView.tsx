import { DiffEditor, type DiffOnMount } from '@monaco-editor/react'
import { useCallback } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { monacoTheme } from './monacoTheme'

interface YAMLDiffViewProps {
  original: string
  modified: string
  onClose: () => void
}

export function YAMLDiffView({ original, modified, onClose }: YAMLDiffViewProps) {
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorMinimap = useSettingsStore((s) => s.editorMinimap)

  const handleMount: DiffOnMount = useCallback((_editor, monaco) => {
    monaco.editor.defineTheme('kubeviewer-dark', monacoTheme)
    monaco.editor.setTheme('kubeviewer-dark')
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--blue)',
              background: 'var(--blue-muted, rgba(96, 165, 250, 0.15))',
            }}
          >
            Diff Preview (dry-run)
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Live (left) vs Pending (right)
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-tertiary)',
          }}
        >
          Close Diff
        </button>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          language="yaml"
          original={original}
          modified={modified}
          onMount={handleMount}
          options={{
            readOnly: true,
            minimap: { enabled: editorMinimap },
            fontSize: editorFontSize,
            fontFamily: 'var(--font-mono)',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            overviewRulerBorder: false,
            contextmenu: false,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  )
}
