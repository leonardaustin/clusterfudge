export const monacoThemeDark = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: '', foreground: 'e8eaed', background: '13151a' },
    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    { token: 'string', foreground: '34d399' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'keyword', foreground: '5b8def' },
    { token: 'type', foreground: 'a78bfa' },
  ],
  colors: {
    'editor.background': '#13151a',
    'editor.foreground': '#e8eaed',
    'editor.lineHighlightBackground': '#1a1d24',
    'editor.selectionBackground': '#5b8def33',
    'editorCursor.foreground': '#5b8def',
    'editorLineNumber.foreground': '#4a4f5a',
    'editorLineNumber.activeForeground': '#9ba1ad',
    'editor.selectionHighlightBackground': '#5b8def1a',
    'editorWidget.background': '#1a1d24',
    'editorWidget.border': '#2a2e38',
    'editorIndentGuide.background': '#2a2e38',
    'editorIndentGuide.activeBackground': '#3a3f4a',
  },
}

export const monacoThemeLight = {
  base: 'vs' as const,
  inherit: true,
  rules: [
    { token: '', foreground: '18181b', background: 'ffffff' },
    { token: 'comment', foreground: '6b6b73', fontStyle: 'italic' },
    { token: 'string', foreground: '15803d' },
    { token: 'number', foreground: 'b45309' },
    { token: 'keyword', foreground: '2563eb' },
    { token: 'type', foreground: '7c3aed' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#18181b',
    'editor.lineHighlightBackground': '#f3f4f6',
    'editor.selectionBackground': '#2563eb33',
    'editorCursor.foreground': '#2563eb',
    'editorLineNumber.foreground': '#a1a1aa',
    'editorLineNumber.activeForeground': '#52525b',
    'editor.selectionHighlightBackground': '#2563eb1a',
    'editorWidget.background': '#f9fafb',
    'editorWidget.border': '#e4e4e7',
    'editorIndentGuide.background': '#e4e4e7',
    'editorIndentGuide.activeBackground': '#c4c4cc',
  },
}

/** @deprecated Use monacoThemeDark instead */
export const monacoTheme = monacoThemeDark
