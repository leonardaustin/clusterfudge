# Clusterfudge

A native desktop Kubernetes management tool.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/leonardaustin)

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

## Install

### Homebrew (macOS / Linux)

```bash
brew install --cask leonardaustin/tap/clusterfudge
```

### APT (Debian/Ubuntu)

```bash
curl -fsSL https://apt.austincorp.com/pubkey.gpg | sudo gpg --dearmor -o /usr/share/keyrings/austincorp.gpg
echo "deb [signed-by=/usr/share/keyrings/austincorp.gpg] https://apt.austincorp.com stable main" | sudo tee /etc/apt/sources.list.d/austincorp.list
sudo apt update && sudo apt install clusterfudge
```

### Download

Grab the latest release for your platform from the [Releases](https://github.com/leonardaustin/clusterfudge/releases) page:

- **macOS** &mdash; `.dmg` (Apple Silicon & Intel)
- **Linux** &mdash; `.tar.gz` (x64 & ARM64)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License &mdash; see the [LICENSE](LICENSE) file for details.
