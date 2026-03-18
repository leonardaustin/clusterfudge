# Clusterfudge

A native desktop Kubernetes management tool built with [Wails](https://wails.io/) (Go backend + React/TypeScript frontend).

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Features

- **Multi-cluster management** &mdash; connect to multiple clusters, switch contexts, monitor health
- **Resource browsing** &mdash; virtual-scrolled tables for 27+ resource types with real-time watch updates
- **Pod log streaming** &mdash; search, severity coloring, multi-container support, log download
- **Interactive terminal** &mdash; exec into containers with ANSI color and resize support
- **Port forwarding** &mdash; forward local ports with auto-reconnection and status dashboard
- **YAML editor** &mdash; Monaco-based editor with syntax highlighting and in-place apply
- **Helm management** &mdash; list, install, upgrade, rollback, uninstall releases via Helm SDK
- **Resource actions** &mdash; scale, restart, cordon/uncordon, drain nodes, pause/resume rollouts
- **Command palette** &mdash; Cmd+K fuzzy search with context-aware actions
- **Keyboard-first** &mdash; vim-style chord navigation, table shortcuts, rebindable (planned)
- **Dark/light themes** &mdash; system preference detection, accent color customization
- **Deployment wizards** &mdash; form-based creation for Deployments, Services, ConfigMaps, Secrets
- **Troubleshooting** &mdash; guided root cause analysis with change timeline
- **Alerting** &mdash; configurable alert rules with acknowledgement
- **Audit trail** &mdash; file-backed audit logging for secret access and mutating operations
- **Security scanning** &mdash; pod spec security checks
- **RBAC visualization** &mdash; graph-based RBAC relationship viewer
- **Backup/restore** &mdash; export resources with metadata stripping

## Prerequisites

- [Go](https://go.dev/) 1.23+
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2

### Platform-specific dependencies

**Linux:**
```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev
```

**macOS:** Xcode command line tools (`xcode-select --install`)

**Windows:** WebView2 runtime (included in Windows 11, [download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) for Windows 10)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/leonardaustin/clusterfudge.git
cd clusterfudge

# Install frontend dependencies
cd ui && pnpm install && cd ..

# Start development server with hot reload
make dev
```

## Development

```bash
# Start development server with hot reload
make dev

# Run all tests
make test

# Run linters
make lint

# Build production binary
make build

# Format code
make format

# See all available commands
make help
```

## Project Structure

```
.
├── main.go                  # Application entry point
├── app.go                   # Wails lifecycle hooks
├── handlers/                # Wails-bound handler layer
├── internal/
│   ├── ai/                  # AI integration
│   ├── alerts/              # Alert rules and store
│   ├── audit/               # Audit logging
│   ├── backup/              # Resource export/import
│   ├── cache/               # In-memory caching
│   ├── cluster/             # Cluster connection management
│   ├── config/              # App configuration store
│   ├── events/              # Event emitter
│   ├── helm/                # Helm SDK wrapper
│   ├── k8s/                 # Kubernetes client utilities
│   ├── resource/            # Resource service layer
│   ├── security/            # Security scanning
│   ├── stream/              # Log streaming, exec, port-forward
│   ├── templates/           # YAML template engine
│   ├── troubleshoot/        # Diagnostic engine and timeline
│   └── updater/             # Auto-update checker
├── ui/                      # React/TypeScript frontend
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utilities, column definitions
│       ├── pages/           # Route page components
│       ├── stores/          # Zustand state stores
│       └── views/           # Top-level view compositions
├── docs/                    # Documentation and audit reports
└── Makefile                 # Build commands
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License &mdash; see the [LICENSE](LICENSE) file for details.
