import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard API not available; silently degrade
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-bg-hover transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3 h-3 text-status-running" />
      ) : (
        <Copy className="w-3 h-3 text-text-tertiary" />
      )}
    </button>
  )
}
