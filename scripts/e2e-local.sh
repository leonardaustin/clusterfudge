#!/usr/bin/env bash
# scripts/e2e-local.sh
#
# Run KubeViewer e2e tests locally using podman + k3s.
#
# Usage:
#   ./scripts/e2e-local.sh [--keep] [--skip-helm] [--skip-perf] [TEST_FILTER]
#
# Options:
#   --keep          Keep the k3s container after tests complete (for debugging)
#   --skip-helm     Skip Helm tests
#   --skip-perf     Skip performance tests
#   TEST_FILTER     Optional Go test filter, e.g. "TestListPods"
#
# Requirements:
#   - podman
#   - go 1.22+
#   - kubectl (for pre-flight checks)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONTAINER_NAME="kubeviewer-e2e-k3s"
K3S_IMAGE="rancher/k3s:v1.28.5-k3s1"
K3S_HOST_PORT="16443"
KUBECONFIG_PATH="$(mktemp -t kubeviewer-e2e-XXXXXX.yaml)"
E2E_NAMESPACE="kubeviewer-e2e"
E2E_NAMESPACE_B="kubeviewer-e2e-b"
KEEP_CONTAINER=false
SKIP_HELM=false
SKIP_PERF=true
TEST_FILTER=""
TIMEOUT="15m"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)        KEEP_CONTAINER=true; shift ;;
    --skip-helm)   SKIP_HELM=true; shift ;;
    --skip-perf)   SKIP_PERF=true; shift ;;
    --no-skip-perf) SKIP_PERF=false; shift ;;
    *)             TEST_FILTER="$1"; shift ;;
  esac
done

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

log()  { echo -e "${GREEN}[e2e]${NC} $*"; }
warn() { echo -e "${YELLOW}[e2e]${NC} $*"; }
die()  { echo -e "${RED}[e2e ERROR]${NC} $*" >&2; exit 1; }

cleanup() {
  if [[ "$KEEP_CONTAINER" == "false" ]]; then
    log "Cleaning up k3s container..."
    podman stop "$CONTAINER_NAME" 2>/dev/null || true
    podman rm "$CONTAINER_NAME" 2>/dev/null || true
    rm -f "$KUBECONFIG_PATH"
    log "Cleanup complete."
  else
    warn "Keeping k3s container '$CONTAINER_NAME' (--keep specified)"
    warn "KUBECONFIG=$KUBECONFIG_PATH"
    warn "To stop: podman stop $CONTAINER_NAME && podman rm $CONTAINER_NAME"
  fi
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

log "Running pre-flight checks..."

command -v podman >/dev/null 2>&1 || die "podman is not installed or not in PATH"
command -v go >/dev/null 2>&1 || die "go is not installed or not in PATH"

go_version=$(go version | awk '{print $3}' | sed 's/go//')
required_version="1.22"
if ! printf '%s\n%s\n' "$required_version" "$go_version" | sort -V -C; then
  die "Go $required_version or later is required (found $go_version)"
fi

# ---------------------------------------------------------------------------
# Start k3s container
# ---------------------------------------------------------------------------

# Check if container already exists
if podman inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  status=$(podman inspect "$CONTAINER_NAME" --format '{{.State.Status}}')
  if [[ "$status" == "running" ]]; then
    warn "Container '$CONTAINER_NAME' already running — reusing it."
  else
    log "Removing stopped container '$CONTAINER_NAME'..."
    podman rm "$CONTAINER_NAME" 2>/dev/null || true
  fi
fi

if ! podman inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  log "Starting k3s container ($K3S_IMAGE)..."
  podman run -d \
    --name "$CONTAINER_NAME" \
    --privileged \
    -p "${K3S_HOST_PORT}:6443" \
    "$K3S_IMAGE" server \
      --disable traefik \
      --disable metrics-server \
      --tls-san 127.0.0.1 \
      --write-kubeconfig-mode 644
fi

# ---------------------------------------------------------------------------
# Wait for k3s to be ready
# ---------------------------------------------------------------------------

log "Waiting for k3s to be ready (up to 90 seconds)..."
deadline=$((SECONDS + 90))
while [[ $SECONDS -lt $deadline ]]; do
  output=$(podman exec "$CONTAINER_NAME" kubectl get nodes 2>/dev/null || true)
  if echo "$output" | grep -q " Ready"; then
    log "k3s is ready."
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

# Final check
if ! podman exec "$CONTAINER_NAME" kubectl get nodes 2>/dev/null | grep -q " Ready"; then
  die "k3s did not become ready within 90 seconds"
fi

# ---------------------------------------------------------------------------
# Extract kubeconfig
# ---------------------------------------------------------------------------

log "Extracting kubeconfig..."

podman exec "$CONTAINER_NAME" cat /etc/rancher/k3s/k3s.yaml > "$KUBECONFIG_PATH"

# Replace the internal server address with the host-mapped port
sed -i.bak "s|https://127.0.0.1:6443|https://127.0.0.1:${K3S_HOST_PORT}|g" "$KUBECONFIG_PATH"
sed -i.bak "s|https://localhost:6443|https://127.0.0.1:${K3S_HOST_PORT}|g" "$KUBECONFIG_PATH"
rm -f "${KUBECONFIG_PATH}.bak"
chmod 600 "$KUBECONFIG_PATH"

log "Kubeconfig written to: $KUBECONFIG_PATH"

# Verify connectivity
if ! kubectl --kubeconfig "$KUBECONFIG_PATH" cluster-info >/dev/null 2>&1; then
  die "Cannot connect to k3s cluster via kubeconfig"
fi

log "Cluster connectivity verified."

# ---------------------------------------------------------------------------
# Create test namespaces
# ---------------------------------------------------------------------------

log "Creating test namespaces..."
kubectl --kubeconfig "$KUBECONFIG_PATH" create namespace "$E2E_NAMESPACE" 2>/dev/null || true
kubectl --kubeconfig "$KUBECONFIG_PATH" create namespace "$E2E_NAMESPACE_B" 2>/dev/null || true

log "Namespaces ready:"
kubectl --kubeconfig "$KUBECONFIG_PATH" get namespaces

# ---------------------------------------------------------------------------
# Build test binary
# ---------------------------------------------------------------------------

log "Building e2e test binary..."
cd "$(dirname "$0")/.."

# Verify Go dependencies
if ! go mod verify 2>/dev/null; then
  warn "go mod verify failed — running go mod download..."
  go mod download
fi

# ---------------------------------------------------------------------------
# Run e2e tests
# ---------------------------------------------------------------------------

log "Running e2e tests..."
echo ""

export E2E_KUBECONFIG="$KUBECONFIG_PATH"
export E2E_NAMESPACE="$E2E_NAMESPACE"
export E2E_NAMESPACE_B="$E2E_NAMESPACE_B"
export E2E_SKIP_HELM="$SKIP_HELM"
export E2E_SKIP_PERF="$SKIP_PERF"

# Build the test args
test_args=(
  "-v"
  "-tags=e2e"
  "-timeout=${TIMEOUT}"
  "-race"
)

if [[ -n "$TEST_FILTER" ]]; then
  test_args+=("-run" "$TEST_FILTER")
fi

echo "Command: go test ${test_args[*]} ./test/e2e/..."
echo "KUBECONFIG: $KUBECONFIG_PATH"
echo "Namespace: $E2E_NAMESPACE"
echo "Skip Helm: $SKIP_HELM"
echo "Skip Perf: $SKIP_PERF"
echo ""

set +e  # Don't exit on test failure — we want cleanup to run
go test "${test_args[@]}" ./test/e2e/...
TEST_EXIT_CODE=$?
set -e

echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
  log "All e2e tests PASSED."
else
  warn "Some e2e tests FAILED (exit code: $TEST_EXIT_CODE)."
  warn "Cluster state for debugging:"
  kubectl --kubeconfig "$KUBECONFIG_PATH" get pods -n "$E2E_NAMESPACE" -o wide 2>/dev/null || true
  kubectl --kubeconfig "$KUBECONFIG_PATH" get events -n "$E2E_NAMESPACE" --sort-by='.lastTimestamp' 2>/dev/null | tail -20 || true
fi

exit $TEST_EXIT_CODE
