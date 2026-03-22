/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary:  'var(--color-bg-tertiary)',
          hover:     'var(--color-bg-hover)',
          active:    'var(--color-bg-active)',
          overlay:   'var(--color-bg-overlay)',
        },
        text: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary:  'var(--color-text-tertiary)',
          inverse:   'var(--color-text-inverse)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong:  'var(--color-border-strong)',
          focus:   'var(--color-accent)',
        },
        accent: {
          DEFAULT:  'var(--color-accent)',
          hover:    'var(--color-accent-hover)',
          active:   'var(--color-accent-active)',
          muted:    'var(--color-accent-muted)',
          subtle:   'var(--color-accent-subtle)',
        },
        status: {
          running:    'var(--color-success)',
          pending:    'var(--color-warning)',
          error:      'var(--color-error)',
          terminated: 'var(--color-status-terminated)',
          info:       'var(--color-info)',
          paused:     'var(--color-status-paused)',
        },
        'status-bg': {
          running:    'var(--color-status-bg-running)',
          pending:    'var(--color-status-bg-pending)',
          error:      'var(--color-status-bg-error)',
          terminated: 'var(--color-status-bg-terminated)',
          info:       'var(--color-status-bg-info)',
          paused:     'var(--color-status-bg-paused)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.8125rem',{ lineHeight: '1.125rem' }],
        base: ['0.875rem', { lineHeight: '1.25rem' }],
        lg:   ['1rem',     { lineHeight: '1.5rem' }],
        xl:   ['1.125rem', { lineHeight: '1.75rem' }],
      },
      spacing: {
        sidebar:           '220px',
        'sidebar-collapsed': '48px',
        topbar:            '36px',
        'tray-handle':     '4px',
      },
      borderRadius: {
        sm:  '3px',
        DEFAULT: '4px',
        md:  '6px',
        lg:  '8px',
        xl:  '12px',
        full: '9999px',
      },
      animation: {
        'fade-in':         'fade-in 120ms ease-out',
        'fade-out':        'fade-out 80ms ease-in',
        'slide-in-down':   'slide-in-down 150ms ease-out',
        'slide-in-up':     'slide-in-up 150ms ease-out',
        'slide-in-left':   'slide-in-left 200ms ease-out',
        'scale-in':        'scale-in 100ms ease-out',
        'spin-slow':       'spin 2s linear infinite',
        'pulse-subtle':    'pulse-subtle 2s ease-in-out infinite',
        'blink':           'blink 1.2s step-start infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to:   { opacity: '0' },
        },
        'slide-in-down': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      transitionTimingFunction: {
        'linear-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        sm:      'var(--shadow-sm)',
        md:      'var(--shadow-md)',
        xl:      'var(--shadow-xl)',
        'popover': 'var(--shadow-popover)',
        'focus':   'var(--shadow-focus)',
        'panel':   'var(--shadow-panel)',
        'none':    'none',
      },
    },
  },
  plugins: [],
}
