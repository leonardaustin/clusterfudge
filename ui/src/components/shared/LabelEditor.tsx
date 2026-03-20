import { useState, useCallback } from 'react'
import { PatchLabels } from '../../wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '../../stores/toastStore'

interface LabelEditorProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  labels: { key: string; value: string }[]
}

/**
 * Inline label editor with editable chips, remove (X) buttons, and an "Add label" form.
 * On save, calls PatchLabels to update the resource.
 */
export function LabelEditor({ group, version, resource, namespace, name, labels }: LabelEditorProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [currentLabels, setCurrentLabels] = useState<{ key: string; value: string }[]>(labels)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  const handleRemove = useCallback(async (labelKey: string) => {
    setSaving(true)
    try {
      // Build labels map with null for deleted keys
      const patch: Record<string, unknown> = {}
      for (const l of currentLabels) {
        if (l.key === labelKey) {
          patch[l.key] = null // null removes the label
        } else {
          patch[l.key] = l.value
        }
      }
      await PatchLabels(group, version, resource, namespace, name, patch)
      setCurrentLabels((prev) => prev.filter((l) => l.key !== labelKey))
      addToast({ type: 'success', title: `Removed label "${labelKey}"` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to remove label', description: String(err) })
    } finally {
      setSaving(false)
    }
  }, [currentLabels, group, version, resource, namespace, name, addToast])

  const handleAdd = useCallback(async () => {
    const trimmedKey = newKey.trim()
    const trimmedValue = newValue.trim()
    if (!trimmedKey) return

    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      for (const l of currentLabels) {
        patch[l.key] = l.value
      }
      patch[trimmedKey] = trimmedValue
      await PatchLabels(group, version, resource, namespace, name, patch)

      const existingIdx = currentLabels.findIndex((l) => l.key === trimmedKey)
      if (existingIdx >= 0) {
        setCurrentLabels((prev) => prev.map((l) => l.key === trimmedKey ? { key: trimmedKey, value: trimmedValue } : l))
      } else {
        setCurrentLabels((prev) => [...prev, { key: trimmedKey, value: trimmedValue }])
      }
      setNewKey('')
      setNewValue('')
      setAdding(false)
      addToast({ type: 'success', title: `Added label "${trimmedKey}"` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add label', description: String(err) })
    } finally {
      setSaving(false)
    }
  }, [currentLabels, newKey, newValue, group, version, resource, namespace, name, addToast])

  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <div className="prop-list">
        <span className="prop-group-title">Labels</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 'var(--space-2)', alignItems: 'center' }}>
        {currentLabels.map((l) => (
          <span
            key={l.key}
            className="tag"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {l.key}={l.value}
            <button
              onClick={() => handleRemove(l.key)}
              disabled={saving}
              aria-label={`Remove label ${l.key}`}
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
            + Add label
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
            aria-label="Label key"
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
            aria-label="Label value"
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
