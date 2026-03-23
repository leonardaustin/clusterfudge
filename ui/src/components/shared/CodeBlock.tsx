import { useState, useEffect, useRef } from 'react'
import { codeToHtml } from 'shiki'

interface CodeBlockProps {
  code: string
  language?: 'yaml' | 'json'
  className?: string
}

const THEME = 'github-dark-default'

export function CodeBlock({ code, language = 'yaml', className = '' }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const codeRef = useRef(code)
  const langRef = useRef(language)

  useEffect(() => {
    codeRef.current = code
    langRef.current = language
    let cancelled = false

    codeToHtml(code, { lang: language, theme: THEME }).then((result) => {
      if (!cancelled) setHtml(result)
    })

    return () => { cancelled = true }
  }, [code, language])

  if (!html) {
    // Fallback while shiki loads
    return (
      <pre className={`text-xs text-text-secondary font-mono whitespace-pre-wrap break-all ${className}`}>
        {code}
      </pre>
    )
  }

  return (
    <div
      className={`shiki-code-block text-xs [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:!text-xs ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
