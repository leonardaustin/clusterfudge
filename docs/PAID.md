# KubeViewer Paid Edition

## Pricing Model

| Tier | Target | Price |
|------|--------|-------|
| Community | Individual devs | Free |
| Pro | Power users, small teams | ~$15/mo per seat |
| Enterprise | Orgs (SSO, audit, compliance) | ~$40/mo per seat |

**Principle**: Free is fully functional for a single developer on a single cluster. Paid features target **scale** (multi-cluster), **teams** (shared state, audit), and **depth** (advanced AI, security, observability).

---

## Free (Community Edition)

Everything shipping today:

- Single cluster connection and management
- Full resource browsing (all 27+ resource types)
- Log streaming, terminal exec, port forwarding
- Helm release management (install, upgrade, rollback, uninstall)
- YAML editor with diff/apply and schema validation
- Resource actions (scale, restart, drain, cordon, etc.)
- Troubleshooting engine with rule-based pre-analysis
- AI debugging (single provider — Claude Code, Gemini CLI, or ChatGPT Codex)
- Local audit logging
- Backup/restore (export/import YAML)
- Security scanning (pod security checks)
- RBAC and network policy visualization
- GitOps provider detection
- Topology view
- Alerts (rule-based)
- YAML templates

---

## Pro Edition (~$15/mo per seat)

### Multi-Cluster

- Simultaneous connections to multiple clusters
- Cross-cluster resource search and comparison
- Unified events and alerts across clusters
- Cluster groups (dev / staging / prod)

### Advanced AI

- Multiple AI providers active simultaneously (pick per session)
- AI conversation history (persist across sessions)
- AI-suggested remediations with one-click apply
- Bulk pod diagnosis (diagnose all failing pods in a namespace)

### Observability

- Prometheus / Grafana integration (embedded metric dashboards)
- Custom metric queries in pod detail
- Resource cost estimation (CPU/memory to dollars)
- Capacity planning views

### Security & Compliance

- Scheduled security scans with report export (PDF / CSV)
- CIS benchmark checks
- Image vulnerability scanning (Trivy integration)
- Policy enforcement (OPA / Gatekeeper rule viewer)
- Secrets rotation reminders

### Operational

- Scheduled backup / restore policies
- GitOps sync status dashboard (Argo / Flux deep integration)
- Runbook automation (attach scripts to alert conditions)
- Slack / Teams / PagerDuty notifications for alerts

### UX

- Custom dashboards (drag-and-drop widgets)
- Saved views and workspace layouts per cluster
- Resource bookmarks with notes
- Export / share snapshots of cluster state

---

## Enterprise Edition (~$40/mo per seat)

Everything in Pro, plus:

### Team & Identity

- SSO / OIDC login for the desktop app (tie actions to identity)
- Shared saved queries, filters, and dashboard layouts
- Team-wide audit trail (centralized, not just local file)
- Role-based access profiles (operator view vs developer view)
