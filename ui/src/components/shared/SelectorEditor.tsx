import { useState, useCallback } from 'react'
import { PatchServiceSelector } from '../../wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '../../stores/toastStore'

interface SelectorEditorProps {
  namespace: string
  name: string
  selectors: { key: string; value: string }[]
  onUpdate?: () => void
}

/**
 * Inline selector editor for services with editable chips.
 * Similar to LabelEditor but patches spec.selector instead of metadata.labels.
 */
export function SelectorEditor({ namespace, name, selectors, onUpdate }: SelectorEditorProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [currentSelectors, setCurrentSelectors] = useState<{ key: string; value: string }[]>(selectors)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  const handleRemove = useCallback(async (selectorKey: string) => {
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const s of currentSelectors) {
        if (s.key !== selectorKey) {
          patch[s.key] = s.value
        }
      }
      // We need to explicitly null out the removed key for merge patch
      patch[selectorKey] = null
      await PatchServiceSelector(namespace, name, patch)
      setCurrentSelectors((prev) => prev.filter((s) => s.key !== selectorKey))
      addToast({ type: 'success', title: `Removed selector "${selectorKey}"` })
      onUpdate?.()
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to remove selector', description: String(err) })
    } finally {
      setSaving(false)
    }
  }, [currentSelectors, namespace, name, addToast, onUpdate])

  const handleAdd = useCallback(async () => {
    const trimmedKey = newKey.trim()
    const trimmedValue = newValue.trim()
    if (!trimmedKey) return

    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const s of currentSelectors) {
        patch[s.key] = s.value
      }
      patch[trimmedKey] = trimmedValue
      await PatchServiceSelector(namespace, name, patch)

      const existingIdx = currentSelectors.findIndex((s) => s.key === trimmedKey)
      if (existingIdx >= 0) {
        setCurrentSelectors((prev) => prev.map((s) => s.key === trimmedKey ? { key: trimmedKey, value: trimmedValue } : s))
      } else {
        setCurrentSelectors((prev) => [...prev, { key: trimmedKey, value: trimmedValue }])
      }
      setNewKey('')
      setNewValue('')
      setAdding(false)
      addToast({ type: 'success', title: `Added selector "${trimmedKey}"` })
      onUpdate?.()
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add selector', description: String(err) })
    } finally {
      setSaving(false)
    }
  }, [currentSelectors, newKey, newValue, namespace, name, addToast, onUpdate])

  return (
    <div style={{ marginTop: 'var(--space-3)' }} data-testid="selector-editor">
      <div className="prop-list">
        <span className="prop-group-title">Selector</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 'var(--space-2)', alignItems: 'center' }}>
        {currentSelectors.map((s) => (
          <span
            key={s.key}
            className="tag"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {s.key}={s.value}
            <button
              onClick={() => handleRemove(s.key)}
              disabled={saving}
              aria-label={`Remove selector ${s.key}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                padding: '0 2px',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-tertiary)',
                lineHeight: 1,
              }}
            >
              x
            </button>
          </span>
        ))}

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            disabled={saving}
            style={{
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            + Add selector
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: '4px', marginTop: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            aria-label="Selector key"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-primary)',
              width: '120px',
            }}
          />
          <input
            type="text"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            aria-label="Selector value"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-primary)',
              width: '120px',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newKey.trim()}
            style={{
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              fontSize: 'var(--text-2xs)',
              color: 'white',
              cursor: saving || !newKey.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !newKey.trim() ? 0.5 : 1,
            }}
          >
            Save
          </button>
          <button
            onClick={() => { setAdding(false); setNewKey(''); setNewValue('') }}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
