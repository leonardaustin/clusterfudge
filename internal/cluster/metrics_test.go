package cluster

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// newMetricsTestServer creates a test HTTP server and returns the server, a typed client,
// and a REST client suitable for MetricsCollector.
func newMetricsTestServer(t *testing.T, nodeMetrics *metricsNodeList, podMetrics *metricsPodList, nodes *corev1.NodeList) (*httptest.Server, kubernetes.Interface, rest.Interface) {
	t.Helper()
	mux := http.NewServeMux()

	if nodeMetrics != nil {
		mux.HandleFunc("/apis/metrics.k8s.io/v1beta1/nodes", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(nodeMetrics)
		})
	}

	if podMetrics != nil {
		mux.HandleFunc("/apis/metrics.k8s.io/v1beta1/pods", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(podMetrics)
		})
		mux.HandleFunc("/apis/metrics.k8s.io/v1beta1/namespaces/default/pods", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(podMetrics)
		})
	}

	if nodes != nil {
		mux.HandleFunc("/api/v1/nodes", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(nodes)
		})
	}

	server := httptest.NewServer(mux)

	cfg := &rest.Config{Host: server.URL}

	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatalf("create typed client: %v", err)
	}

	// Use the discovery client's REST client for raw API calls.
	restClient := client.Discovery().RESTClient()

	return server, client, restClient
}

func TestMetricsCollector_CollectNodeMetrics(t *testing.T) {
	nodeMetrics := &metricsNodeList{
		Items: []metricsNode{
			{
				Metadata: metav1.ObjectMeta{Name: "node-1"},
				Usage: map[string]resource.Quantity{
					"cpu":    resource.MustParse("500m"),
					"memory": resource.MustParse("1Gi"),
				},
			},
			{
				Metadata: metav1.ObjectMeta{Name: "node-2"},
				Usage: map[string]resource.Quantity{
					"cpu":    resource.MustParse("1000m"),
					"memory": resource.MustParse("2Gi"),
				},
			},
		},
	}

	server, _, restClient := newMetricsTestServer(t, nodeMetrics, nil, nil)
	defer server.Close()

	mc := NewMetricsCollector(restClient)
	results, err := mc.CollectNodeMetrics(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 node metrics, got %d", len(results))
	}

	if results[0].Name != "node-1" {
		t.Errorf("expected node-1, got %q", results[0].Name)
	}
	if results[0].CPU.UsedMillis != 500 {
		t.Errorf("expected 500 CPU millis for node-1, got %d", results[0].CPU.UsedMillis)
	}
	// 1Gi = 1024 MiB
	if results[0].Memory.UsedMillis != 1024 {
		t.Errorf("expected 1024 MiB for node-1, got %d", results[0].Memory.UsedMillis)
	}

	if results[1].Name != "node-2" {
		t.Errorf("expected node-2, got %q", results[1].Name)
	}
	if results[1].CPU.UsedMillis != 1000 {
		t.Errorf("expected 1000 CPU millis for node-2, got %d", results[1].CPU.UsedMillis)
	}
}

func TestMetricsCollector_CollectNodeMetrics_Unavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	restClient := client.Discovery().RESTClient()

	mc := NewMetricsCollector(restClient)
	results, err := mc.CollectNodeMetrics(context.Background())
	if err != nil {
		t.Fatalf("expected no error for unavailable metrics, got: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results for unavailable metrics, got %d items", len(results))
	}
}

func TestMetricsCollector_CollectPodMetrics(t *testing.T) {
	podMetrics := &metricsPodList{
		Items: []metricsPod{
			{
				Metadata: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"},
				Containers: []metricsContainer{
					{
						Name: "app",
						Usage: map[string]resource.Quantity{
							"cpu":    resource.MustParse("100m"),
							"memory": resource.MustParse("256Mi"),
						},
					},
				},
			},
		},
	}

	server, _, restClient := newMetricsTestServer(t, nil, podMetrics, nil)
	defer server.Close()

	mc := NewMetricsCollector(restClient)
	results, err := mc.CollectPodMetrics(context.Background(), "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(results))
	}
	if results[0].Name != "pod-1" {
		t.Errorf("expected pod-1, got %q", results[0].Name)
	}
	if len(results[0].Containers) != 1 {
		t.Fatalf("expected 1 container, got %d", len(results[0].Containers))
	}
	if results[0].Containers[0].CPUm != 100 {
		t.Errorf("expected 100 CPU millis, got %d", results[0].Containers[0].CPUm)
	}
	if results[0].Containers[0].MemMiB != 256 {
		t.Errorf("expected 256 MiB, got %d", results[0].Containers[0].MemMiB)
	}
}

func TestMetricsCollector_CollectPodMetrics_AllNamespaces(t *testing.T) {
	podMetrics := &metricsPodList{
		Items: []metricsPod{
			{
				Metadata: metav1.ObjectMeta{Name: "pod-1", Namespace: "ns-a"},
				Containers: []metricsContainer{
					{
						Name: "app",
						Usage: map[string]resource.Quantity{
							"cpu":    resource.MustParse("50m"),
							"memory": resource.MustParse("128Mi"),
						},
					},
				},
			},
		},
	}

	server, _, restClient := newMetricsTestServer(t, nil, podMetrics, nil)
	defer server.Close()

	mc := NewMetricsCollector(restClient)
	results, err := mc.CollectPodMetrics(context.Background(), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(results))
	}
}

func TestMetricsCollector_CollectSnapshot(t *testing.T) {
	nodeMetrics := &metricsNodeList{
		Items: []metricsNode{
			{
				Metadata: metav1.ObjectMeta{Name: "node-1"},
				Usage: map[string]resource.Quantity{
					"cpu":    resource.MustParse("500m"),
					"memory": resource.MustParse("1Gi"),
				},
			},
		},
	}

	nodes := &corev1.NodeList{
		Items: []corev1.Node{
			{
				ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
				Status: corev1.NodeStatus{
					Capacity: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("4000m"),
						corev1.ResourceMemory: resource.MustParse("8Gi"),
					},
				},
			},
		},
	}

	server, client, restClient := newMetricsTestServer(t, nodeMetrics, nil, nodes)
	defer server.Close()

	mc := NewMetricsCollector(restClient)
	snapshot, err := mc.CollectSnapshot(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(snapshot.NodeMetrics) != 1 {
		t.Fatalf("expected 1 node metric, got %d", len(snapshot.NodeMetrics))
	}

	nm := snapshot.NodeMetrics[0]
	if nm.CPU.UsedMillis != 500 {
		t.Errorf("expected 500 CPU millis used, got %d", nm.CPU.UsedMillis)
	}
	if nm.CPU.CapacityMillis != 4000 {
		t.Errorf("expected 4000 CPU millis capacity, got %d", nm.CPU.CapacityMillis)
	}
	if nm.CPU.Percentage < 12.4 || nm.CPU.Percentage > 12.6 {
		t.Errorf("expected ~12.5%% CPU usage, got %.2f%%", nm.CPU.Percentage)
	}

	if snapshot.ClusterCPU.UsedMillis != 500 {
		t.Errorf("expected 500 cluster CPU millis, got %d", snapshot.ClusterCPU.UsedMillis)
	}
	if snapshot.ClusterCPU.CapacityMillis != 4000 {
		t.Errorf("expected 4000 cluster CPU capacity, got %d", snapshot.ClusterCPU.CapacityMillis)
	}
}

func TestMetricsCollector_CollectSnapshot_NoMetricsServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	restClient := client.Discovery().RESTClient()

	mc := NewMetricsCollector(restClient)
	snapshot, err := mc.CollectSnapshot(context.Background(), client)
	if err != nil {
		t.Fatalf("expected no error when metrics-server unavailable, got: %v", err)
	}
	if snapshot.NodeMetrics != nil {
		t.Error("expected nil NodeMetrics when metrics-server unavailable")
	}
	if snapshot.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

func TestSafePercentage(t *testing.T) {
	tests := []struct {
		used, capacity int64
		expected       float64
	}{
		{0, 0, 0},
		{0, 100, 0},
		{50, 100, 50},
		{100, 100, 100},
		{200, 100, 200},
		{10, -1, 0},
	}
	for _, tt := range tests {
		result := safePercentage(tt.used, tt.capacity)
		if result != tt.expected {
			t.Errorf("safePercentage(%d, %d) = %.2f, want %.2f", tt.used, tt.capacity, result, tt.expected)
		}
	}
}
