import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Search, Loader2 } from 'lucide-react'
import { useSettingsStore, type SettingsKey } from '@/stores/settingsStore'
import { Toggle } from '@/components/settings'
import { ValidateAIPath, FindAIPath } from '@/wailsjs/go/handlers/AIHandler'

interface ProviderConfig {
  id: string
  name: string
  description: string
  enabledKey: 'aiClaudeCodeEnabled' | 'aiGeminiCliEnabled' | 'aiChatgptCodexEnabled'
  pathKey: 'aiClaudeCodePath' | 'aiGeminiCliPath' | 'aiChatgptCodexPath'
}

const providers: ProviderConfig[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s CLI coding agent',
    enabledKey: 'aiClaudeCodeEnabled',
    pathKey: 'aiClaudeCodePath',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s command-line AI assistant',
    enabledKey: 'aiGeminiCliEnabled',
    pathKey: 'aiGeminiCliPath',
  },
  {
    id: 'codex',
    name: 'ChatGPT Codex',
    description: 'OpenAI\'s CLI coding agent',
    enabledKey: 'aiChatgptCodexEnabled',
    pathKey: 'aiChatgptCodexPath',
  },
]

export function AIProvidersSection() {
  const update = useSettingsStore((s) => s.update)

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">AI Assistants</h2>
      <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
        Clusterfudge can integrate with AI coding assistants installed on your machine.
        All processing happens locally through your own CLI tools — no data is sent to
        Clusterfudge infrastructure. You must have the tool installed and authenticated separately.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {providers.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} update={update} />
        ))}
      </div>
    </div>
  )
}

function ProviderRow({
  provider,
  update,
}: {
  provider: ProviderConfig
  update: (key: SettingsKey, value: boolean | string) => void
}) {
  const enabled = useSettingsStore((s) => s[provider.enabledKey])
  const path = useSettingsStore((s) => s[provider.pathKey])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [searching, setSearching] = useState(false)
  const [validated, setValidated] = useState(false)

  const validatePath = useCallback(async (p: string) => {
    if (!p) {
      setValidationError('Path is empty')
      setValidated(true)
      return
    }
    setValidating(true)
    try {
      const err = await ValidateAIPath(p)
      setValidationError(err || null)
      setValidated(true)
    } catch {
      setValidationError('Validation failed')
      setValidated(true)
    } finally {
      setValidating(false)
    }
  }, [])

  // Validate on mount and when path changes
  useEffect(() => {
    setValidated(false)
    const timer = setTimeout(() => validatePath(path), 300)
    return () => clearTimeout(timer)
  }, [path, validatePath])

  const handleAutoDetect = async () => {
    setSearching(true)
    try {
      const found = await FindAIPath(provider.id)
      if (found) {
        update(provider.pathKey, found)
      } else {
        setValidationError('Not found on this system')
        setValidated(true)
      }
    } catch {
      setValidationError('Search failed')
      setValidated(true)
    } finally {
      setSearching(false)
    }
  }

  const isValid = validated && !validationError
  const isInvalid = validated && !!validationError

  return (
    <div
      className="px-4 py-3 rounded-lg border border-border"
      style={{ opacity: enabled ? 1 : 0.7 }}
    >
      <div className="settings-row" style={{ borderBottom: 'none', paddingTop: 0 }}>
        <div>
          <div className="settings-label">{provider.name}</div>
          <div className="settings-description">{provider.description}</div>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => update(provider.enabledKey, v)}
        />
      </div>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <label
          className="settings-description"
          style={{ display: 'block', marginBottom: 'var(--space-1)' }}
          htmlFor={`ai-path-${provider.id}`}
        >
          Executable path
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              id={`ai-path-${provider.id}`}
              type="text"
              value={path}
              onChange={(e) => update(provider.pathKey, e.target.value)}
              className="settings-input"
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                paddingRight: '28px',
              }}
            />
            <div style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center',
            }}>
              {validating ? (
                <Loader2 className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
              ) : isValid ? (
                <span title="Executable found and valid">
                  <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--green, #22c55e)' }} />
                </span>
              ) : isInvalid ? (
                <span title={validationError ?? 'Invalid path'}>
                  <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--red, #ef4444)' }} />
                </span>
              ) : null}
            </div>
          </div>
          <button
            className="settings-btn"
            style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', whiteSpace: 'nowrap' }}
            onClick={handleAutoDetect}
            disabled={searching}
            title="Search common install locations for this tool"
          >
            {searching ? (
              <Loader2 className="w-3 h-3" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Search className="w-3 h-3" />
            )}
            Detect
          </button>
        </div>
        {isInvalid && enabled && (
          <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--red, #ef4444)' }}>
            {validationError}
          </div>
        )}
      </div>
    </div>
  )
}
