import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { monacoTheme } from './monacoTheme'
import {
  validateTopLevelFields,
  extractKind,
  getTopLevelFields,
  getSpecFields,
  getMetadataFields,
  type K8sFieldDef,
} from './k8sSchema'

// Derive Monaco type from the OnMount callback's second parameter
type MonacoInstance = Parameters<OnMount>[1]
type EditorInstance = Parameters<OnMount>[0]

interface YAMLEditorProps {
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onApply?: (value: string) => void
  onPreview?: (value: string) => void
}

/** Parse multi-doc YAML into segments with line ranges */
interface DocSegment {
  label: string
  startLine: number // 1-based
  endLine: number   // 1-based inclusive
}

function parseDocSegments(text: string): DocSegment[] {
  const lines = text.split('\n')
  const segments: DocSegment[] = []
  let docStart = 0
  let docIdx = 0

  const finishDoc = (endIdx: number) => {
    const slice = lines.slice(docStart, endIdx).join('\n')
    const kindMatch = slice.match(/^kind:\s*(\S+)/m)
    const nameMatch = slice.match(/^\s+name:\s*(\S+)/m)
    let label = `Document ${docIdx + 1}`
    if (kindMatch?.[1]) {
      label = kindMatch[1]
      if (nameMatch?.[1]) label += ` / ${nameMatch[1]}`
    }
    segments.push({
      label,
      startLine: docStart + 1,
      endLine: endIdx,
    })
    docIdx++
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^---\s*$/) && i > 0) {
      finishDoc(i)
      docStart = i + 1
    }
  }
  // Final doc
  if (docStart < lines.length) {
    finishDoc(lines.length)
  }

  return segments
}

function fieldDefsToCompletions(
  fields: Record<string, K8sFieldDef>,
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number },
  monaco: MonacoInstance,
): Array<{
  label: string
  kind: number
  detail: string
  insertText: string
  insertTextRules?: number
  range: typeof range
}> {
  return Object.entries(fields).map(([name, def]) => ({
    label: name,
    kind: monaco.languages.CompletionItemKind.Field,
    detail: def.description,
    insertText: def.snippet ?? `${name}: `,
    insertTextRules: def.snippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    range,
  }))
}

export function YAMLEditor({ value, readOnly = false, onChange, onApply, onPreview }: YAMLEditorProps) {
  const [current, setCurrent] = useState(value)
  const editorRef = useRef<EditorInstance | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const dirty = current !== value
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorTabSize = useSettingsStore((s) => s.editorTabSize)
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap)
  const editorMinimap = useSettingsStore((s) => s.editorMinimap)

  // Multi-doc tabs
  const docSegments = useMemo(() => parseDocSegments(current), [current])
  const hasMultiDoc = docSegments.length > 1
  const [activeDocIdx, setActiveDocIdx] = useState(0)

  // Sync external value changes
  useEffect(() => {
    setCurrent(value)
  }, [value])

  // Run YAML validation markers
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    const diagnostics = validateTopLevelFields(current)
    const markers = diagnostics.map((d) => ({
      severity: monaco.MarkerSeverity.Warning,
      message: `Unknown top-level field "${d.field}" for this resource kind`,
      startLineNumber: d.line,
      endLineNumber: d.line,
      startColumn: 1,
      endColumn: d.field.length + 2,
    }))

    monaco.editor.setModelMarkers(model, 'k8s-validation', markers)
  }, [current])

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      monaco.editor.defineTheme('clusterfudge-dark', monacoTheme)
      monaco.editor.setTheme('clusterfudge-dark')

      // Cmd/Ctrl+S to apply
      if (!readOnly && onApply) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onApply(editor.getValue())
        })
      }

      // Register K8s autocomplete provider
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose()
      }
      completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('yaml', {
        triggerCharacters: ['\n', ' '],
        provideCompletionItems: (model: { getValueInRange: (range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => string; getValue: () => string; getLineContent: (lineNumber: number) => string }, position: { lineNumber: number; column: number }) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          const fullText = model.getValue()
          const kind = extractKind(fullText)

          const currentLine = model.getLineContent(position.lineNumber)
          const indent = currentLine.match(/^(\s*)/)?.[1]?.length ?? 0

          const range = {
            startLineNumber: position.lineNumber,
            startColumn: indent + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          }

          // Determine context: top-level, under metadata, under spec
          const linesBefore = textUntilPosition.split('\n')
          let context = 'top'
          // Walk backwards to find parent context
          for (let i = linesBefore.length - 2; i >= 0; i--) {
            const l = linesBefore[i]
            const lineIndent = l.match(/^(\s*)/)?.[1]?.length ?? 0
            if (lineIndent < indent) {
              if (l.match(/^metadata:/)) context = 'metadata'
              else if (l.match(/^spec:/)) context = 'spec'
              break
            }
          }

          let suggestions = [] as ReturnType<typeof fieldDefsToCompletions>

          if (indent === 0) {
            // Top-level suggestions
            suggestions = fieldDefsToCompletions(getTopLevelFields(kind), range, monaco)
          } else if (context === 'metadata') {
            suggestions = fieldDefsToCompletions(getMetadataFields(), range, monaco)
          } else if (context === 'spec' && kind) {
            suggestions = fieldDefsToCompletions(getSpecFields(kind), range, monaco)
          }

          return { suggestions }
        },
      })
    },
    [readOnly, onApply]
  )

  // Cleanup completion provider on unmount
  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose()
    }
  }, [])

  const handleChange = useCallback(
    (val: string | undefined) => {
      const v = val ?? ''
      setCurrent(v)
      onChange?.(v)
    },
    [onChange]
  )

  const handleRevert = useCallback(() => {
    editorRef.current?.setValue(value)
  }, [value])

  const handleApply = useCallback(() => {
    onApply?.(current)
  }, [onApply, current])

  const handlePreview = useCallback(() => {
    onPreview?.(current)
  }, [onPreview, current])

  const handleDocTabClick = useCallback((idx: number) => {
    setActiveDocIdx(idx)
    const editor = editorRef.current
    if (!editor) return
    const seg = parseDocSegments(editor.getValue())[idx]
    if (!seg) return
    editor.revealLineInCenter(seg.startLine)
    editor.setSelection({
      startLineNumber: seg.startLine,
      startColumn: 1,
      endLineNumber: seg.endLine,
      endColumn: 1,
    })
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-2">
            {dirty && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--yellow)',
                  background: 'var(--yellow-muted)',
                }}
              >
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRevert}
              disabled={!dirty}
              title={!dirty ? 'No changes to revert' : 'Revert changes'}
              className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
              }}
            >
              Revert
            </button>
            {onPreview && (
              <button
                onClick={handlePreview}
                disabled={!dirty}
                title={!dirty ? 'No changes to preview' : 'Preview changes (dry-run)'}
                className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-tertiary)',
                }}
              >
                Preview
              </button>
            )}
            <button
              onClick={handleApply}
              disabled={!dirty}
              title={!dirty ? 'No changes to apply' : 'Apply changes'}
              className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
              style={{
                color: dirty ? '#fff' : 'var(--text-tertiary)',
                background: dirty ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Multi-document tabs (#27) */}
      {hasMultiDoc && (
        <div
          className="flex items-center gap-0.5 px-2 py-1 border-b overflow-x-auto"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
          data-testid="multi-doc-tabs"
        >
          {docSegments.map((seg, idx) => (
            <button
              key={idx}
              onClick={() => handleDocTabClick(idx)}
              className="text-xs px-2 py-0.5 rounded transition-colors whitespace-nowrap"
              style={{
                color: idx === activeDocIdx ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: idx === activeDocIdx ? 'var(--bg-tertiary)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              data-testid={`doc-tab-${idx}`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          language="yaml"
          value={current}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            readOnly,
            minimap: { enabled: editorMinimap },
            fontSize: editorFontSize,
            fontFamily: 'var(--font-mono)',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: editorWordWrap ? 'on' : 'off',
            tabSize: editorTabSize,
            renderLineHighlight: 'line',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            contextmenu: false,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  )
}
