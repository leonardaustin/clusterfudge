# Phase 2 — Project Setup & Foundation (COMPLETED)

> **Status: DONE** — Implemented in PR #9 (`phase2-project-setup` branch).
>
> Deliverables:
> - `wails.json`, `app.go`, `main.go` — Wails integration with all Phase 1 handlers wired
> - Frontend toolchain: pnpm, Vite v4, Tailwind CSS 3, Radix UI, ESLint, Prettier
> - Layout components: `AppShell`, `Sidebar`, `Topbar`, `BottomTray` with keyboard shortcuts and state persistence
> - `MemoryRouter` with all 37 page routes through `<Outlet />`
> - Inter + JetBrains Mono fonts bundled
> - All tests pass: `go test -race ./...` (9 packages), `pnpm tsc --noEmit`, `pnpm build`

## Goal

A running Wails app with a React/TypeScript frontend, the full build pipeline
working, and the foundational Go packages stubbed out. At the end of this phase
you can `wails dev` and see a styled window with the complete app shell — sidebar,
topbar, bottom tray — all working with keyboard shortcuts and state persistence.

---

## Prerequisites

Verify these are installed before starting:

```bash
# Go 1.22+
go version
# Expected: go version go1.22.x darwin/arm64

# Wails CLI
wails version
# Expected: Wails CLI v2.9.x

# pnpm
pnpm --version
# Expected: 9.x.x

# Node.js (LTS)
node --version
# Expected: v20.x.x or v22.x.x
```

Install any missing tools:

```bash
# Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# pnpm
npm install -g pnpm

# Verify Wails system dependencies (macOS)
wails doctor
# All checks should pass. If not, follow the remediation steps it prints.
```

---

## 2.1 — Project Initialization

### Scaffold the Wails project

Run these commands from the directory *above* where you want the project to live
(e.g., `~/src/github.com/leonardaustin/`):

```bash
# Scaffold with React + TypeScript template
wails init -n kubeviewer -t react-ts
# Expected output:
# Project 'kubeviewer' created successfully.

cd kubeviewer
```

### Initialize the Go module

The Wails scaffold uses the project name as the module path. Update it to the
canonical import path:

```bash
# Replace the default module path
go mod edit -module github.com/leonardaustin/kubeviewer

# Verify
head -1 go.mod
# Expected: module github.com/leonardaustin/kubeviewer
```

### Switch the frontend to pnpm

Wails defaults to npm. We use pnpm for disk efficiency and speed:

```bash
cd ui

# Remove npm artifacts
rm -f package-lock.json
rm -rf node_modules

# Install with pnpm
pnpm install
# Expected: Packages installed. ~1000 packages.

cd ..
```

### Pin Vite to v4 (required for Wails v2)

Wails v2's dev server proxy is incompatible with Vite v5+. Pin explicitly:

```bash
cd ui
pnpm add -D vite@^4.5.0
# Verify
pnpm list vite
# Expected: vite 4.5.x
cd ..
```

### Install all frontend dependencies

Run this single block from the `ui/` directory:

```bash
cd ui

# Styling
pnpm add -D tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10

# Radix UI primitives (accessible headless components)
pnpm add @radix-ui/react-dialog \
         @radix-ui/react-dropdown-menu \
         @radix-ui/react-tooltip \
         @radix-ui/react-popover \
         @radix-ui/react-scroll-area \
         @radix-ui/react-separator \
         @radix-ui/react-tabs \
         @radix-ui/react-context-menu \
         @radix-ui/react-collapsible

# State & routing
pnpm add zustand@^4 react-router-dom@^6

# Command palette
pnpm add cmdk@^0.2

# Table
pnpm add @tanstack/react-table@^8

# Animations
pnpm add framer-motion@^11

# Icons
pnpm add lucide-react@^0.400.0

# Utilities
pnpm add clsx@^2 tailwind-merge@^2 class-variance-authority@^0.7

cd ..
```

### Install Go dependencies

```bash
# Kubernetes client library
go get k8s.io/client-go@latest
go get k8s.io/apimachinery@latest
go get k8s.io/api@latest

# Dynamic client (for CRD support)
go get k8s.io/client-go/dynamic

# Helm SDK
go get helm.sh/helm/v3@latest

# Tidy and verify
go mod tidy
go mod verify
# Expected: all modules verified
```

### Post-scaffold cleanup

The default template ships with demo code. Remove it:

```bash
# Remove demo assets
rm -rf ui/src/assets

# Clear demo component files (we'll rewrite them)
> ui/src/App.tsx
> ui/src/App.css

# Remove default app.go Greet stub (we replace it entirely in section 2.5)
# (Just clear it for now; section 2.5 writes the full file)
```

---

## 2.2 — Complete Configuration Files

### `wails.json`

Located at the project root. Every field explained:

```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "KubeViewer",
  "outputfilename": "kubeviewer",
  "frontend:install": "pnpm install",
  "frontend:build": "pnpm run build",
  "frontend:dev:watcher": "pnpm run dev",
  "frontend:dev:serverUrl": "auto",
  "frontend:dir": "ui",
  "assetdir": "ui/dist",
  "reloaddirs": "ui/src",
  "debounceMS": 100,
  "version": "2",
  "info": {
    "productName": "KubeViewer",
    "productVersion": "0.1.0",
    "productIdentifier": "com.leonardaustin.kubeviewer",
    "copyright": "© 2024 Leonard Austin",
    "comments": "Kubernetes cluster viewer"
  },
  "author": {
    "name": "Leonard Austin",
    "email": "leonardaustin@users.noreply.github.com"
  }
}
```

### `ui/tsconfig.json`

Strict TypeScript with path aliases for clean imports:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Strict mode */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/layouts/*": ["./src/layouts/*"],
      "@/views/*": ["./src/views/*"],
      "@/stores/*": ["./src/stores/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/styles/*": ["./src/styles/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `ui/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

### `ui/vite.config.ts`

Path aliases must match tsconfig exactly. Wails v2 requires specific settings:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/layouts': path.resolve(__dirname, './src/layouts'),
      '@/views': path.resolve(__dirname, './src/views'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/styles': path.resolve(__dirname, './src/styles'),
      '@/lib': path.resolve(__dirname, './src/lib'),
    },
  },

  build: {
    // Output to the directory Wails expects
    outDir: 'dist',
    // Smaller chunks for faster initial load in the webview
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-tabs',
            '@radix-ui/react-collapsible',
          ],
          icons: ['lucide-react'],
        },
      },
    },
  },

  // Required for Wails v2 dev mode
  server: {
    strictPort: true,
  },
})
```

### `ui/.eslintrc.cjs`

```javascript
module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'wailsjs/'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['react-refresh', '@typescript-eslint', 'react', 'react-hooks'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    'react/prop-types': 'off', // TypeScript handles this
  },
}
```

Install ESLint dev dependencies:

```bash
cd ui
pnpm add -D eslint \
            @typescript-eslint/eslint-plugin \
            @typescript-eslint/parser \
            eslint-plugin-react \
            eslint-plugin-react-hooks \
            eslint-plugin-react-refresh
cd ..
```

### `ui/.prettierrc`

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### `ui/postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### `ui/tailwind.config.js`

Complete theme with all color tokens, all animations, all custom utilities:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Background surfaces ─────────────────────────────────────────
        bg: {
          primary:   '#0A0A0B', // Root background — the darkest layer
          secondary: '#111113', // Sidebar, panels — one step up
          tertiary:  '#1A1A1E', // Cards, dropdowns, popovers — elevated
          hover:     '#1F1F24', // Generic hover state
          active:    '#26262C', // Selected/pressed state
          overlay:   '#00000080', // Modal backdrop
        },

        // ── Typography ──────────────────────────────────────────────────
        text: {
          primary:   '#EDEDEF', // Body text, headings
          secondary: '#8B8B8E', // Labels, metadata, muted
          tertiary:  '#5C5C63', // Placeholders, disabled, hints
          inverse:   '#0A0A0B', // Text on light backgrounds
        },

        // ── Borders ─────────────────────────────────────────────────────
        border: {
          DEFAULT: '#26262C', // Subtle dividers
          strong:  '#3A3A42', // Emphasized borders, focus rings
          focus:   '#7C5CFC', // Focus indicator
        },

        // ── Accent (brand purple) ───────────────────────────────────────
        accent: {
          DEFAULT:  '#7C5CFC',
          hover:    '#8E72FF',
          active:   '#6A4EE8',
          muted:    '#7C5CFC1A', // 10% opacity — subtle highlights
          subtle:   '#7C5CFC0D', // 5% opacity — very subtle
        },

        // ── Status colors ───────────────────────────────────────────────
        status: {
          running:    '#4ADE80', // Healthy, Running, Active
          pending:    '#FBBF24', // Pending, Warning, Unknown
          error:      '#F87171', // Error, Failed, CrashLoopBackOff
          terminated: '#6B7280', // Terminated, Completed, Succeeded
          info:       '#60A5FA', // Informational, Info events
          paused:     '#A78BFA', // Paused, Suspended
        },

        // ── Status backgrounds (10% opacity of status colors) ───────────
        'status-bg': {
          running:    '#4ADE8019',
          pending:    '#FBBF2419',
          error:      '#F8717119',
          terminated: '#6B728019',
          info:       '#60A5FA19',
          paused:     '#A78BFA19',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px / 14px — resource counts, badges
        xs:   ['0.75rem',  { lineHeight: '1rem' }],      // 12px — metadata
        sm:   ['0.8125rem',{ lineHeight: '1.125rem' }],  // 13px — UI labels (Linear's body size)
        base: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px — default body
        lg:   ['1rem',     { lineHeight: '1.5rem' }],    // 16px — section headings
        xl:   ['1.125rem', { lineHeight: '1.75rem' }],   // 18px — page titles
      },

      spacing: {
        // Sidebar widths
        sidebar:           '220px',
        'sidebar-collapsed': '48px',
        // Topbar
        topbar:            '36px',
        // Bottom tray handle
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
        // Entry animations (Linear-style: fast, subtle)
        'fade-in':         'fade-in 120ms ease-out',
        'fade-out':        'fade-out 80ms ease-in',
        'slide-in-down':   'slide-in-down 150ms ease-out',
        'slide-in-up':     'slide-in-up 150ms ease-out',
        'slide-in-left':   'slide-in-left 200ms ease-out',
        'scale-in':        'scale-in 100ms ease-out',
        // Loading
        'spin-slow':       'spin 2s linear infinite',
        'pulse-subtle':    'pulse-subtle 2s ease-in-out infinite',
        // Status indicators
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
        // Dropdown / popover shadow
        'popover': '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
        // Focused element glow
        'focus':   '0 0 0 2px #7C5CFC40',
        // Panel elevation
        'panel':   '0 2px 8px rgba(0,0,0,0.3)',
        // None (explicit reset)
        'none':    'none',
      },
    },
  },
  plugins: [],
}
```

### `ui/index.html`

No-scroll body, font preloading, correct meta tags:

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0A0A0B" />
    <!-- Disable text selection on UI chrome (re-enabled per-component as needed) -->
    <style>
      html, body {
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
      }
    </style>
    <!-- Preload Inter variable font to prevent FOUT -->
    <link
      rel="preload"
      href="/fonts/Inter.var.woff2"
      as="font"
      type="font/woff2"
      crossorigin="anonymous"
    />
    <link
      rel="preload"
      href="/fonts/JetBrainsMono.woff2"
      as="font"
      type="font/woff2"
      crossorigin="anonymous"
    />
    <title>KubeViewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 2.3 — Font Strategy

This is a desktop app that runs offline. Never use Google Fonts CDN — bundle the
fonts directly.

### Download fonts

```bash
# Create the fonts directory inside the public folder
mkdir -p ui/public/fonts

# Download Inter variable font (single file covers all weights)
# Source: https://github.com/rsms/inter/releases
# Download the woff2 variable font from the latest release:
curl -L "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" -o /tmp/inter.zip
unzip /tmp/inter.zip -d /tmp/inter
cp /tmp/inter/extras/ttf/Inter.var.ttf ui/public/fonts/
# Convert to woff2 (use fonttools if available, or use an online converter)
# Alternatively download the woff2 directly from the release assets

# Download JetBrains Mono
# Source: https://www.jetbrains.com/lp/mono/
curl -L "https://download.jetbrains.com/fonts/JetBrainsMono-2.304.zip" -o /tmp/jbmono.zip
unzip /tmp/jbmono.zip -d /tmp/jbmono
cp /tmp/jbmono/fonts/webfonts/JetBrainsMono-Regular.woff2 \
   ui/public/fonts/JetBrainsMono.woff2
```

> **Quickstart alternative**: Install `fonttools` via pip and run
> `python3 -m fonttools.ttLib.woff2 compress Inter.var.ttf` to produce
> `Inter.var.woff2`. Or grab pre-built woff2 files from
> [fontsource](https://fontsource.org).

### `ui/src/styles/globals.css`

Font declarations, base resets, Tailwind directives, and custom utilities:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Bundled fonts ─────────────────────────────────────────────────────── */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter.var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: block; /* Block briefly to avoid FOUT in webview */
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/JetBrainsMono.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}

/* ── Base layer ────────────────────────────────────────────────────────── */
@layer base {
  html {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    /* OpenType features that Linear uses for sharper Inter rendering */
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-size: 14px; /* Base for our rem scale */
  }

  body {
    @apply bg-bg-primary text-text-primary;
    overflow: hidden; /* Desktop app — no body scroll, ever */
  }

  /* Text inputs are selectable */
  input,
  textarea,
  [contenteditable] {
    user-select: text;
    -webkit-user-select: text;
  }

  /* Custom scrollbar — minimal, Linear-style */
  ::-webkit-scrollbar        { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track  { background: transparent; }
  ::-webkit-scrollbar-thumb  { @apply bg-border rounded-full; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-border-strong; }

  /* Remove default focus outline; we use box-shadow instead */
  *:focus                   { outline: none; }
  *:focus-visible           { @apply ring-1 ring-accent; }
}

/* ── Component layer ───────────────────────────────────────────────────── */
@layer components {
  /* Wails window drag region — apply to elements the user can drag to move the window */
  .drag-region {
    -webkit-app-region: drag;
    app-region: drag;
  }

  /* Wails no-drag — buttons/interactive elements inside a drag region */
  .no-drag {
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  /* Status dot */
  .status-dot {
    @apply inline-block w-1.5 h-1.5 rounded-full flex-shrink-0;
  }
  .status-dot-running    { @apply bg-status-running; }
  .status-dot-pending    { @apply bg-status-pending; }
  .status-dot-error      { @apply bg-status-error; }
  .status-dot-terminated { @apply bg-status-terminated; }

  /* Sidebar item */
  .nav-item {
    @apply flex items-center gap-2 px-2 py-1 rounded text-sm text-text-secondary
           hover:text-text-primary hover:bg-bg-hover transition-colors cursor-default
           select-none;
  }
  .nav-item-active {
    @apply text-text-primary bg-bg-active;
  }

  /* Badge */
  .badge {
    @apply inline-flex items-center justify-center px-1.5 py-px rounded-full
           text-2xs font-medium bg-bg-tertiary text-text-tertiary;
  }
}

/* ── Utilities layer ───────────────────────────────────────────────────── */
@layer utilities {
  .text-balance { text-wrap: balance; }

  /* Truncate with ellipsis */
  .truncate-fade {
    -webkit-mask-image: linear-gradient(to right, black 80%, transparent 100%);
    mask-image: linear-gradient(to right, black 80%, transparent 100%);
  }
}
```

---

## 2.4 — Directory Structure Creation Script

Run this once from the project root to create all directories and empty package stubs:

```bash
#!/usr/bin/env bash
# scripts/scaffold.sh
# Run from project root: bash scripts/scaffold.sh
set -euo pipefail

echo "Creating Go package structure..."

# Internal packages
mkdir -p internal/k8s
mkdir -p internal/cluster
mkdir -p internal/resource
mkdir -p internal/stream
mkdir -p internal/helm
mkdir -p internal/config

# Handler layer
mkdir -p handlers

# Write package stubs
echo 'package k8s'       > internal/k8s/client.go
echo 'package k8s'       > internal/k8s/discovery.go
echo 'package cluster'   > internal/cluster/manager.go
echo 'package cluster'   > internal/cluster/kubeconfig.go
echo 'package resource'  > internal/resource/service.go
echo 'package resource'  > internal/resource/watcher.go
echo 'package resource'  > internal/resource/types.go
echo 'package stream'    > internal/stream/logs.go
echo 'package stream'    > internal/stream/events.go
echo 'package stream'    > internal/stream/exec.go
echo 'package helm'      > internal/helm/client.go
echo 'package helm'      > internal/helm/releases.go
echo 'package config'    > internal/config/store.go
echo 'package handlers'  > handlers/cluster_handler.go
echo 'package handlers'  > handlers/resource_handler.go
echo 'package handlers'  > handlers/stream_handler.go
echo 'package handlers'  > handlers/helm_handler.go
echo 'package handlers'  > handlers/config_handler.go

echo "Creating frontend structure..."

# Source directories
mkdir -p ui/src/components/ui
mkdir -p ui/src/components/command-palette
mkdir -p ui/src/components/table
mkdir -p ui/src/layouts
mkdir -p ui/src/views
mkdir -p ui/src/stores
mkdir -p ui/src/hooks
mkdir -p ui/src/styles
mkdir -p ui/src/lib

# Font directory
mkdir -p ui/public/fonts

# Create placeholder files (prevent empty-directory lint warnings)
touch ui/src/components/ui/.gitkeep
touch ui/src/views/.gitkeep

# Tailwind init (if not done yet)
if [ ! -f ui/tailwind.config.js ]; then
  cd ui && npx tailwindcss init -p && cd ..
  echo "Tailwind config created."
fi

echo "✓ Scaffold complete."
```

Make it executable and run it:

```bash
mkdir -p scripts
# (paste the above into scripts/scaffold.sh)
chmod +x scripts/scaffold.sh
bash scripts/scaffold.sh
```

---

## 2.5 — Complete Frontend Components

### `ui/src/lib/utils.ts`

The `cn` helper used everywhere to merge Tailwind classes:

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### `ui/src/main.tsx`

App entry point with MemoryRouter (required for Wails — no real URL bar):

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/layouts/AppShell'
import ClusterOverview from '@/views/ClusterOverview'
import '@/styles/globals.css'

// Placeholder view for routes not yet implemented
function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
      {name} — coming in Phase 3
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<ClusterOverview />} />
          <Route path="pods"         element={<ComingSoon name="Pods" />} />
          <Route path="deployments"  element={<ComingSoon name="Deployments" />} />
          <Route path="statefulsets" element={<ComingSoon name="StatefulSets" />} />
          <Route path="daemonsets"   element={<ComingSoon name="DaemonSets" />} />
          <Route path="replicasets"  element={<ComingSoon name="ReplicaSets" />} />
          <Route path="jobs"         element={<ComingSoon name="Jobs" />} />
          <Route path="cronjobs"     element={<ComingSoon name="CronJobs" />} />
          <Route path="services"     element={<ComingSoon name="Services" />} />
          <Route path="ingresses"    element={<ComingSoon name="Ingresses" />} />
          <Route path="configmaps"   element={<ComingSoon name="ConfigMaps" />} />
          <Route path="secrets"      element={<ComingSoon name="Secrets" />} />
          <Route path="pvcs"         element={<ComingSoon name="PersistentVolumeClaims" />} />
          <Route path="pvs"          element={<ComingSoon name="PersistentVolumes" />} />
          <Route path="helm"         element={<ComingSoon name="Helm Releases" />} />
          <Route path="settings"     element={<ComingSoon name="Settings" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </React.StrictMode>
)
```

### `ui/src/layouts/AppShell.tsx`

Root layout component — manages sidebar collapse, bottom tray, and keyboard shortcuts:

```typescript
import React, { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import BottomTray, { type TrayTab } from './BottomTray'

// ── Constants ───────────────────────────────────────────────────────────────
const SIDEBAR_COLLAPSED_KEY = 'kubeviewer:sidebar:collapsed'
const TRAY_HEIGHT_KEY = 'kubeviewer:tray:height'
const TRAY_OPEN_KEY = 'kubeviewer:tray:open'
const TRAY_TAB_KEY = 'kubeviewer:tray:tab'

const SIDEBAR_WIDTH = 220
const SIDEBAR_COLLAPSED_WIDTH = 48
const MIN_TRAY_HEIGHT = 120
const MAX_TRAY_HEIGHT = 480
const DEFAULT_TRAY_HEIGHT = 220

// ── Error boundary ──────────────────────────────────────────────────────────
interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
          <p className="text-status-error font-medium text-sm">Something went wrong</p>
          <pre className="text-xs font-mono bg-bg-tertiary text-text-secondary p-4 rounded-md
                          border border-border max-w-xl overflow-auto">
            {this.state.error.message}
          </pre>
          <button
            className="text-xs text-accent hover:text-accent-hover"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── AppShell ────────────────────────────────────────────────────────────────
export default function AppShell() {
  // Sidebar state — persisted
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })

  // Bottom tray state — persisted
  const [trayOpen, setTrayOpen] = useState<boolean>(() => {
    return localStorage.getItem(TRAY_OPEN_KEY) === 'true'
  })
  const [trayHeight, setTrayHeight] = useState<number>(() => {
    const saved = localStorage.getItem(TRAY_HEIGHT_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_TRAY_HEIGHT
  })
  const [trayTab, setTrayTab] = useState<TrayTab>(() => {
    return (localStorage.getItem(TRAY_TAB_KEY) as TrayTab | null) ?? 'logs'
  })

  // Drag state refs (not state — no re-render on drag move)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(TRAY_OPEN_KEY, String(trayOpen))
  }, [trayOpen])

  useEffect(() => {
    localStorage.setItem(TRAY_HEIGHT_KEY, String(trayHeight))
  }, [trayHeight])

  useEffect(() => {
    localStorage.setItem(TRAY_TAB_KEY, trayTab)
  }, [trayTab])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable

      // [ — toggle sidebar
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInput) {
        setSidebarCollapsed((c) => !c)
      }

      // Ctrl+` — toggle tray
      if (e.key === '`' && e.ctrlKey) {
        e.preventDefault()
        setTrayOpen((o) => !o)
      }

      // Ctrl+1/2/3 — switch tray tab
      if (e.ctrlKey && trayOpen) {
        if (e.key === '1') { e.preventDefault(); setTrayTab('logs') }
        if (e.key === '2') { e.preventDefault(); setTrayTab('terminal') }
        if (e.key === '3') { e.preventDefault(); setTrayTab('events') }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [trayOpen])

  // ── Tray resize ───────────────────────────────────────────────────────────
  const handleTrayDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartHeight.current = trayHeight

    const onMouseMove = (me: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartY.current - me.clientY
      const next = Math.round(
        Math.min(MAX_TRAY_HEIGHT, Math.max(MIN_TRAY_HEIGHT, dragStartHeight.current + delta))
      )
      setTrayHeight(next)
    }

    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [trayHeight])

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Topbar — full width, fixed height */}
      <Topbar sidebarWidth={sidebarWidth} />

      {/* Body: sidebar + content column */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />

        {/* Content column: main area + bottom tray */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Main scrollable content */}
          <main className="flex-1 overflow-auto min-h-0">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>

          {/* Bottom tray (conditionally rendered) */}
          {trayOpen && (
            <BottomTray
              height={trayHeight}
              activeTab={trayTab}
              onTabChange={setTrayTab}
              onClose={() => setTrayOpen(false)}
              onDragStart={handleTrayDragStart}
            />
          )}
        </div>
      </div>

      {/* Status bar — always visible at the very bottom */}
      <div className="flex items-center h-6 px-3 border-t border-border bg-bg-secondary
                      text-2xs text-text-tertiary flex-shrink-0">
        {!trayOpen && (
          <button
            onClick={() => setTrayOpen(true)}
            className="hover:text-text-secondary transition-colors no-drag"
          >
            Logs · Terminal · Events
          </button>
        )}
        <span className="ml-auto font-mono opacity-50">Ctrl+`</span>
      </div>
    </div>
  )
}
```

### `ui/src/layouts/Sidebar.tsx`

Complete sidebar with all navigation sections, collapsible groups, and cluster selector:

```typescript
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Box,
  Layers,
  GitBranch,
  Database,
  Server,
  Briefcase,
  Clock,
  Network,
  Globe,
  Plug,
  ShieldAlert,
  FileText,
  Lock,
  BarChart2,
  TrendingUp,
  HardDrive,
  Cylinder,
  PackageOpen,
  UserCheck,
  Shield,
  Users,
  Puzzle,
  Star,
  Settings,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  ChevronsUpDown,
} from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
}

interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

// ── Navigation structure ─────────────────────────────────────────────────────
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { label: 'Cluster Overview', path: '/', icon: LayoutDashboard },
    ],
  },
  {
    id: 'workloads',
    label: 'Workloads',
    items: [
      { label: 'Pods',         path: '/pods',         icon: Box },
      { label: 'Deployments',  path: '/deployments',  icon: Layers },
      { label: 'StatefulSets', path: '/statefulsets', icon: Database },
      { label: 'DaemonSets',   path: '/daemonsets',   icon: Server },
      { label: 'ReplicaSets',  path: '/replicasets',  icon: GitBranch },
      { label: 'Jobs',         path: '/jobs',         icon: Briefcase },
      { label: 'CronJobs',     path: '/cronjobs',     icon: Clock },
    ],
  },
  {
    id: 'networking',
    label: 'Networking',
    items: [
      { label: 'Services', path: '/services', icon: Network },
      { label: 'Ingresses', path: '/ingresses', icon: Globe },
      { label: 'Endpoints', path: '/endpoints', icon: Plug },
      { label: 'Network Policies', path: '/netpolicies', icon: ShieldAlert },
    ],
  },
  {
    id: 'config',
    label: 'Config & Secrets',
    items: [
      { label: 'ConfigMaps',       path: '/configmaps', icon: FileText },
      { label: 'Secrets',          path: '/secrets',    icon: Lock },
      { label: 'Resource Quotas',  path: '/quotas',     icon: BarChart2 },
      { label: 'HPAs',             path: '/hpas',       icon: TrendingUp },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    items: [
      { label: 'PersistentVolumeClaims', path: '/pvcs', icon: HardDrive },
      { label: 'PersistentVolumes',      path: '/pvs',  icon: Cylinder },
      { label: 'Storage Classes',        path: '/storageclasses', icon: Cylinder },
    ],
  },
  {
    id: 'access',
    label: 'Access Control',
    items: [
      { label: 'Service Accounts', path: '/serviceaccounts', icon: UserCheck },
      { label: 'Roles',            path: '/roles',            icon: Shield },
      { label: 'Cluster Roles',    path: '/clusterroles',     icon: Shield },
      { label: 'Role Bindings',    path: '/rolebindings',     icon: Users },
    ],
  },
  {
    id: 'helm',
    label: 'Helm',
    items: [
      { label: 'Releases', path: '/helm',   icon: PackageOpen },
    ],
  },
  {
    id: 'custom',
    label: 'Custom Resources',
    items: [
      { label: 'Custom Resources', path: '/crds', icon: Puzzle },
    ],
  },
]

// Mock cluster list — replaced by real data in Phase 3
const MOCK_CLUSTERS = [
  { name: 'prod-us-east', color: '#F87171' },
  { name: 'staging',      color: '#FBBF24' },
  { name: 'local-kind',   color: '#4ADE80' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function NavItemButton({
  item,
  collapsed,
  active,
  onClick,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon

  const button = (
    <button
      onClick={onClick}
      className={cn(
        'nav-item w-full relative group',
        active && 'nav-item-active',
        collapsed && 'justify-center px-0'
      )}
    >
      {/* Active indicator bar */}
      {active && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r-full" />
      )}

      <Icon className={cn('flex-shrink-0 w-4 h-4', active ? 'text-accent' : 'text-text-tertiary')} />

      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{item.label}</span>
          {item.count !== undefined && (
            <span className="badge ml-auto">{item.count}</span>
          )}
        </>
      )}
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border
                     border-border shadow-popover animate-fade-in z-50"
        >
          {item.label}
          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function SectionGroup({
  section,
  collapsed,
  activePath,
  onNavigate,
}: {
  section: NavSection
  collapsed: boolean
  activePath: string
  onNavigate: (path: string) => void
}) {
  const storageKey = `kubeviewer:nav:section:${section.id}`
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey)
    return saved !== null ? saved === 'true' : true // default open
  })

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    localStorage.setItem(storageKey, String(next))
  }

  if (collapsed) {
    // In icon-only mode, show all items without section headers
    return (
      <div className="flex flex-col gap-px py-1">
        {section.items.map((item) => (
          <NavItemButton
            key={item.path}
            item={item}
            collapsed={collapsed}
            active={activePath === item.path}
            onClick={() => onNavigate(item.path)}
          />
        ))}
      </div>
    )
  }

  return (
    <Collapsible.Root open={open} onOpenChange={handleOpenChange}>
      <Collapsible.Trigger asChild>
        <button className="flex items-center w-full px-2 py-1 text-2xs font-semibold
                           text-text-tertiary uppercase tracking-wider hover:text-text-secondary
                           transition-colors group">
          <span className="flex-1 text-left">{section.label}</span>
          <ChevronRight
            className={cn(
              'w-3 h-3 transition-transform duration-150',
              open && 'rotate-90'
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-slide-in-up
                                      data-[state=open]:animate-fade-in">
        <div className="flex flex-col gap-px pb-1">
          {section.items.map((item) => (
            <NavItemButton
              key={item.path}
              item={item}
              collapsed={collapsed}
              active={activePath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────
export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [clusterOpen, setClusterOpen] = useState(false)
  const [activeCluster, setActiveCluster] = useState(MOCK_CLUSTERS[0]!)

  const width = collapsed ? 48 : 220

  return (
    <Tooltip.Provider>
      <aside
        style={{ width, minWidth: width }}
        className="flex flex-col h-full bg-bg-secondary border-r border-border
                   transition-[width] duration-200 ease-out overflow-hidden flex-shrink-0"
      >
        {/* ── Cluster selector ───────────────────────────────────────── */}
        <div className={cn('relative border-b border-border', collapsed ? 'p-1' : 'p-2')}>
          <button
            onClick={() => setClusterOpen((o) => !o)}
            className={cn(
              'flex items-center w-full rounded hover:bg-bg-hover transition-colors',
              collapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5'
            )}
          >
            {/* Cluster color dot */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeCluster.color }}
            />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm font-medium text-text-primary truncate">
                  {activeCluster.name}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-text-tertiary" />
              </>
            )}
          </button>

          {/* Dropdown */}
          {clusterOpen && !collapsed && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-bg-tertiary border
                            border-border rounded-md shadow-popover overflow-hidden animate-scale-in">
              {MOCK_CLUSTERS.map((cluster) => (
                <button
                  key={cluster.name}
                  onClick={() => { setActiveCluster(cluster); setClusterOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-bg-hover
                             transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <span className="flex-1 text-left text-text-primary">{cluster.name}</span>
                  {cluster.name === activeCluster.name && (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1">
          {/* Favorites section */}
          {!collapsed && (
            <div className="px-1 py-1">
              <button className="flex items-center gap-2 w-full px-2 py-1 text-2xs font-semibold
                                 text-text-tertiary uppercase tracking-wider hover:text-text-secondary">
                <Star className="w-3 h-3" />
                <span>Favorites</span>
              </button>
              <p className="text-2xs text-text-tertiary px-2 py-1 italic">
                Pin resources with ⌘D
              </p>
            </div>
          )}

          {/* All sections */}
          {NAV_SECTIONS.map((section) => (
            <SectionGroup
              key={section.id}
              section={section}
              collapsed={collapsed}
              activePath={location.pathname}
              onNavigate={(path) => navigate(path)}
            />
          ))}
        </div>

        {/* ── Bottom: settings + collapse toggle ─────────────────────── */}
        <div className="border-t border-border p-1 flex flex-col gap-px">
          <NavItemButton
            item={{ label: 'Settings', path: '/settings', icon: Settings }}
            collapsed={collapsed}
            active={location.pathname === '/settings'}
            onClick={() => navigate('/settings')}
          />
          <button
            onClick={onToggle}
            className={cn(
              'nav-item w-full',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 text-text-tertiary" />
              : <PanelLeftClose className="w-4 h-4 text-text-tertiary" />
            }
            {!collapsed && (
              <span className="flex-1 text-left">Collapse</span>
            )}
            {!collapsed && (
              <kbd className="text-2xs font-mono text-text-tertiary bg-bg-tertiary
                              px-1 rounded border border-border">
                [
              </kbd>
            )}
          </button>
        </div>
      </aside>
    </Tooltip.Provider>
  )
}
```

### `ui/src/layouts/Topbar.tsx`

macOS-compatible frameless topbar with drag region, breadcrumbs, and namespace filter:

```typescript
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, ChevronRight, X, Minus, Maximize2 } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

// ── Route → label mapping ────────────────────────────────────────────────────
const ROUTE_LABELS: Record<string, string> = {
  '/':              'Cluster Overview',
  '/pods':          'Pods',
  '/deployments':   'Deployments',
  '/statefulsets':  'StatefulSets',
  '/daemonsets':    'DaemonSets',
  '/replicasets':   'ReplicaSets',
  '/jobs':          'Jobs',
  '/cronjobs':      'CronJobs',
  '/services':      'Services',
  '/ingresses':     'Ingresses',
  '/configmaps':    'ConfigMaps',
  '/secrets':       'Secrets',
  '/pvcs':          'PersistentVolumeClaims',
  '/pvs':           'PersistentVolumes',
  '/helm':          'Helm Releases',
  '/settings':      'Settings',
}

// Mock namespaces — replaced by real data in Phase 3
const NAMESPACES = [
  'All Namespaces',
  'default',
  'kube-system',
  'kube-public',
  'monitoring',
  'ingress-nginx',
  'cert-manager',
]

// ── macOS window controls ─────────────────────────────────────────────────────
// Only shown when running in a frameless Wails window on macOS
declare const window: Window & {
  runtime?: {
    WindowMinimise: () => void
    WindowMaximise: () => void
    Quit: () => void
  }
}

function WindowControls() {
  // Only render on macOS (Wails sets a CSS class or we can detect via the runtime)
  const isMac = navigator.platform.startsWith('Mac')
  if (!isMac) return null

  return (
    <div className="flex items-center gap-1.5 ml-2 mr-3 no-drag flex-shrink-0">
      <button
        onClick={() => window.runtime?.Quit()}
        className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF3B2F] transition-colors"
        title="Close"
      />
      <button
        onClick={() => window.runtime?.WindowMinimise()}
        className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#E0A520] transition-colors"
        title="Minimize"
      />
      <button
        onClick={() => window.runtime?.WindowMaximise()}
        className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#1DA832] transition-colors"
        title="Maximize"
      />
    </div>
  )
}

// ── Namespace selector ────────────────────────────────────────────────────────
function NamespaceSelector() {
  const [selected, setSelected] = useState('All Namespaces')
  const [search, setSearch] = useState('')

  const filtered = NAMESPACES.filter((ns) =>
    ns.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DropdownMenu.Root onOpenChange={() => setSearch('')}>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded
                           border border-border hover:border-border-strong text-text-secondary
                           hover:text-text-primary bg-bg-tertiary transition-colors no-drag">
          <span>{selected}</span>
          <ChevronRight className="w-3 h-3 opacity-50 rotate-90" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="w-52 bg-bg-tertiary border border-border rounded-md shadow-popover
                     z-50 overflow-hidden animate-scale-in"
        >
          {/* Search */}
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 bg-bg-secondary rounded">
              <Search className="w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Filter namespaces…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary
                           outline-none"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>
          </div>

          {/* Items */}
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-3">No namespaces found</p>
            ) : (
              filtered.map((ns) => (
                <DropdownMenu.Item
                  key={ns}
                  onSelect={() => setSelected(ns)}
                  className={cn(
                    'flex items-center px-2 py-1.5 text-xs rounded cursor-default',
                    'hover:bg-bg-hover outline-none transition-colors',
                    selected === ns ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {ns}
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb() {
  const location = useLocation()
  const label = ROUTE_LABELS[location.pathname] ?? location.pathname.replace('/', '')

  return (
    <div className="flex items-center gap-1.5 text-sm min-w-0">
      <span className="text-text-tertiary flex-shrink-0">KubeViewer</span>
      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
      <span className="text-text-primary font-medium truncate">{label}</span>
    </div>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────
export default function Topbar({ sidebarWidth }: { sidebarWidth: number }) {
  return (
    <header
      className="flex items-center h-9 border-b border-border bg-bg-secondary flex-shrink-0
                 drag-region"
      style={{ paddingLeft: sidebarWidth }}
    >
      {/* macOS window controls (positioned absolutely on the left) */}
      <div
        className="absolute left-0 top-0 h-9 flex items-center"
        style={{ width: sidebarWidth }}
      >
        <WindowControls />
      </div>

      {/* Breadcrumb — fills available space */}
      <div className="flex-1 min-w-0 px-4 no-drag">
        <Breadcrumb />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 px-3 no-drag flex-shrink-0">
        {/* Namespace filter */}
        <NamespaceSelector />

        {/* Command palette trigger */}
        <button
          className="flex items-center gap-2 px-2.5 py-1 text-xs rounded border border-border
                     text-text-tertiary hover:text-text-secondary hover:border-border-strong
                     bg-bg-tertiary transition-colors"
          title="Open command palette (⌘K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search…</span>
          <kbd className="font-mono text-2xs bg-bg-hover px-1 rounded">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
```

### `ui/src/layouts/BottomTray.tsx`

Drag-to-resize tray with tab bar and content areas:

```typescript
import { useRef } from 'react'
import { Terminal, ScrollText, AlertCircle, X, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TrayTab = 'logs' | 'terminal' | 'events'

interface TrayTabDef {
  id: TrayTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  shortcut: string
}

const TABS: TrayTabDef[] = [
  { id: 'logs',     label: 'Logs',     icon: ScrollText,  shortcut: '⌃1' },
  { id: 'terminal', label: 'Terminal', icon: Terminal,    shortcut: '⌃2' },
  { id: 'events',   label: 'Events',   icon: AlertCircle, shortcut: '⌃3' },
]

// ── Tab content placeholders (replaced in Phase 5/6) ─────────────────────────
function LogsTab() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
      <ScrollText className="w-4 h-4" />
      <span>Select a pod to stream logs</span>
    </div>
  )
}

function TerminalTab() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
      <Terminal className="w-4 h-4" />
      <span>Select a container and click "Exec Shell"</span>
    </div>
  )
}

function EventsTab() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
      <AlertCircle className="w-4 h-4" />
      <span>Cluster events will appear here</span>
    </div>
  )
}

// ── BottomTray ────────────────────────────────────────────────────────────────
interface BottomTrayProps {
  height: number
  activeTab: TrayTab
  onTabChange: (tab: TrayTab) => void
  onClose: () => void
  onDragStart: (e: React.MouseEvent) => void
}

export default function BottomTray({
  height,
  activeTab,
  onTabChange,
  onClose,
  onDragStart,
}: BottomTrayProps) {
  const tabBarRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="flex flex-col border-t border-border bg-bg-secondary flex-shrink-0"
      style={{ height }}
    >
      {/* ── Resize handle ──────────────────────────────────────────────── */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-center h-1 cursor-ns-resize hover:bg-accent
                   transition-colors group flex-shrink-0"
        title="Drag to resize"
      >
        <GripHorizontal className="w-3 h-3 text-border group-hover:text-accent-hover opacity-0
                                   group-hover:opacity-100 transition-opacity" />
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div
        ref={tabBarRef}
        className="flex items-center border-b border-border px-2 gap-1 flex-shrink-0 h-8"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 h-full text-xs transition-colors relative',
                active
                  ? 'text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              {/* Active underline indicator */}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />
              )}
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <kbd className="font-mono text-2xs opacity-40">{tab.shortcut}</kbd>
            </button>
          )
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-1 text-text-tertiary hover:text-text-secondary transition-colors rounded"
          title="Close tray (Ctrl+`)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden min-h-0 font-mono text-xs text-text-secondary">
        {activeTab === 'logs'     && <LogsTab />}
        {activeTab === 'terminal' && <TerminalTab />}
        {activeTab === 'events'   && <EventsTab />}
      </div>
    </div>
  )
}
```

### `ui/src/views/ClusterOverview.tsx`

Placeholder cluster overview view:

```typescript
import { Server, Box, Network, HardDrive } from 'lucide-react'

interface StatCard {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  status: 'ok' | 'warn' | 'error'
}

const MOCK_STATS: StatCard[] = [
  { label: 'Nodes',       value: '3 / 3 Ready',    icon: Server,   status: 'ok' },
  { label: 'Pods',        value: '42 Running',      icon: Box,      status: 'ok' },
  { label: 'Services',    value: '12 Active',       icon: Network,  status: 'ok' },
  { label: 'Storage',     value: '8 PVCs Bound',    icon: HardDrive,status: 'ok' },
]

export default function ClusterOverview() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-text-primary mb-1">Cluster Overview</h1>
      <p className="text-sm text-text-tertiary mb-6">local-kind · All Namespaces</p>

      <div className="grid grid-cols-4 gap-3">
        {MOCK_STATS.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="bg-bg-secondary border border-border rounded-lg p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary uppercase tracking-wide">
                  {stat.label}
                </span>
                <Icon className="w-4 h-4 text-text-tertiary" />
              </div>
              <p className="text-lg font-semibold text-text-primary">{stat.value}</p>
              <div className="flex items-center gap-1.5">
                <span className="status-dot status-dot-running" />
                <span className="text-xs text-status-running">Healthy</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 p-6 bg-bg-secondary border border-border rounded-lg">
        <p className="text-sm text-text-tertiary text-center">
          Full cluster metrics arrive in Phase 3 · Connect to a real cluster to see live data
        </p>
      </div>
    </div>
  )
}
```

---

## 2.6 — Complete Go Backend Foundation

### `go.mod`

After running `go mod tidy` this should look like (actual hash versions will differ):

```
module github.com/leonardaustin/kubeviewer

go 1.22

require (
    github.com/wailsapp/wails/v2 v2.9.x
    helm.sh/helm/v3 v3.x.x
    k8s.io/api vX.Y.Z
    k8s.io/apimachinery vX.Y.Z
    k8s.io/client-go vX.Y.Z
)
```

### `main.go`

Full Wails app initialization with all handlers bound:

```go
package main

import (
	"log"
	"runtime"

	"github.com/leonardaustin/kubeviewer/handlers"
	"github.com/leonardaustin/kubeviewer/internal/cluster"
	"github.com/leonardaustin/kubeviewer/internal/config"
	"github.com/leonardaustin/kubeviewer/internal/helm"
	"github.com/leonardaustin/kubeviewer/internal/resource"
	"github.com/leonardaustin/kubeviewer/internal/stream"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	// Required to embed the frontend dist at compile time
	_ "embed"
)

func main() {
	// ── Initialise internal services ─────────────────────────────────────────
	cfgStore := config.NewStore()
	clusterMgr := cluster.NewManager(cfgStore)
	resourceSvc := resource.NewService(clusterMgr)
	streamSvc := stream.NewService(clusterMgr)
	helmClient := helm.NewClient(clusterMgr)

	// ── Initialise handlers (thin Wails-bound layer) ──────────────────────────
	app := NewApp(clusterMgr)
	clusterHandler := handlers.NewClusterHandler(clusterMgr)
	resourceHandler := handlers.NewResourceHandler(resourceSvc)
	streamHandler := handlers.NewStreamHandler(streamSvc)
	helmHandler := handlers.NewHelmHandler(helmClient)
	configHandler := handlers.NewConfigHandler(cfgStore)

	// ── Wails app options ─────────────────────────────────────────────────────
	err := wails.Run(&options.App{
		Title:            "KubeViewer",
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		Frameless:        runtime.GOOS == "darwin",
		BackgroundColour: &options.RGBA{R: 10, G: 10, B: 11, A: 255},

		AssetServer: &assetserver.Options{
			// Assets embedded into the binary (set up in Phase build)
		},

		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
			// Transparent titlebar allows our custom drag region
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},

		OnStartup:  app.startup,
		OnDomReady: app.domReady,
		OnShutdown: app.shutdown,

		Bind: []interface{}{
			app,
			clusterHandler,
			resourceHandler,
			streamHandler,
			helmHandler,
			configHandler,
		},
	})
	if err != nil {
		log.Fatalf("wails.Run: %v", err)
	}
}
```

### `app.go`

Application lifecycle with context management:

```go
package main

import (
	"context"
	"log"

	"github.com/leonardaustin/kubeviewer/internal/cluster"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the root application struct. It holds the Wails context and wires
// startup/shutdown lifecycle events. Domain logic lives in the internal
// packages; this struct is thin.
type App struct {
	ctx        context.Context
	clusterMgr *cluster.Manager
}

// NewApp creates the App with required dependencies.
func NewApp(clusterMgr *cluster.Manager) *App {
	return &App{clusterMgr: clusterMgr}
}

// startup is called when the Wails app is ready. ctx is the Wails context —
// hold onto it to call runtime.* functions later.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("KubeViewer starting up")

	// Load persisted cluster configurations
	if err := a.clusterMgr.LoadFromKubeconfig(); err != nil {
		log.Printf("warning: could not load kubeconfig: %v", err)
		// Non-fatal — user can add clusters manually
	}
}

// domReady is called after the frontend is fully rendered.
func (a *App) domReady(ctx context.Context) {
	log.Println("DOM ready")

	// Notify the frontend of the initial cluster list
	clusters := a.clusterMgr.List()
	runtime.EventsEmit(ctx, "clusters:loaded", clusters)
}

// shutdown is called when the application is closing.
func (a *App) shutdown(_ context.Context) {
	log.Println("KubeViewer shutting down")
	// Close any open watch streams, log streams, exec sessions
	a.clusterMgr.DisconnectAll()
}

// GetVersion returns the app version string (bound to frontend).
func (a *App) GetVersion() string {
	return "0.1.0"
}
```

### `internal/k8s/client.go`

```go
package k8s

import (
	"fmt"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// ClientSet holds both the typed Kubernetes client and the dynamic client
// for a single cluster connection.
type ClientSet struct {
	Typed   kubernetes.Interface
	Dynamic dynamic.Interface
	Config  *rest.Config
}

// NewClientSetFromContext creates a ClientSet from a kubeconfig context name.
// kubeconfigPath is typically $HOME/.kube/config; pass "" to use the default.
func NewClientSetFromContext(kubeconfigPath, contextName string) (*ClientSet, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = kubeconfigPath
	}

	configOverrides := &clientcmd.ConfigOverrides{}
	if contextName != "" {
		configOverrides.CurrentContext = contextName
	}

	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules,
		configOverrides,
	).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config for context %q: %w", contextName, err)
	}

	// Tune timeouts and QPS for desktop use — we don't need to be conservative
	cfg.QPS = 100
	cfg.Burst = 200

	return NewClientSetFromConfig(cfg)
}

// NewClientSetFromConfig creates a ClientSet from an existing rest.Config.
func NewClientSetFromConfig(cfg *rest.Config) (*ClientSet, error) {
	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create typed client: %w", err)
	}

	dynamic, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create dynamic client: %w", err)
	}

	return &ClientSet{
		Typed:   typed,
		Dynamic: dynamic,
		Config:  cfg,
	}, nil
}
```

### `internal/cluster/manager.go`

```go
package cluster

import (
	"fmt"
	"sync"

	"github.com/leonardaustin/kubeviewer/internal/config"
	"github.com/leonardaustin/kubeviewer/internal/k8s"
)

// Info represents a connectable Kubernetes cluster entry.
type Info struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server"`
	Connected bool   `json:"connected"`
	Favorite  bool   `json:"favorite"`
	Color     string `json:"color"` // user-assigned display color
}

// Manager tracks all known clusters and the single active connection.
// All methods are safe for concurrent use.
type Manager struct {
	mu       sync.RWMutex
	clusters map[string]*Info
	active   string
	clients  map[string]*k8s.ClientSet
	cfg      *config.Store
}

// NewManager creates an empty Manager.
func NewManager(cfg *config.Store) *Manager {
	return &Manager{
		clusters: make(map[string]*Info),
		clients:  make(map[string]*k8s.ClientSet),
		cfg:      cfg,
	}
}

// LoadFromKubeconfig reads all contexts from the default kubeconfig and
// populates the cluster list. Does not connect.
func (m *Manager) LoadFromKubeconfig() error {
	contexts, err := ListKubeconfigContexts("")
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, ctx := range contexts {
		if _, exists := m.clusters[ctx.Name]; !exists {
			m.clusters[ctx.Name] = &Info{
				Name:    ctx.Name,
				Context: ctx.Name,
				Server:  ctx.Server,
				Color:   "#6B7280", // default gray
			}
		}
	}
	return nil
}

// List returns all known clusters as a slice.
func (m *Manager) List() []Info {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]Info, 0, len(m.clusters))
	for _, c := range m.clusters {
		result = append(result, *c)
	}
	return result
}

// Connect establishes a Kubernetes client connection for the named cluster.
func (m *Manager) Connect(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	info, ok := m.clusters[name]
	if !ok {
		return fmt.Errorf("cluster %q not found", name)
	}

	cs, err := k8s.NewClientSetFromContext("", info.Context)
	if err != nil {
		return fmt.Errorf("connect to cluster %q: %w", name, err)
	}

	m.clients[name] = cs
	info.Connected = true
	m.active = name
	return nil
}

// Active returns the currently active cluster's Info, or nil if none.
func (m *Manager) Active() *Info {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.active == "" {
		return nil
	}
	info := m.clusters[m.active]
	if info == nil {
		return nil
	}
	copy := *info
	return &copy
}

// ActiveClient returns the Kubernetes ClientSet for the active cluster.
func (m *Manager) ActiveClient() (*k8s.ClientSet, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.active == "" {
		return nil, fmt.Errorf("no active cluster")
	}
	cs, ok := m.clients[m.active]
	if !ok {
		return nil, fmt.Errorf("cluster %q not connected", m.active)
	}
	return cs, nil
}

// DisconnectAll closes all cluster connections.
func (m *Manager) DisconnectAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, info := range m.clusters {
		info.Connected = false
	}
	m.clients = make(map[string]*k8s.ClientSet)
	m.active = ""
}
```

### `internal/cluster/kubeconfig.go`

```go
package cluster

import (
	"k8s.io/client-go/tools/clientcmd"
)

// ContextEntry holds the display information for a kubeconfig context.
type ContextEntry struct {
	Name    string
	Server  string
	User    string
}

// ListKubeconfigContexts reads all contexts from the kubeconfig at the given
// path (or the default path if kubeconfigPath is "").
func ListKubeconfigContexts(kubeconfigPath string) ([]ContextEntry, error) {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		rules.ExplicitPath = kubeconfigPath
	}

	rawCfg, err := rules.Load()
	if err != nil {
		return nil, err
	}

	entries := make([]ContextEntry, 0, len(rawCfg.Contexts))
	for name, ctx := range rawCfg.Contexts {
		server := ""
		if cluster, ok := rawCfg.Clusters[ctx.Cluster]; ok {
			server = cluster.Server
		}
		entries = append(entries, ContextEntry{
			Name:   name,
			Server: server,
			User:   ctx.AuthInfo,
		})
	}
	return entries, nil
}
```

### `internal/resource/types.go`

```go
package resource

// Resource is a generic representation of any Kubernetes resource, used as
// the data transfer type between Go and the frontend.
type Resource struct {
	Kind       string            `json:"kind"`
	APIVersion string            `json:"apiVersion"`
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Labels     map[string]string `json:"labels,omitempty"`
	Status     string            `json:"status"`
	Age        string            `json:"age"`
	// Raw holds the full JSON-encoded resource for detail views
	Raw string `json:"raw,omitempty"`
}

// ListResult wraps a resource list with metadata for pagination.
type ListResult struct {
	Items           []Resource `json:"items"`
	TotalCount      int        `json:"totalCount"`
	ResourceVersion string     `json:"resourceVersion"`
}
```

### `internal/resource/service.go`

```go
package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/leonardaustin/kubeviewer/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Service provides generic Kubernetes resource operations.
type Service struct {
	clusterMgr *cluster.Manager
}

// NewService creates a new ResourceService.
func NewService(mgr *cluster.Manager) *Service {
	return &Service{clusterMgr: mgr}
}

// List returns all resources of the given GVR in the given namespace.
// Pass namespace="" to list across all namespaces.
func (s *Service) List(ctx context.Context, gvr schema.GroupVersionResource, namespace string) (*ListResult, error) {
	cs, err := s.clusterMgr.ActiveClient()
	if err != nil {
		return nil, err
	}

	list, err := cs.Dynamic.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list %s/%s: %w", gvr.Resource, namespace, err)
	}

	result := &ListResult{
		Items:           make([]Resource, 0, len(list.Items)),
		TotalCount:      len(list.Items),
		ResourceVersion: list.GetResourceVersion(),
	}

	for _, obj := range list.Items {
		raw, _ := json.Marshal(obj.Object)
		age := ""
		if ct := obj.GetCreationTimestamp(); !ct.IsZero() {
			age = formatAge(time.Since(ct.Time))
		}
		result.Items = append(result.Items, Resource{
			Kind:       obj.GetKind(),
			APIVersion: obj.GetAPIVersion(),
			Name:       obj.GetName(),
			Namespace:  obj.GetNamespace(),
			Labels:     obj.GetLabels(),
			Age:        age,
			Raw:        string(raw),
		})
	}

	return result, nil
}

func formatAge(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}
```

### `internal/config/store.go`

```go
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// AppConfig is the full persisted configuration for KubeViewer.
type AppConfig struct {
	FavoriteClusters []string          `json:"favoriteClusters"`
	ClusterColors    map[string]string `json:"clusterColors"`
	DefaultNamespace string            `json:"defaultNamespace"`
	SidebarWidth     int               `json:"sidebarWidth"`
}

// Store manages reading and writing AppConfig to disk.
type Store struct {
	mu   sync.RWMutex
	path string
	cfg  AppConfig
}

// NewStore creates a Store backed by the platform config directory.
func NewStore() *Store {
	dir, _ := os.UserConfigDir()
	path := filepath.Join(dir, "kubeviewer", "config.json")
	s := &Store{path: path}
	_ = s.load() // best-effort; defaults used if file doesn't exist
	return s
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &s.cfg)
}

// Get returns a copy of the current config.
func (s *Store) Get() AppConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

// Save writes the current config to disk.
func (s *Store) Save(cfg AppConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg = cfg

	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}
```

### `internal/stream/logs.go`

```go
package stream

import (
	"bufio"
	"context"
	"fmt"
	"io"

	"github.com/leonardaustin/kubeviewer/internal/cluster"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Service manages long-lived streaming connections.
type Service struct {
	clusterMgr *cluster.Manager
}

// NewService creates a new stream Service.
func NewService(mgr *cluster.Manager) *Service {
	return &Service{clusterMgr: mgr}
}

// StreamPodLogs streams log lines from a pod/container to the lineCallback.
// The stream runs until ctx is cancelled.
func (s *Service) StreamPodLogs(
	ctx context.Context,
	namespace, pod, container string,
	tail int64,
	lineCallback func(line string),
) error {
	cs, err := s.clusterMgr.ActiveClient()
	if err != nil {
		return err
	}

	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    true,
		TailLines: &tail,
		Timestamps: true,
	}

	req := cs.Typed.CoreV1().Pods(namespace).GetLogs(pod, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		return fmt.Errorf("open log stream for %s/%s[%s]: %w", namespace, pod, container, err)
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil
		default:
			lineCallback(scanner.Text())
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// Ping verifies the active cluster is reachable.
func (s *Service) Ping(ctx context.Context) error {
	cs, err := s.clusterMgr.ActiveClient()
	if err != nil {
		return err
	}
	_, err = cs.Typed.CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1})
	return err
}
```

### `internal/helm/client.go`

```go
package helm

import (
	"github.com/leonardaustin/kubeviewer/internal/cluster"
)

// Release represents a deployed Helm release.
type Release struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Chart      string `json:"chart"`
	Version    string `json:"version"`
	AppVersion string `json:"appVersion"`
	Status     string `json:"status"`
	Updated    string `json:"updated"`
}

// Client wraps Helm SDK operations.
type Client struct {
	clusterMgr *cluster.Manager
}

// NewClient creates a Helm Client.
func NewClient(mgr *cluster.Manager) *Client {
	return &Client{clusterMgr: mgr}
}

// ListReleases returns all Helm releases across all namespaces.
// Full implementation arrives in Phase 7 (Helm integration).
func (c *Client) ListReleases() ([]Release, error) {
	return []Release{}, nil // stub
}
```

### `handlers/cluster_handler.go`

```go
package handlers

import (
	"context"

	"github.com/leonardaustin/kubeviewer/internal/cluster"
)

// ClusterHandler exposes cluster management operations to the Wails frontend.
// Each exported method becomes an async TypeScript function after `wails generate module`.
type ClusterHandler struct {
	ctx     context.Context
	manager *cluster.Manager
}

// NewClusterHandler creates a ClusterHandler.
func NewClusterHandler(mgr *cluster.Manager) *ClusterHandler {
	return &ClusterHandler{manager: mgr}
}

// Startup is called by Wails when the app starts; stores the context for
// use in runtime.EventsEmit calls.
func (h *ClusterHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// ListClusters returns all known clusters.
func (h *ClusterHandler) ListClusters() ([]cluster.Info, error) {
	return h.manager.List(), nil
}

// ConnectCluster connects to the named cluster, making it active.
func (h *ClusterHandler) ConnectCluster(name string) error {
	return h.manager.Connect(name)
}

// GetActiveCluster returns the currently connected cluster, or nil.
func (h *ClusterHandler) GetActiveCluster() (*cluster.Info, error) {
	return h.manager.Active(), nil
}
```

### `handlers/resource_handler.go`

```go
package handlers

import (
	"context"

	"github.com/leonardaustin/kubeviewer/internal/resource"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ResourceHandler exposes Kubernetes resource operations to the frontend.
type ResourceHandler struct {
	ctx context.Context
	svc *resource.Service
}

// NewResourceHandler creates a ResourceHandler.
func NewResourceHandler(svc *resource.Service) *ResourceHandler {
	return &ResourceHandler{svc: svc}
}

// Startup stores the Wails context.
func (h *ResourceHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// ListPods returns all pods in the given namespace ("" = all namespaces).
func (h *ResourceHandler) ListPods(namespace string) (*resource.ListResult, error) {
	return h.svc.List(h.ctx, schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "pods",
	}, namespace)
}

// ListDeployments returns all deployments in the given namespace.
func (h *ResourceHandler) ListDeployments(namespace string) (*resource.ListResult, error) {
	return h.svc.List(h.ctx, schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}, namespace)
}

// ListServices returns all services in the given namespace.
func (h *ResourceHandler) ListServices(namespace string) (*resource.ListResult, error) {
	return h.svc.List(h.ctx, schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "services",
	}, namespace)
}
```

### `handlers/stream_handler.go`

```go
package handlers

import (
	"context"

	"github.com/leonardaustin/kubeviewer/internal/stream"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// StreamHandler exposes log streaming to the frontend via Wails events.
type StreamHandler struct {
	ctx    context.Context
	svc    *stream.Service
	cancel context.CancelFunc
}

// NewStreamHandler creates a StreamHandler.
func NewStreamHandler(svc *stream.Service) *StreamHandler {
	return &StreamHandler{svc: svc}
}

// Startup stores the Wails context.
func (h *StreamHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// StartLogStream begins streaming logs for a pod/container.
// Log lines are emitted as Wails events named "log:line".
func (h *StreamHandler) StartLogStream(namespace, pod, container string, tail int64) error {
	h.StopLogStream() // cancel any existing stream

	ctx, cancel := context.WithCancel(h.ctx)
	h.cancel = cancel

	go func() {
		err := h.svc.StreamPodLogs(ctx, namespace, pod, container, tail, func(line string) {
			runtime.EventsEmit(h.ctx, "log:line", line)
		})
		if err != nil && ctx.Err() == nil {
			runtime.EventsEmit(h.ctx, "log:error", err.Error())
		}
	}()

	return nil
}

// StopLogStream cancels the active log stream, if any.
func (h *StreamHandler) StopLogStream() {
	if h.cancel != nil {
		h.cancel()
		h.cancel = nil
	}
}
```

### `handlers/helm_handler.go`

```go
package handlers

import (
	"context"

	"github.com/leonardaustin/kubeviewer/internal/helm"
)

// HelmHandler exposes Helm operations to the frontend.
type HelmHandler struct {
	ctx    context.Context
	client *helm.Client
}

// NewHelmHandler creates a HelmHandler.
func NewHelmHandler(client *helm.Client) *HelmHandler {
	return &HelmHandler{client: client}
}

// Startup stores the Wails context.
func (h *HelmHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// ListReleases returns all Helm releases.
func (h *HelmHandler) ListReleases() ([]helm.Release, error) {
	return h.client.ListReleases()
}
```

### `handlers/config_handler.go`

```go
package handlers

import (
	"context"

	"github.com/leonardaustin/kubeviewer/internal/config"
)

// ConfigHandler exposes app configuration persistence to the frontend.
type ConfigHandler struct {
	ctx   context.Context
	store *config.Store
}

// NewConfigHandler creates a ConfigHandler.
func NewConfigHandler(store *config.Store) *ConfigHandler {
	return &ConfigHandler{store: store}
}

// Startup stores the Wails context.
func (h *ConfigHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// GetConfig returns the current app configuration.
func (h *ConfigHandler) GetConfig() (config.AppConfig, error) {
	return h.store.Get(), nil
}

// SaveConfig persists an updated configuration.
func (h *ConfigHandler) SaveConfig(cfg config.AppConfig) error {
	return h.store.Save(cfg)
}
```

---

## 2.7 — Development Workflow

### Running in development mode

```bash
# From the project root — this starts both the Go backend and the Vite dev server
wails dev

# Expected startup sequence:
# INFO Starting application...  (Go compiles)
# INFO Frontend server started on port 34115
# INFO Starting Dev WebSocket server on port 34116
# (A native window opens showing your React app)
```

The Go backend auto-recompiles on `.go` file changes. The frontend hot-reloads
via Vite HMR. You rarely need to restart.

### Accessing browser DevTools

In dev mode, right-click anywhere in the Wails window and select **Inspect**.
This opens the full Chromium DevTools with React DevTools available if the
extension is installed in your Chrome profile.

Alternatively, open `http://localhost:34115` in Chrome to see the frontend
without the native shell.

### Regenerating TypeScript bindings

Every time you add a new exported method to a handler struct, regenerate the
TypeScript wrappers:

```bash
wails generate module

# This creates/updates:
# ui/wailsjs/go/handlers/ClusterHandler.js + .d.ts
# ui/wailsjs/go/handlers/ResourceHandler.js + .d.ts
# ... etc.
```

Then import in React:

```typescript
import { ListPods } from '../../wailsjs/go/handlers/ResourceHandler'

// Usage (returns a Promise):
const result = await ListPods('default')
console.log(result.items)
```

### Adding a new Go handler method

1. Add the exported method to the handler struct in `handlers/`:
   ```go
   func (h *ResourceHandler) ListNamespaces() ([]string, error) {
       // ...
   }
   ```
2. Run `wails generate module`
3. Import and call in React:
   ```typescript
   import { ListNamespaces } from '../../wailsjs/go/handlers/ResourceHandler'
   ```

### Adding a new frontend route

1. Create the view file in `ui/src/views/MyView.tsx`
2. Add the route to `main.tsx`:
   ```tsx
   <Route path="/my-view" element={<MyView />} />
   ```
3. Add the nav item to `NAV_SECTIONS` in `Sidebar.tsx`

### Build for distribution

```bash
# Build for current platform (produces build/bin/kubeviewer)
wails build

# Build with optimizations and version metadata
wails build -ldflags "-s -w" -trimpath

# Cross-compile for macOS universal binary (Apple Silicon + Intel)
wails build -platform darwin/universal
```

---

## 2.8 — Acceptance Criteria

Each criterion includes the exact command to verify it passes.

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | `wails dev` launches the app window | `wails dev` — window opens within 10s |
| 2 | Go backend compiles with zero errors | `go build ./...` — exits 0 |
| 3 | Frontend TypeScript compiles with zero errors | `cd ui && pnpm tsc --noEmit` — exits 0 |
| 4 | Dark theme applied globally | Visual: window background is `#0A0A0B` |
| 5 | Sidebar renders all navigation sections | Visual: all 8 groups visible when expanded |
| 6 | Sidebar collapses to icon-only mode | Press `[` key — sidebar shrinks to 48px |
| 7 | Sidebar state persists across reloads | Collapse, reload (`wails dev`), verify state |
| 8 | Topbar renders with drag region | Visual: topbar visible; window moves when dragged |
| 9 | Bottom tray opens and closes | Press `Ctrl+`` — tray appears/disappears |
| 10 | Bottom tray tabs switch correctly | Click Logs / Terminal / Events tabs |
| 11 | Bottom tray drag-resizes | Drag the grip handle — height changes |
| 12 | Tray height persists across reloads | Resize, reload, verify height |
| 13 | All pnpm packages install cleanly | `cd ui && pnpm install` — exits 0 |
| 14 | `wails build` produces a binary | `wails build && ls build/bin/` |
| 15 | Namespace selector opens and filters | Click namespace button, type in search box |
| 16 | ESLint passes with zero errors | `cd ui && pnpm exec eslint src/` |

### Run all verifications at once

```bash
#!/usr/bin/env bash
# scripts/verify-phase2.sh
set -e

echo "=== Go build ==="
go build ./...
echo "PASS"

echo "=== Go vet ==="
go vet ./...
echo "PASS"

echo "=== Frontend install ==="
cd ui
pnpm install --frozen-lockfile
echo "PASS"

echo "=== TypeScript type check ==="
pnpm tsc --noEmit
echo "PASS"

echo "=== Wails build ==="
cd ..
wails build
echo "PASS"

echo ""
echo "All Phase 2 checks passed."
```

```bash
chmod +x scripts/verify-phase2.sh
bash scripts/verify-phase2.sh
```
