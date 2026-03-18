# Clusterfudge E2E Test Plan

This document provides a comprehensive end-to-end test plan for Clusterfudge. Every test spec is detailed enough for a mid-level engineer to implement without additional clarification.

---

## Table of Contents

1. [Test Infrastructure](#1-test-infrastructure)
2. [Test Framework Architecture](#2-test-framework-architecture)
3. [Cluster Connection Tests](#3-cluster-connection-tests)
4. [Resource Listing Tests](#4-resource-listing-tests)
5. [Resource CRUD Tests](#5-resource-crud-tests)
6. [Resource Actions Tests](#6-resource-actions-tests)
7. [Log Streaming Tests](#7-log-streaming-tests)
8. [Exec Session Tests](#8-exec-session-tests)
9. [Port Forwarding Tests](#9-port-forwarding-tests)
10. [Watch / Real-Time Update Tests](#10-watch--real-time-update-tests)
11. [Helm Tests](#11-helm-tests)
12. [Namespace Filtering Tests](#12-namespace-filtering-tests)
13. [Error Handling Tests](#13-error-handling-tests)
14. [Performance Tests](#14-performance-tests)
15. [Test Fixtures Reference](#15-test-fixtures-reference)

---

## 1. Test Infrastructure

### 1.1 Local Development Setup

**Prerequisites:**
- Podman installed and running (`podman --version`)
- Go 1.22+
- `kubectl` on your PATH (for verifying cluster state independently)

**Start k3s container:**

```bash
podman run -d \
  --name clusterfudge-k3s \
  --privileged \
  -p 6443:6443 \
  -p 10250:10250 \
  rancher/k3s:v1.28.5-k3s1 server \
  --disable traefik \
  --disable metrics-server \
  --tls-san $(hostname -I | awk '{print $1}')
```

Wait for k3s to be ready (up to 60 seconds):

```bash
until podman exec clusterfudge-k3s kubectl get nodes 2>/dev/null | grep -q " Ready"; do
  echo "Waiting for k3s..."; sleep 2
done
echo "k3s is ready"
```

**Extract kubeconfig:**

```bash
# Get kubeconfig from the container
podman exec clusterfudge-k3s cat /etc/rancher/k3s/k3s.yaml > /tmp/clusterfudge-e2e.yaml

# Fix the server address (container uses 127.0.0.1 internally)
HOST_IP=$(podman inspect clusterfudge-k3s --format '{{.NetworkSettings.IPAddress}}' 2>/dev/null || echo "127.0.0.1")
sed -i "s|127.0.0.1:6443|${HOST_IP}:6443|g" /tmp/clusterfudge-e2e.yaml
sed -i "s|https://localhost:6443|https://${HOST_IP}:6443|g" /tmp/clusterfudge-e2e.yaml

export KUBECONFIG=/tmp/clusterfudge-e2e.yaml
```

**Verify connectivity:**

```bash
kubectl get nodes
# Expected output: NAME         STATUS   ROLES                  AGE   VERSION
#                  k3s-server   Ready    control-plane,master   Xs    v1.28.x+k3s1
```

**Teardown after tests:**

```bash
podman stop clusterfudge-k3s
podman rm clusterfudge-k3s
rm -f /tmp/clusterfudge-e2e.yaml
```

### 1.2 CI Setup (GitHub Actions)

The workflow uses k3s installed directly on the GitHub-hosted runner (Ubuntu):

```bash
# Install k3s on the runner
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --disable traefik" sh -

# Wait for node to be ready
until kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null | grep -q " Ready"; do
  sleep 2
done

# Make kubeconfig available
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

### 1.3 Test Fixture Creation

Before running tests, create a dedicated namespace and test resources:

```bash
kubectl create namespace clusterfudge-e2e
kubectl create namespace clusterfudge-e2e-b  # second namespace for filtering tests
```

All test resources should be created in `clusterfudge-e2e` unless the test specifically targets multi-namespace behavior.

**Fixture creation order** (dependencies matter):
1. Namespaces
2. RBAC resources (ServiceAccount, Role, RoleBinding)
3. ConfigMaps, Secrets
4. PVCs (PV is auto-created by local-path provisioner in k3s)
5. Deployments, StatefulSets, DaemonSets
6. Services (after deployments so endpoints populate)
7. Jobs, CronJobs
8. HPAs (after deployments with CPU metrics)
9. CRDs + custom resource instances

### 1.4 Teardown Strategy

Each test that creates resources must clean them up. Use `t.Cleanup()` to register teardown before the creation step to ensure cleanup runs even if the test panics:

```go
func TestSomething(t *testing.T) {
    // Register cleanup before creating resources
    t.Cleanup(func() {
        deleteResource(t, "deployment", "my-deployment", "clusterfudge-e2e")
    })

    // Now create the resource
    createDeployment(t, "my-deployment", "clusterfudge-e2e")

    // ... test assertions ...
}
```

For test suites that share fixtures, use `TestMain` to create/destroy fixtures once per suite run.

### 1.5 Parallel Test Execution

- Tests within a file can be marked `t.Parallel()` if they operate on uniquely named resources.
- Never run watch tests and CRUD tests for the same resource type in parallel (watch events can cross-contaminate).
- Performance tests must run sequentially to avoid measurement interference.
- Use `t.Name()` to generate unique resource names per test: `fmt.Sprintf("e2e-%s-%d", strings.ToLower(t.Name()), time.Now().UnixNano())`.

---

## 2. Test Framework Architecture

### 2.1 Go Backend E2E Tests

**Build tag:** All e2e tests use `//go:build e2e` so they are excluded from the normal `go test ./...` run.

**Test file location:** `test/e2e/`

**How they work:**
- Tests import Clusterfudge's internal packages directly (`internal/cluster`, `internal/resource`, `internal/stream`, `internal/helm`)
- They connect to the real k3s cluster using the kubeconfig pointed to by `E2E_KUBECONFIG` env var (falls back to `KUBECONFIG`)
- Tests call the same code that Wails handlers call — this validates the business logic without the Wails layer
- Some tests also call handler methods directly (simulating what the frontend calls via Wails bindings)

**Running Go e2e tests:**

```bash
# Set kubeconfig
export E2E_KUBECONFIG=/tmp/clusterfudge-e2e.yaml

# Run all e2e tests
go test -v -tags=e2e -timeout=10m ./test/e2e/...

# Run a specific test file
go test -v -tags=e2e -timeout=5m ./test/e2e/ -run TestCluster

# Run with race detector (recommended for watch/stream tests)
go test -v -tags=e2e -race -timeout=15m ./test/e2e/...
```

### 2.2 Frontend E2E Tests (Playwright)

Playwright tests drive the full Wails application via `wails dev` mode, which serves the frontend at a localhost URL that Playwright can reach.

**Setup:**

```bash
cd ui
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

**Start the app for Playwright:**

```bash
# Terminal 1: Start wails dev (sets E2E_KUBECONFIG in env)
E2E_KUBECONFIG=/tmp/clusterfudge-e2e.yaml wails dev

# Terminal 2: Run Playwright tests
cd ui && pnpm exec playwright test
```

**Playwright config (`ui/playwright.config.ts`):**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:34115',  // wails dev server port
    headless: false,  // Wails requires a visible window
  },
});
```

**Note:** Playwright tests complement (not replace) the Go e2e tests. The Go tests are faster and more reliable for backend logic. Playwright tests validate the full UI interaction flow.

### 2.3 Test Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `E2E_KUBECONFIG` | Yes | `$KUBECONFIG` | Path to kubeconfig for the test cluster |
| `E2E_NAMESPACE` | No | `clusterfudge-e2e` | Primary test namespace |
| `E2E_NAMESPACE_B` | No | `clusterfudge-e2e-b` | Secondary namespace for filter tests |
| `E2E_SKIP_HELM` | No | `""` | Set to `"true"` to skip Helm tests |
| `E2E_SKIP_PERF` | No | `""` | Set to `"true"` to skip performance tests |
| `E2E_LOG_LEVEL` | No | `"info"` | Log verbosity: `debug`, `info`, `warn` |

---

## 3. Cluster Connection Tests

**File:** `test/e2e/cluster_test.go`

### TC-CONN-001: Connect to k3s cluster via kubeconfig
- **Arrange:** Valid kubeconfig pointing to k3s. A `ClusterManager` with a `KubeconfigLoader` pointing to that file.
- **Act:** Call `manager.Connect(ctx, contextName)`.
- **Assert:**
  - Error is nil.
  - `manager.ActiveClient()` returns a non-nil `*ClientSet`.
  - The connection state is `StateConnected`.
  - `conn.Version` is non-empty and starts with `v`.

### TC-CONN-002: Verify cluster version is returned on connect
- **Arrange:** Same as TC-CONN-001.
- **Act:** After successful connect, read `conn.Version`.
- **Assert:** Version matches the k3s version string format `v1.28.x+k3s1`.

### TC-CONN-003: Verify namespace list is populated after connect
- **Arrange:** Connected cluster. Pre-create `clusterfudge-e2e` namespace.
- **Act:** Call `handler.ListNamespaces()`.
- **Assert:**
  - Return value contains at least `"default"`, `"kube-system"`, `"clusterfudge-e2e"`.
  - Error is nil.

### TC-CONN-004: Handle invalid kubeconfig — bad file path
- **Arrange:** `KubeconfigLoader` pointing to `/nonexistent/path/kubeconfig`.
- **Act:** Call `loader.Load()`.
- **Assert:** Error is non-nil and the error message contains "no such file" or similar.

### TC-CONN-005: Handle invalid kubeconfig — malformed YAML
- **Arrange:** Write a temp file containing `{not: valid: yaml: ::}`. Point loader at it.
- **Act:** Call `loader.Load()`.
- **Assert:** Error is non-nil.

### TC-CONN-006: Handle unreachable cluster — wrong server URL
- **Arrange:** Valid kubeconfig structure but with server URL `https://192.0.2.1:6443` (TEST-NET, unreachable).
- **Act:** Call `manager.Connect(ctx, contextName)` with a 5-second timeout on the context.
- **Assert:**
  - Error is non-nil.
  - Connection state is `StateError`.
  - Error message indicates a connection/timeout failure.

### TC-CONN-007: Handle expired/invalid credentials
- **Arrange:** Valid kubeconfig pointing at the real k3s server but with an invalid token: `token: invalid-token-abc123`.
- **Act:** Call `manager.Connect(ctx, contextName)`.
- **Assert:**
  - Error is non-nil.
  - Error contains "401" or "Unauthorized".

### TC-CONN-008: Reconnection after temporary network interruption
- **Arrange:** Connected cluster. Simulate network interruption by calling `manager.Disconnect()` then reconnect.
- **Act:** Call `manager.Connect(ctx, contextName)` again.
- **Assert:**
  - Reconnect succeeds (error is nil).
  - `manager.ActiveClient()` returns a usable client.
  - Can still list resources after reconnect.

### TC-CONN-009: Switch between two clusters
- **Arrange:** Start two k3s containers on ports 6443 and 6444. Create a merged kubeconfig with two contexts: `cluster-a` and `cluster-b`. Create a pod named `pod-a` in cluster-a and `pod-b` in cluster-b.
- **Act:**
  1. Connect to `cluster-a`.
  2. List pods — verify `pod-a` appears.
  3. Connect to `cluster-b`.
  4. List pods — verify `pod-b` appears, `pod-a` does not.
- **Assert:** Resource lists reflect the active cluster, not the previous one.

### TC-CONN-010: Disconnect and verify cleanup
- **Arrange:** Connected cluster. Start a watch via `service.Watch()`. Record goroutine count with `runtime.NumGoroutine()`.
- **Act:** Call `manager.Disconnect()`. Wait 2 seconds.
- **Assert:**
  - `manager.ActiveClient()` returns an error.
  - Goroutine count has not increased relative to baseline (no goroutine leak).
  - The watch channel is closed.

---

## 4. Resource Listing Tests

**File:** `test/e2e/resources_test.go`

For each resource type, the pattern is:
1. Create N test resources with known names.
2. Call the appropriate list function.
3. Assert the created resources appear in the response with correct fields.
4. Clean up.

### TC-LIST-001: List pods
- **Pre-condition:** Create a pod named `e2e-pod-list-<rand>` in `clusterfudge-e2e` running `nginx:latest`.
- **Act:** Call `service.List(ctx, client, ResourceQuery{Version: "v1", Resource: "pods", Namespace: "clusterfudge-e2e"})`.
- **Assert:** Response contains an item with `Name == "e2e-pod-list-<rand>"` and `Namespace == "clusterfudge-e2e"`.

### TC-LIST-002: List deployments with correct replica counts
- **Pre-condition:** Create a deployment `e2e-dep-list-<rand>` with `replicas: 2`. Wait for 2 pods to be Running.
- **Act:** List deployments. Find the created deployment.
- **Assert:** `spec["replicas"] == 2` and `status["readyReplicas"] == 2`.

### TC-LIST-003: List statefulsets
- **Pre-condition:** Create a StatefulSet `e2e-sts-<rand>` with 1 replica.
- **Act:** List `statefulsets` in the namespace.
- **Assert:** StatefulSet appears with correct name and namespace.

### TC-LIST-004: List daemonsets
- **Pre-condition:** k3s comes with `local-path-provisioner` daemonset in `kube-system`. Alternatively create one.
- **Act:** List `daemonsets` across all namespaces.
- **Assert:** At least one DaemonSet is returned.

### TC-LIST-005: List replicasets
- **Pre-condition:** Create a deployment (creates a ReplicaSet automatically).
- **Act:** List `replicasets` in the namespace.
- **Assert:** At least one ReplicaSet associated with the deployment appears.

### TC-LIST-006: List jobs and cronjobs
- **Pre-condition:** Create a Job `e2e-job-<rand>` that runs `echo done` and exits 0. Create a CronJob `e2e-cron-<rand>` scheduled `"*/1 * * * *"`.
- **Act:** List `jobs` and `cronjobs`.
- **Assert:** Both resources appear in their respective lists.

### TC-LIST-007: List services with correct type and ports
- **Pre-condition:** Create a ClusterIP Service `e2e-svc-<rand>` on port 80.
- **Act:** List `services` in the namespace.
- **Assert:** Service appears with `spec["type"] == "ClusterIP"` and port 80 in `spec["ports"]`.

### TC-LIST-008: List ingresses
- **Pre-condition:** Create an Ingress `e2e-ing-<rand>` pointing to the test service.
- **Act:** List `ingresses` (group: `networking.k8s.io`, version: `v1`).
- **Assert:** Ingress appears.

### TC-LIST-009: List configmaps and secrets
- **Pre-condition:** Create ConfigMap `e2e-cm-<rand>` with key `foo=bar`. Create Secret `e2e-sec-<rand>` with key `password=secret123`.
- **Act:** List `configmaps` and `secrets`.
- **Assert:** Both appear. Verify the ConfigMap's `data["foo"] == "bar"`. Verify the Secret appears (values may be base64-encoded).

### TC-LIST-010: List nodes
- **Act:** List `nodes` (cluster-scoped, no namespace).
- **Assert:** Exactly one node is returned (k3s single-node). Node has role label `node-role.kubernetes.io/control-plane`.

### TC-LIST-011: List namespaces
- **Act:** List `namespaces` (cluster-scoped).
- **Assert:** Response includes `default`, `kube-system`, `clusterfudge-e2e`.

### TC-LIST-012: List PVCs and PVs
- **Pre-condition:** Create a PVC `e2e-pvc-<rand>` requesting 1Gi using k3s's `local-path` StorageClass. Wait up to 30s for it to bind.
- **Act:** List `persistentvolumeclaims` in namespace. List `persistentvolumes` cluster-wide.
- **Assert:** PVC appears with `status["phase"] == "Bound"`. A corresponding PV appears.

### TC-LIST-013: List service accounts
- **Act:** List `serviceaccounts` in `clusterfudge-e2e`.
- **Assert:** At least the `default` service account appears.

### TC-LIST-014: List roles and rolebindings
- **Pre-condition:** Create a Role `e2e-role-<rand>` and a RoleBinding in `clusterfudge-e2e`.
- **Act:** List `roles` and `rolebindings`.
- **Assert:** Both resources appear.

### TC-LIST-015: List network policies
- **Pre-condition:** Create a NetworkPolicy `e2e-netpol-<rand>` in `clusterfudge-e2e`.
- **Act:** List `networkpolicies` (group: `networking.k8s.io`).
- **Assert:** NetworkPolicy appears.

### TC-LIST-016: List HPAs
- **Pre-condition:** Create a Deployment and an HPA `e2e-hpa-<rand>` targeting it.
- **Act:** List `horizontalpodautoscalers` (group: `autoscaling`).
- **Assert:** HPA appears.

### TC-LIST-017: List resource quotas and limit ranges
- **Pre-condition:** Create a ResourceQuota `e2e-quota-<rand>` and LimitRange `e2e-limits-<rand>`.
- **Act:** List both resource types.
- **Assert:** Both appear.

### TC-LIST-018: List events
- **Pre-condition:** Create a deployment. k3s will emit events for it.
- **Act:** List `events` in `clusterfudge-e2e`.
- **Assert:** At least one event related to the deployment appears.

### TC-LIST-019: List CRDs and custom resource instances
- **Pre-condition:**
  1. Apply the CRD fixture from `fixtures/widget-crd.yaml`.
  2. Create a custom resource instance from `fixtures/widget-instance.yaml`.
- **Act:** List `customresourcedefinitions` (cluster-scoped, group: `apiextensions.k8s.io`). Then list `widgets` (custom group: `example.com/v1alpha1`).
- **Assert:** CRD appears in the first list. Custom resource instance appears in the second.

### TC-LIST-020: Namespace filtering — resources isolated to namespace
- **Pre-condition:** Create pod `pod-ns-a` in `clusterfudge-e2e` and pod `pod-ns-b` in `clusterfudge-e2e-b`.
- **Act:** List pods with `Namespace: "clusterfudge-e2e"`. Then list pods with `Namespace: "clusterfudge-e2e-b"`.
- **Assert:** First list contains `pod-ns-a` but NOT `pod-ns-b`. Second list contains `pod-ns-b` but NOT `pod-ns-a`.

### TC-LIST-021: Empty namespace returns empty list
- **Pre-condition:** Ensure no pods exist in a freshly created temporary namespace.
- **Act:** List `pods` in that namespace.
- **Assert:** Returns empty slice (not nil) with no error.

---

## 5. Resource CRUD Tests

**File:** `test/e2e/crud_test.go`

### TC-CRUD-001: Create a deployment via YAML apply
- **Arrange:** Prepare a JSON/YAML representation of a Deployment named `e2e-create-dep-<rand>` with 1 replica.
- **Act:** Call `service.Apply(ctx, client, query, yamlBytes)` where `query.Resource = "deployments"`.
- **Assert:** No error. Subsequently `service.Get()` returns the deployment. `status["replicas"]` appears within 15s.

### TC-CRUD-002: Update a deployment — change replica count
- **Arrange:** Create a deployment with 1 replica (TC-CRUD-001). Wait for it to be available.
- **Act:** Apply the same YAML but with `replicas: 2`.
- **Assert:** Within 30s, `service.Get()` shows `spec["replicas"] == 2` and `status["readyReplicas"] == 2`.

### TC-CRUD-003: Delete a deployment and verify it's gone
- **Arrange:** Create a deployment.
- **Act:** Call `service.Delete(ctx, client, query)`.
- **Assert:** No error. Within 15s, `service.Get()` returns a 404 / not-found error.

### TC-CRUD-004: Create a configmap, update it, delete it
- **Arrange:** Prepare ConfigMap YAML with `data: {key: value1}`.
- **Act Step 1:** Apply the ConfigMap.
- **Assert Step 1:** `service.Get()` returns it with `data["key"] == "value1"`.
- **Act Step 2:** Apply updated ConfigMap with `data: {key: value2}`.
- **Assert Step 2:** `service.Get()` returns it with `data["key"] == "value2"`.
- **Act Step 3:** Delete the ConfigMap.
- **Assert Step 3:** `service.Get()` returns not-found error.

### TC-CRUD-005: Create a secret and verify values are masked in raw output
- **Arrange:** Create a Secret with `data: {password: "c2VjcmV0MTIz"}` (base64 for `secret123`).
- **Act:** Call `service.Get()` on the secret.
- **Assert:** The raw YAML/JSON shows `data.password` as the base64 value, NOT as plaintext. The type is `Opaque`.

### TC-CRUD-006: Create and delete a namespace
- **Arrange:** Generate name `e2e-ns-<rand>`.
- **Act Step 1:** Apply a Namespace resource.
- **Assert Step 1:** Namespace appears in `service.List()` for namespaces.
- **Act Step 2:** Delete the namespace.
- **Assert Step 2:** Within 30s, namespace no longer appears in the list.

### TC-CRUD-007: Create a service and verify endpoints populate
- **Arrange:** Create a Deployment with label `app: e2e-svc-test`. Create a Service selecting `app: e2e-svc-test`. Wait for pods to be Running.
- **Act:** List `endpoints` in the namespace.
- **Assert:** An Endpoints resource with the same name as the Service exists and has at least one address in `subsets`.

### TC-CRUD-008: Apply invalid YAML — verify error returned
- **Arrange:** Prepare malformed JSON: `{"not": "valid": "kubernetes": resource}`.
- **Act:** Call `service.Apply()`.
- **Assert:** Error is non-nil. Error message mentions parse/unmarshal failure or "invalid".

### TC-CRUD-009: Apply to non-existent namespace — verify error
- **Arrange:** Valid Deployment YAML targeting namespace `does-not-exist-xyz`.
- **Act:** Call `service.Apply()`.
- **Assert:** Error is non-nil. Error message indicates the namespace was not found.

### TC-CRUD-010: Delete non-existent resource — verify 404 error
- **Arrange:** Query targeting a pod named `does-not-exist-pod-xyz` in `clusterfudge-e2e`.
- **Act:** Call `service.Delete()`.
- **Assert:** Error is non-nil. Error contains "not found" or HTTP 404.

### TC-CRUD-011: Update with wrong resourceVersion — verify conflict error
- **Arrange:** Get a resource. Capture its `metadata.resourceVersion`. Modify the resource externally (update a label via kubectl). Now try to update using the OLD resourceVersion in the object metadata.
- **Act:** Call `service.Apply()` with the stale resourceVersion.
- **Assert:** Error is non-nil. Error contains "Conflict" or HTTP 409.

---

## 6. Resource Actions Tests

**File:** `test/e2e/actions_test.go`

### TC-ACT-001: Scale deployment from 1 to 3 replicas
- **Arrange:** Create deployment `e2e-scale-<rand>` with `replicas: 1`. Wait for 1 pod Running.
- **Act:** Patch the deployment's `spec.replicas` to 3 (or call `ScaleDeployment` handler).
- **Assert:** Within 60s, `status["readyReplicas"] == 3`. Listing pods in the namespace shows 3 pods owned by this deployment.

### TC-ACT-002: Scale deployment to 0 — verify pods terminate
- **Arrange:** Running deployment with 1 replica.
- **Act:** Scale to 0.
- **Assert:** Within 30s, no pods owned by this deployment exist. `status["readyReplicas"]` is 0.

### TC-ACT-003: Rolling restart deployment — verify pods get new UIDs
- **Arrange:** Create deployment `e2e-restart-<rand>` with 1 replica. Record the pod UID.
- **Act:** Patch the deployment annotation `kubectl.kubernetes.io/restartedAt` to the current RFC3339 timestamp.
- **Assert:** Within 60s, the old pod is gone and a new pod with a DIFFERENT UID is Running.

### TC-ACT-004: Cordon node — verify spec.unschedulable is true
- **Arrange:** Get the single k3s node name.
- **Act:** PATCH the node: `{"spec": {"unschedulable": true}}`.
- **Assert:** `service.Get()` on the node shows `spec["unschedulable"] == true`.
- **Cleanup:** Uncordon the node (critical — must restore schedulability).

### TC-ACT-005: Uncordon node — verify spec.unschedulable is false
- **Arrange:** Cordon the node first (TC-ACT-004).
- **Act:** PATCH the node: `{"spec": {"unschedulable": false}}`.
- **Assert:** `service.Get()` shows `spec["unschedulable"] == false` (or key absent).

### TC-ACT-006: Suspend a cronjob — verify spec.suspend is true
- **Arrange:** Create a CronJob `e2e-cron-suspend-<rand>` with schedule `"*/1 * * * *"`.
- **Act:** PATCH the CronJob: `{"spec": {"suspend": true}}`.
- **Assert:** `service.Get()` shows `spec["suspend"] == true`.

### TC-ACT-007: Create job from cronjob template
- **Arrange:** A CronJob with a job template that runs `echo "job-created"`.
- **Act:** Create a Job manually using the CronJob's job template spec.
- **Assert:** The Job appears in the `jobs` list. Within 60s, `status["succeeded"] == 1`.

---

## 7. Log Streaming Tests

**File:** `test/e2e/logs_test.go`

### TC-LOG-001: Start log stream and receive known content
- **Arrange:** Create a pod `e2e-logger-<rand>` running: `busybox sh -c 'while true; do echo "test-line-$(date +%s)"; sleep 1; done'`.  Wait for pod Running.
- **Act:** Call `streamer.Stream(ctx, opts, onLine)` with `Follow: true, TailLines: 10`.
- **Assert:** Within 5 seconds, `onLine` is called with a line containing `"test-line-"`. Collect 3 lines total.

### TC-LOG-002: Verify log lines arrive in order
- **Arrange:** Same logging pod as TC-LOG-001.
- **Act:** Collect 10 log lines.
- **Assert:** The numeric timestamp in each line is >= the previous line's timestamp (monotonically increasing).

### TC-LOG-003: Verify follow mode delivers new lines in real-time
- **Arrange:** Logging pod. Start stream with `Follow: true`. Collect initial lines.
- **Act:** Wait 3 seconds (3 new lines at 1/sec rate). Continue collecting.
- **Assert:** At least 3 new lines arrived after the initial collection, without restarting the stream.

### TC-LOG-004: Verify tail lines option
- **Arrange:** Pod that logs 100 lines rapidly on startup then stops (use `for i in seq 1 100; do echo "line $i"; done`). Wait for pod to Complete.
- **Act:** Call `Stream()` with `Follow: false, TailLines: 20`.
- **Assert:** Exactly 20 lines are received. Lines are the LAST 20 (contain `"line 81"` through `"line 100"`).

### TC-LOG-005: Retrieve previous container logs
- **Arrange:** Create a pod with restart policy `OnFailure` that exits 1 on first run. Wait for pod to restart at least once (status shows `restartCount >= 1`).
- **Act:** Call `Stream()` with `Previous: true`.
- **Assert:** Logs from the previous (crashed) container instance are returned. Current-run logs are NOT included.

### TC-LOG-006: Stop log stream — verify no more events received
- **Arrange:** Running logging pod. Start stream in a goroutine. Collect some lines.
- **Act:** Cancel the context passed to `Stream()`.
- **Assert:** The `Stream()` call returns (no hang). After cancellation, no more lines are sent to `onLine` even after waiting 3 seconds.

### TC-LOG-007: Log stream for non-existent pod — verify error
- **Arrange:** Query for a pod `does-not-exist-xyz` in `clusterfudge-e2e`.
- **Act:** Call `streamer.Stream()`.
- **Assert:** Error is returned immediately. Error contains "not found" or 404.

### TC-LOG-008: Multi-container pod — stream specific container
- **Arrange:** Create a pod with two containers:
  - `container-a`: logs `"container-a-line"` every second.
  - `container-b`: logs `"container-b-line"` every second.
- **Act:** Stream with `ContainerName: "container-a"`.
- **Assert:** All received lines contain `"container-a-line"`. No lines contain `"container-b-line"`.

### TC-LOG-009: Multi-container pod — stream without specifying container
- **Arrange:** Same multi-container pod.
- **Act:** Stream with empty `ContainerName`.
- **Assert:** Kubernetes defaults to the first container. Lines from only one container are returned without error.

---

## 8. Exec Session Tests

**File:** `test/e2e/exec_test.go`

### TC-EXEC-001: Open exec session to a pod
- **Arrange:** Create a pod `e2e-exec-<rand>` running `busybox` with command `sleep 3600`. Wait for Running.
- **Act:** Call `stream.StartExec()` with command `["/bin/sh"]` and `TTY: true`.
- **Assert:** No error. Session ID is returned. `onStdout` callback is eventually called (shell prompt).

### TC-EXEC-002: Send command and verify output
- **Arrange:** Running exec session from TC-EXEC-001.
- **Act:** Call `session.Write([]byte("echo hello\n"))`.
- **Assert:** Within 2 seconds, `onStdout` receives data containing `"hello"`.

### TC-EXEC-003: Terminal resize event
- **Arrange:** Running exec session.
- **Act:** Call `session.Resize(80, 24)` then `session.Resize(120, 40)`.
- **Assert:** No error. The resize doesn't crash the session. (Visual verification: run `stty size` via Write and check output matches 120 40.)

### TC-EXEC-004: Close exec session — verify cleanup
- **Arrange:** Running exec session.
- **Act:** Call `session.Close()`.
- **Assert:** Within 2 seconds, `onExit` callback is called. Attempting to `Write()` after close returns an error. The session is removed from the handler's session map.

### TC-EXEC-005: Exec into non-existent pod — verify error
- **Arrange:** `ExecOptions` targeting pod `does-not-exist-xyz`.
- **Act:** Call `stream.StartExec()`.
- **Assert:** Error is returned. `onStdout` is never called.

### TC-EXEC-006: Exec when RBAC denies — verify 403 error
- **Arrange:**
  1. Create a ServiceAccount `e2e-restricted-sa` with NO exec permissions (no Role/RoleBinding for `pods/exec`).
  2. Get the service account's token.
  3. Create a client using that token.
- **Act:** Attempt `StartExec()` using the restricted client.
- **Assert:** Error contains "forbidden" or HTTP 403.

---

## 9. Port Forwarding Tests

**File:** `test/e2e/portforward_test.go`

### TC-PF-001: Port forward to nginx pod and verify HTTP response
- **Arrange:** Create a pod `e2e-nginx-pf-<rand>` running `nginx:latest`. Wait for Running.
- **Act:** Call `handler.StartPortForward({Namespace: "clusterfudge-e2e", PodName: "e2e-nginx-pf-<rand>", PodPort: 80, LocalPort: 0})`. Use the returned `LocalPort`.
- **Assert:**
  - No error from `StartPortForward`.
  - HTTP GET to `http://localhost:<LocalPort>/` returns HTTP 200.
  - Response body contains `"Welcome to nginx"`.

### TC-PF-002: Stop port forward — verify port is released
- **Arrange:** Active port forward from TC-PF-001. Record the local port.
- **Act:** Call `handler.StopPortForward(podName, localPort)`.
- **Assert:** Within 2 seconds, HTTP GET to `http://localhost:<localPort>/` fails with a connection refused error.

### TC-PF-003: Port forward to a service (resolves to pod)
- **Arrange:** Nginx pod with a Service `e2e-nginx-svc-<rand>` selecting it.
- **Act:** Port forward targeting the Service (by resolving a pod from the Service's selector).
- **Assert:** Same as TC-PF-001 — HTTP GET succeeds.

### TC-PF-004: Port conflict — forward to already-bound port
- **Arrange:** Bind a socket to port 19999 in the test process. Attempt to start a port forward with `LocalPort: 19999`.
- **Act:** Call `StartPortForward()`.
- **Assert:** Error is non-nil. Error mentions port conflict or "address already in use".

### TC-PF-005: List active port forwards
- **Arrange:** Start two port forwards to different pods.
- **Act:** Call `handler.ListPortForwards()`.
- **Assert:** Returns a list with both port forwards. Each has correct `PodName`, `LocalPort`, `PodPort`.

---

## 10. Watch / Real-Time Update Tests

**File:** `test/e2e/watch_test.go`

### TC-WATCH-001: Watch pods — receive ADDED event on pod creation
- **Arrange:** Start a watch on `pods` in `clusterfudge-e2e`. Create a buffered channel for events.
- **Act:** Create a new pod `e2e-watch-add-<rand>`.
- **Assert:** Within 10 seconds, receive a `WatchEvent{Type: "ADDED", Resource.Name: "e2e-watch-add-<rand>"}`.

### TC-WATCH-002: Watch pods — receive MODIFIED event on label change
- **Arrange:** Create pod. Start watch. Wait for ADDED event.
- **Act:** Add a label `e2e-test: "modified"` to the pod via PATCH.
- **Assert:** Within 10 seconds, receive a `WatchEvent{Type: "MODIFIED", Resource.Name: ...}`. The resource's labels contain `e2e-test: "modified"`.

### TC-WATCH-003: Watch pods — receive DELETED event on pod deletion
- **Arrange:** Create pod. Start watch. Wait for ADDED event.
- **Act:** Delete the pod.
- **Assert:** Within 10 seconds, receive `WatchEvent{Type: "DELETED", Resource.Name: ...}`.

### TC-WATCH-004: Watch reconnection after context cancellation and restart
- **Arrange:** Start watch with context A. Receive some events.
- **Act:** Cancel context A (simulates disconnect). Start a NEW watch with context B.
- **Assert:** The new watch receives events for subsequently created/modified resources. The old channel is closed.

### TC-WATCH-005: Watch with namespace filter — correct isolation
- **Arrange:** Start a watch on `pods` in `clusterfudge-e2e` (NOT clusterfudge-e2e-b).
- **Act:**
  1. Create pod `pod-filtered-a` in `clusterfudge-e2e`.
  2. Create pod `pod-other-ns` in `clusterfudge-e2e-b`.
- **Assert:**
  - Event for `pod-filtered-a` IS received.
  - Event for `pod-other-ns` is NOT received (wait 5s to confirm absence).

### TC-WATCH-006: Watch delivers events for multiple rapid changes
- **Arrange:** Start watch on pods.
- **Act:** Create 5 pods rapidly (no sleep between creations).
- **Assert:** Within 20 seconds, receive ADDED events for all 5 pods. No events are dropped.

---

## 11. Helm Tests

**File:** `test/e2e/helm_test.go`

**Note:** Helm tests require the Helm SDK and a chart repository. Use a local chart for speed; see `fixtures/test-chart/`.

### TC-HELM-001: Install a Helm chart
- **Arrange:** A local Helm chart in `test/e2e/fixtures/test-chart/` (nginx with configurable replicas).
- **Act:** Call `client.InstallChart("e2e-release-<rand>", "clusterfudge-e2e", chartPath, values)`.
- **Assert:**
  - No error.
  - `client.ListReleases("clusterfudge-e2e")` returns a release with the given name and status `"deployed"`.

### TC-HELM-002: List releases — verify installed release appears
- **Arrange:** Installed release from TC-HELM-001.
- **Act:** Call `client.ListReleases("clusterfudge-e2e")`.
- **Assert:** Release with name `"e2e-release-<rand>"` appears. `Status == "deployed"`, `Revision == 1`.

### TC-HELM-003: Get release detail
- **Arrange:** Installed release.
- **Act:** Call `client.GetRelease("e2e-release-<rand>", "clusterfudge-e2e")`.
- **Assert:**
  - `ReleaseDetail.Values` contains the values passed at install time.
  - `ReleaseDetail.Manifest` is non-empty (contains rendered YAML).
  - `ReleaseDetail.Notes` may be empty (chart dependent).

### TC-HELM-004: Get release history
- **Arrange:** Installed release. Upgrade it once.
- **Act:** Call `client.GetReleaseHistory("e2e-release-<rand>", "clusterfudge-e2e")`.
- **Assert:** Returns 2 entries. First entry has `Revision == 1`, second has `Revision == 2`.

### TC-HELM-005: Upgrade release
- **Arrange:** Installed release with `replicas: 1`.
- **Act:** Upgrade with `replicas: 2`.
- **Assert:** `client.GetRelease()` shows `Revision == 2` and `Status == "deployed"`. The Deployment in k8s has `spec.replicas == 2`.

### TC-HELM-006: Rollback release to previous revision
- **Arrange:** Release at revision 2 (from TC-HELM-005).
- **Act:** Call `client.RollbackRelease("e2e-release-<rand>", "clusterfudge-e2e", 1)`.
- **Assert:** `client.GetRelease()` shows `Revision == 3` and `Status == "deployed"`. Deployment has `spec.replicas == 1` (original value).

### TC-HELM-007: Uninstall release — verify it's gone
- **Arrange:** Installed release.
- **Act:** Call `client.UninstallRelease("e2e-release-<rand>", "clusterfudge-e2e")`.
- **Assert:**
  - No error.
  - `client.ListReleases()` does NOT contain the release name.
  - Within 30s, the Deployment created by the chart is deleted from k8s.

---

## 12. Namespace Filtering Tests

**File:** `test/e2e/resources_test.go` (included in the filter test section)

### TC-NS-001: Filter to specific namespace
- **Pre-condition:** Pod `pod-ns-a` in `clusterfudge-e2e`, pod `pod-ns-b` in `clusterfudge-e2e-b`.
- **Act:** List pods with `Namespace: "clusterfudge-e2e"`.
- **Assert:** `pod-ns-a` is present, `pod-ns-b` is absent.

### TC-NS-002: All namespaces — both pods appear
- **Act:** List pods with `Namespace: ""` (empty = all namespaces).
- **Assert:** Both `pod-ns-a` and `pod-ns-b` appear.

### TC-NS-003: Switch namespace filter — counts update
- **Arrange:** 3 pods in `clusterfudge-e2e`, 1 pod in `clusterfudge-e2e-b`.
- **Act:** List with namespace A → count pods. List with namespace B → count pods. List with all → count pods.
- **Assert:** Counts are 3, 1, and 4 respectively.

### TC-NS-004: Delete active namespace — handle gracefully
- **Arrange:** Create namespace `e2e-temp-ns-<rand>`. Create a pod in it.
- **Act:** Delete the namespace. Immediately after, attempt to list pods in the deleted namespace.
- **Assert:** Error is non-nil OR returns empty list (either is acceptable). No panic. The app does not crash.

---

## 13. Error Handling Tests

**File:** `test/e2e/errors_test.go`

### TC-ERR-001: RBAC denied — verify 403 returned
- **Arrange:**
  1. Create ServiceAccount `e2e-no-perms-sa` in `clusterfudge-e2e` with NO cluster roles.
  2. Extract the SA's token.
  3. Build a `rest.Config` using that token.
  4. Create a `ClientSet` from that config.
- **Act:** Try to list `pods` in `kube-system` using the restricted client.
- **Assert:** Error is non-nil. Error contains "forbidden" or HTTP 403.

### TC-ERR-002: Resource not found — 404 error
- **Act:** Call `service.Get()` for pod `does-not-exist-xyz` in `clusterfudge-e2e`.
- **Assert:** Error is non-nil. `errors.IsNotFound(err)` returns true (from `k8s.io/apimachinery/pkg/api/errors`).

### TC-ERR-003: Conflict error — 409 on stale resourceVersion
- **Arrange:** Get a ConfigMap, capturing its `resourceVersion`. Update it externally to increment the version.
- **Act:** Try to apply the ConfigMap with the OLD `resourceVersion` in the metadata.
- **Assert:** Error is non-nil. `errors.IsConflict(err)` returns true.

### TC-ERR-004: Invalid YAML — parse error
- **Act:** Call `service.Apply()` with `data = []byte("not: valid: yaml: :")`.
- **Assert:** Error is non-nil. Error message mentions parsing or unmarshaling.

### TC-ERR-005: Server unreachable — connection error
- **Arrange:** A `rest.Config` pointing to `https://192.0.2.1:6443` with a 3-second timeout.
- **Act:** Attempt to list pods.
- **Assert:** Error is non-nil within the timeout. Error is a network/connection error (not a 4xx/5xx HTTP error).

### TC-ERR-006: Apply to wrong API group/version — API error
- **Act:** Call `service.Apply()` with `ResourceQuery{Group: "nonexistent.example.com", Version: "v1", Resource: "fakethings"}`.
- **Assert:** Error is non-nil. Error indicates the resource type was not found.

---

## 14. Performance Tests

**File:** `test/e2e/resources_test.go` (skip unless `E2E_SKIP_PERF != "true"`)

### TC-PERF-001: List 1000 pods within 5 seconds
- **Pre-condition:** Create a Deployment with 1000 replicas (or multiple deployments totaling 1000). Wait for all pods to be Running (may take several minutes — only measure the LIST, not the startup).
- **Act:** Call `service.List()` on pods. Measure elapsed time.
- **Assert:** Elapsed time < 5 seconds.

### TC-PERF-002: Watch 100 rapid modifications — no event loss
- **Arrange:** Create 100 ConfigMaps. Start a watch.
- **Act:** Update all 100 ConfigMaps within 10 seconds. Collect all MODIFIED events.
- **Assert:** Within 30 seconds of starting, receive at least 100 MODIFIED events (one per ConfigMap, though additional MODIFIED events are acceptable).

### TC-PERF-003: Five concurrent log streams — no cross-contamination
- **Arrange:** Create 5 pods, each logging a unique string (`"pod-1-line"`, `"pod-2-line"`, etc.) every 100ms.
- **Act:** Start 5 concurrent `streamer.Stream()` calls, one per pod.
- **Assert:**
  - Each stream's `onLine` callback only receives lines from its assigned pod (no cross-contamination).
  - All 5 streams continue receiving data for 10 seconds without dropping events.

### TC-PERF-004: Memory growth after loading 1000 pods
- **Arrange:** 1000-pod deployment from TC-PERF-001.
- **Act:** Call `service.List()` 10 times in a row. After the 10th call, force a GC and measure `runtime.MemStats.HeapAlloc`.
- **Assert:** Heap allocation does not grow linearly (i.e., memory is reused, not accumulated). The heap after 10 calls is within 2x the heap after the first call.

---

## 15. Test Fixtures Reference

All YAML fixtures are in `test/e2e/fixtures/`.

### Namespaces

**`fixtures/namespace-a.yaml`** — `clusterfudge-e2e`
**`fixtures/namespace-b.yaml`** — `clusterfudge-e2e-b`

### Workloads

**`fixtures/nginx-deployment.yaml`** — 1-replica nginx Deployment with stable label selectors
**`fixtures/scalable-deployment.yaml`** — Deployment for scaling tests (starts at 1 replica)
**`fixtures/multi-container-pod.yaml`** — Pod with `container-a` (logs container-a-line) and `container-b` (logs container-b-line)
**`fixtures/logging-pod.yaml`** — Pod running `while true; do echo "test-line-$(date +%s)"; sleep 1; done`
**`fixtures/crashing-pod.yaml`** — Pod that exits 1 on every run (to test previous-logs)
**`fixtures/batch-job.yaml`** — Job that runs `echo done` and completes
**`fixtures/cronjob.yaml`** — CronJob scheduled `"*/1 * * * *"`

### Networking

**`fixtures/clusterip-service.yaml`** — ClusterIP Service on port 80
**`fixtures/nodeport-service.yaml`** — NodePort Service
**`fixtures/ingress.yaml`** — Ingress rule for test service
**`fixtures/network-policy.yaml`** — NetworkPolicy denying all ingress

### Config

**`fixtures/configmap.yaml`** — ConfigMap with key `foo=bar`
**`fixtures/secret.yaml`** — Opaque Secret with key `password`

### Storage

**`fixtures/pvc.yaml`** — PVC requesting 1Gi from `local-path` StorageClass

### RBAC

**`fixtures/restricted-sa.yaml`** — ServiceAccount `e2e-no-perms-sa`
**`fixtures/test-role.yaml`** — Role granting read-only pod access
**`fixtures/test-rolebinding.yaml`** — RoleBinding for the test role

### Autoscaling

**`fixtures/hpa.yaml`** — HPA targeting the scalable deployment
**`fixtures/resource-quota.yaml`** — ResourceQuota for the test namespace
**`fixtures/limit-range.yaml`** — LimitRange for the test namespace

### Custom Resources

**`fixtures/widget-crd.yaml`** — CRD defining `widgets.example.com`
**`fixtures/widget-instance.yaml`** — A `Widget` custom resource instance

### Helm

**`fixtures/test-chart/`** — A minimal Helm chart (nginx with configurable replicas and a ConfigMap). Contains `Chart.yaml`, `values.yaml`, `templates/deployment.yaml`, `templates/service.yaml`.

---

*See `scripts/e2e-local.sh` for the complete local setup script and `.github/workflows/e2e.yml` for CI configuration.*
