# KubeViewer Features & API Reference

Complete feature inventory with the corresponding backend API surface. Every method listed below is callable from the frontend via Wails-generated TypeScript bindings.

---

## Cluster Management

Connect to Kubernetes clusters, switch contexts, monitor health.

| Method | Handler | Description |
|--------|---------|-------------|
| `ListContexts()` | ClusterHandler | Returns all kubeconfig context names |
| `ListContextDetails()` | ClusterHandler | Returns detailed context info (server, auth type, namespace) |
| `Connect(contextName)` | ClusterHandler | Establishes connection to a cluster |
| `Disconnect()` | ClusterHandler | Tears down the active connection |
| `SwitchContext(contextName)` | ClusterHandler | Changes active context |
| `ActiveConnection()` | ClusterHandler | Returns current connection info |
| `GetConnectionSnapshot()` | ClusterHandler | Full connection state (version, node count, latency) |
| `ListConnections()` | ClusterHandler | Snapshots of all tracked connections |
| `ListNamespaces()` | ClusterHandler | All namespace names (paginated) |
| `PreflightCheck(contextName)` | ClusterHandler | Validates reachability and auth before connecting |
| `GetClusterSummary()` | ClusterHandler | Aggregate counts: nodes, pods, deployments, services |
| `GetMetrics()` | ClusterHandler | CPU/memory metrics from metrics-server |
| `CheckRBACPermission(verb, group, resource, namespace)` | ClusterHandler | Single RBAC permission check |
| `CheckRBACPermissions(verbs, group, resource, namespace)` | ClusterHandler | Bulk RBAC permission check |

**Events emitted:**
- `kubeconfig:changed` — kubeconfig file modified on disk
- `cluster:health` — periodic health check results (includes state, latency, error)

---

## Resource Browsing & CRUD

Generic resource operations that work across all Kubernetes resource types.

| Method | Handler | Description |
|--------|---------|-------------|
| `ListResources(group, version, resource, namespace)` | ResourceHandler | List resources by GVR, optionally filtered by namespace |
| `GetResource(group, version, resource, namespace, name)` | ResourceHandler | Get a single resource |
| `ApplyResource(group, version, resource, namespace, data)` | ResourceHandler | Create or update a resource from JSON/YAML |
| `DeleteResource(group, version, resource, namespace, name)` | ResourceHandler | Delete a resource |
| `PatchLabels(group, version, resource, namespace, name, labels)` | ResourceHandler | Patch labels on a resource |
| `BatchDelete(queries)` | ResourceHandler | Delete multiple resources in one call |
| `WatchResources(group, version, resource, namespace)` | ResourceHandler | Start a watch; pushes events to frontend |
| `StopWatch(group, version, resource, namespace)` | ResourceHandler | Stop a resource watch |
| `ListEvents(namespace, limit)` | ResourceHandler | List Kubernetes events |
| `GetPodMetrics(namespace)` | ResourceHandler | Pod-level CPU/memory from metrics-server |

### Supported Resource Types

All standard Kubernetes resources are supported through the generic GVR-based API. Dedicated views exist for:

**Workloads:** Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
**Networking:** Services, Ingresses, Endpoints, NetworkPolicies
**Config:** ConfigMaps, Secrets, ResourceQuotas, LimitRanges, HPAs, PDBs
**Storage:** PersistentVolumes, PersistentVolumeClaims, StorageClasses
**RBAC:** ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings
**Cluster:** Nodes, Namespaces, Events, PriorityClasses, CRDs

Custom resources are discovered dynamically and accessible via `/custom/:group/:resource`.

**Events emitted:**
- `resource-watch:{resource}` — watch events with `type` (`ADDED`, `MODIFIED`, `DELETED`) and `resource` payload

---

## Resource Actions

Typed operations for specific resource kinds.

| Method | Handler | Description |
|--------|---------|-------------|
| `ScaleDeployment(namespace, name, replicas)` | ResourceHandler | Scale a deployment's replica count |
| `RestartDeployment(namespace, name)` | ResourceHandler | Rolling restart via annotation patch |
| `CordonNode(nodeName)` | ResourceHandler | Mark node as unschedulable |
| `UncordonNode(nodeName)` | ResourceHandler | Mark node as schedulable |
| `DrainNode(nodeName, gracePeriod, force, ignoreDaemonSets, deleteEmptyDirData)` | ResourceHandler | Evict pods from a node |
| `PauseDeployment(namespace, name)` | ResourceHandler | Pause a deployment rollout |
| `ResumeDeployment(namespace, name)` | ResourceHandler | Resume a paused deployment rollout |
| `GetRolloutHistory(namespace, name)` | ResourceHandler | Get deployment revision history |
| `AddNodeTaint(nodeName, key, value, effect)` | ResourceHandler | Add a taint to a node |
| `RemoveNodeTaint(nodeName, key)` | ResourceHandler | Remove a taint from a node |
| `CreateJobFromCronJob(namespace, cronJobName, jobName)` | ResourceHandler | Create a one-off Job from a CronJob |
| `DryRunApply(group, version, resource, namespace, data)` | ResourceHandler | Server-side dry run of a resource apply |

---

## Log Streaming

Real-time pod log streaming with multi-container support.

| Method | Handler | Description |
|--------|---------|-------------|
| `StreamLogs(opts)` | StreamHandler | Start streaming logs for a pod/container |
| `StopLogStream(namespace, podName)` | StreamHandler | Stop a log stream |
| `StreamAllContainerLogs(namespace, podName, containers, tailLines)` | StreamHandler | Stream logs from all containers simultaneously |
| `StopAllContainerLogs(namespace, podName)` | StreamHandler | Stop multi-container log stream |
| `DownloadLogs(opts)` | StreamHandler | Download logs to a temporary file |

`LogOptions` fields: `namespace`, `podName`, `containerName`, `follow`, `tailLines`, `sinceSeconds`, `timestamps`, `previous`.

**Events emitted:**
- `logs:{namespace}/{podName}` — individual log lines with content, timestamp, container name
- `logs:all:{namespace}/{podName}` — multi-container log lines

---

## Pod Exec (Shell)

Interactive shell sessions inside containers.

| Method | Handler | Description |
|--------|---------|-------------|
| `StartExec(opts)` | StreamHandler | Open an exec session, returns session ID |
| `WriteExec(sessionID, data)` | StreamHandler | Send input to the exec session |
| `CloseExec(sessionID)` | StreamHandler | Close an exec session |

`ExecOptions` fields: `namespace`, `podName`, `containerName`, `command` (validated against shell metacharacters).

**Events emitted:**
- `exec:stdout:{sessionID}` — stdout data from the exec session
- `exec:stderr:{sessionID}` — stderr data from the exec session
- `exec:exit:{sessionID}` — session terminated

---

## Port Forwarding

Forward local ports to pod ports.

| Method | Handler | Description |
|--------|---------|-------------|
| `StartPortForward(opts)` | StreamHandler | Start a port forward, returns local port |
| `StopPortForward(localPort)` | StreamHandler | Stop a port forward |
| `ListPortForwards()` | StreamHandler | List active port forwards |

---

## Helm

Helm v3 release management using the SDK directly (no CLI).

| Method | Handler | Description |
|--------|---------|-------------|
| `SetCluster(kubeconfigPath, contextName)` | HelmHandler | Configure Helm client for a cluster |
| `ListReleases(namespace)` | HelmHandler | List Helm releases |
| `GetRelease(name, namespace)` | HelmHandler | Release detail (status, values, notes, manifest) |
| `GetReleaseHistory(name, namespace)` | HelmHandler | Release revision history |
| `InstallChart(name, namespace, chartPath, values)` | HelmHandler | Install a Helm chart |
| `UpgradeChart(name, namespace, chartPath, values)` | HelmHandler | Upgrade a release |
| `RollbackRelease(name, namespace, revision)` | HelmHandler | Rollback to a specific revision |
| `UninstallRelease(name, namespace)` | HelmHandler | Uninstall a release |
| `AddChartRepo(name, repoURL)` | HelmHandler | Add a Helm chart repository |
| `RemoveChartRepo(name)` | HelmHandler | Remove a Helm chart repository |
| `ListChartRepos()` | HelmHandler | List configured chart repositories |
| `SearchCharts(keyword)` | HelmHandler | Search for charts across repositories |

---

## Secrets

Masked secret viewing with audit logging.

| Method | Handler | Description |
|--------|---------|-------------|
| `GetSecret(namespace, name)` | SecretHandler | Returns secret with values masked |
| `RevealSecretKey(namespace, name, key)` | SecretHandler | Reveals a single key's value (audit logged) |

All secret access is recorded through the audit system with action types `secret.view` and `secret.reveal`.

---

## Settings & Configuration

| Method | Handler | Description |
|--------|---------|-------------|
| `GetConfig()` | ConfigHandler | Returns current app configuration |
| `UpdateConfig(partial)` | ConfigHandler | Merge-update specific config fields |
| `ResetConfig()` | ConfigHandler | Reset to defaults |
| `ExportConfig()` | ConfigHandler | Export config as JSON string |
| `ImportConfig(jsonStr)` | ConfigHandler | Import config from JSON string |
| `GetConfigPath()` | ConfigHandler | Returns filesystem path of config file |
| `SaveToFile(path)` | ConfigHandler | Save config to a specific file |
| `LoadFromFile(path)` | ConfigHandler | Load config from a specific file |

---

## Troubleshooting

Guided root cause analysis for failing resources.

| Method | Handler | Description |
|--------|---------|-------------|
| `Investigate(kind, namespace, name, status)` | TroubleshootHandler | Run diagnostic rules, returns findings and recommendations |
| `GetTimeline(kind, namespace, name)` | TroubleshootHandler | Change history timeline for a resource |
| `GetRecentChanges()` | TroubleshootHandler | Recent changes across the cluster |

---

## Deployment Wizards

Form-based resource creation with YAML preview.

| Method | Handler | Description |
|--------|---------|-------------|
| `PreviewDeployment(spec)` | WizardHandler | Generate Deployment YAML from form inputs |
| `PreviewService(spec)` | WizardHandler | Generate Service YAML |
| `PreviewConfigMap(spec)` | WizardHandler | Generate ConfigMap YAML |
| `PreviewSecret(spec)` | WizardHandler | Generate Secret YAML |

Generated YAML can be reviewed in the Monaco editor before applying.

---

## YAML Templates

Reusable YAML templates with variable interpolation.

| Method | Handler | Description |
|--------|---------|-------------|
| `ListTemplates()` | TemplateHandler | List available templates (built-in + custom) |
| `RenderTemplate(name, values)` | TemplateHandler | Render a template with variable substitution |
| `SaveTemplate(tmpl)` | TemplateHandler | Save a custom template |
| `DeleteTemplate(name)` | TemplateHandler | Delete a custom template |

---

## Alerting & Notifications

| Method | Handler | Description |
|--------|---------|-------------|
| `ListAlerts()` | AlertHandler | List active alerts |
| `AcknowledgeAlert(id)` | AlertHandler | Acknowledge an alert |
| `GetRules()` | AlertHandler | List alert rules |
| `ActiveAlertCount()` | AlertHandler | Count of unacknowledged alerts |

---

## Audit Trail

| Method | Handler | Description |
|--------|---------|-------------|
| `GetAuditLog(filter)` | AuditHandler | Query audit entries with filters |
| `GetAuditCount()` | AuditHandler | Total audit entry count |

---

## Security

| Method | Handler | Description |
|--------|---------|-------------|
| `CheckPodSecurity(podSpec)` | SecurityScanHandler | Scan a pod spec for security issues |

---

## GitOps

| Method | Handler | Description |
|--------|---------|-------------|
| `DetectProviders(apiGroups)` | GitOpsHandler | Detect ArgoCD/Flux CRDs in the cluster |

---

## Visualization

| Method | Handler | Description |
|--------|---------|-------------|
| `BuildRBACGraph(roles, clusterRoles, bindings, clusterBindings)` | RBACHandler | Build RBAC relationship graph |
| `BuildNetworkGraph(policies, pods)` | NetPolHandler | Build network policy graph |

---

## Backup & Restore

| Method | Handler | Description |
|--------|---------|-------------|
| `StripManifest(manifest)` | BackupHandler | Strip cluster-specific metadata for export |

---

## Auto-Update

| Method | Handler | Description |
|--------|---------|-------------|
| `CheckForUpdate()` | UpdateHandler | Check GitHub releases for updates |
| `SkipVersion(version)` | UpdateHandler | Skip a specific version |

---

## Keyboard Shortcuts

KubeViewer is keyboard-first. The shortcuts below are the active hardcoded bindings in the frontend (`AppShellShortcuts.tsx`, `ShortcutHelpOverlay.tsx`). The backend also exposes a `keyBindings` map in the config store (`internal/config/store.go`) intended for user customization, but this is not yet wired into the frontend.

**Navigation (vim-style chords):**

| Shortcut | Action |
|----------|--------|
| `G O` | Go to Overview |
| `G P` | Go to Pods |
| `G D` | Go to Deployments |
| `G S` | Go to Services |
| `G N` | Go to Nodes |
| `G E` | Go to Events |
| `G H` | Go to Helm Releases |
| `G C` | Go to ConfigMaps |
| `G I` | Go to Ingresses |

**Interface:**

| Shortcut | Action |
|----------|--------|
| `Cmd + K` or `/` | Command palette |
| `[` | Toggle sidebar |
| `Ctrl + \`` | Toggle bottom tray |
| `?` | Shortcut help overlay |
| `Cmd + Shift + N` | Namespace filter |
| `Cmd + Shift + C` | Cluster switcher |

**Table Actions:**

| Shortcut | Action |
|----------|--------|
| `Up / Down` | Select row |
| `Enter` | Open detail |
| `L` | View logs |
| `X` | Exec shell |
| `E` | Edit YAML |
| `Cmd + Backspace` | Delete resource |
| `Escape` | Close / dismiss |

---

## Frontend Routes

```
/welcome                            Welcome / connect screen
/overview                           Cluster overview dashboard
/workloads/pods                     Pod list
/workloads/pods/:namespace/:name    Pod detail
/workloads/deployments              Deployment list (+ detail route)
/workloads/statefulsets             StatefulSet list
/workloads/daemonsets               DaemonSet list
/workloads/replicasets              ReplicaSet list
/workloads/jobs                     Job list
/workloads/cronjobs                 CronJob list
/networking/services                Service list (+ detail route)
/networking/ingresses               Ingress list
/networking/endpoints               Endpoint list
/networking/networkpolicies         NetworkPolicy list
/config/configmaps                  ConfigMap list
/config/secrets                     Secret list
/config/resourcequotas              ResourceQuota list
/config/limitranges                 LimitRange list
/config/hpas                        HPA list
/config/pdbs                        PDB list
/storage/pvcs                       PVC list
/storage/pvs                        PV list
/storage/storageclasses             StorageClass list
/rbac/serviceaccounts               ServiceAccount list
/rbac/roles                         Role list
/rbac/clusterroles                  ClusterRole list
/rbac/rolebindings                  RoleBinding list
/rbac/clusterrolebindings           ClusterRoleBinding list
/cluster/nodes                      Node list (+ detail route)
/cluster/namespaces                 Namespace list
/cluster/events                     Cluster events
/cluster/priorityclasses            PriorityClass list
/helm/releases                      Helm release list (+ detail route)
/custom/:group/:resource            CRD browser
/troubleshoot                       Troubleshooting panel
/wizards/deployment                 Deployment wizard
/wizards/templates                  Template library
/security/overview                  Security scan overview
/security/rbac-graph                RBAC visualization
/ops/alerts                         Alert management
/ops/audit                          Audit log viewer
/ops/backup                         Backup & restore
/ops/gitops                         GitOps status
/ops/netpol-graph                   Network policy visualization
/topology                           Cluster topology view
/metrics                            Metrics dashboard
/settings                           Application settings
```

---

## Planned Features

The following features are on the roadmap but not yet implemented.

### AWS Integration: Automatic EKS Cluster Discovery

Automatic discovery of Amazon EKS clusters from configured AWS accounts. Planned capabilities:

- **AWS SDK integration** — Use AWS credentials (profiles, environment variables, IAM roles) to list EKS clusters across regions
- **One-click import** — Discover clusters and generate kubeconfig entries automatically, removing the need for manual `aws eks update-kubeconfig` commands
- **Multi-account support** — Discover clusters across multiple AWS accounts via assumed roles
- **IAM authentication** — Native support for `aws-iam-authenticator` and `aws eks get-token` credential providers

**Current state:** KubeViewer can *detect* that a cluster is EKS (via server URL patterns and exec plugin detection in `internal/cluster/platform.go` and `internal/cluster/kubeconfig.go`) and provides manual setup guides in the Welcome screen, but does not yet integrate with the AWS SDK for programmatic cluster discovery.

### Azure AKS: One-Click Azure Integration for AKS Cluster Discovery

Automatic discovery of Azure AKS clusters from configured Azure subscriptions. Planned capabilities:

- **Azure SDK integration** — Use Azure credentials (CLI login, managed identity, service principal) to list AKS clusters across subscriptions and resource groups
- **One-click import** — Discover clusters and merge kubeconfig entries automatically, replacing manual `az aks get-credentials` commands
- **Multi-subscription support** — Discover clusters across multiple Azure subscriptions
- **Azure AD authentication** — Native support for `kubelogin` and Azure AD-based authentication flows

**Current state:** KubeViewer can *detect* that a cluster is AKS (via `.azmk8s.io` URL patterns and `kubelogin` exec plugin detection) and provides manual setup guides in the Welcome screen, but does not yet integrate with the Azure SDK for programmatic cluster discovery.

### Security Center: CVE Reporting for Images, Resources, and Roles

A comprehensive security center with vulnerability scanning and CVE reporting. Planned capabilities (see `docs/PHASE9-design.md` for detailed design):

- **Trivy Operator integration** — Auto-detect Trivy Operator CRDs (`VulnerabilityReport`, `ConfigAuditReport`) and surface scan results
- **CVE list view** — Browse vulnerabilities by severity, affected package, fixed version, and CVE links
- **Security Overview Dashboard** — Aggregate vulnerability counts by severity (Critical/High/Medium/Low), top vulnerable workloads, and image vulnerability status
- **Config audit results** — Surface Trivy config audit findings for resource spec misconfigurations
- **Role-based security analysis** — Identify overly permissive RBAC roles and service accounts

**Current state:** KubeViewer implements pod-level security scanning against Kubernetes Pod Security Standards (`internal/security/scanner.go`), RBAC graph visualization (`internal/rbacgraph/`), and audit logging (`internal/audit/logger.go`). The CVE/Trivy integration described in the Phase 9 design document has not yet been implemented.
