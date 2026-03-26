package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	restclient "k8s.io/client-go/rest"
)

// metricsNodeList mirrors the metrics.k8s.io/v1beta1 NodeMetricsList response.
type metricsNodeList struct {
	Items []metricsNode `json:"items"`
}

type metricsNode struct {
	Metadata metav1.ObjectMeta            `json:"metadata"`
	Usage    map[string]resource.Quantity `json:"usage"`
}

// metricsPodList mirrors the metrics.k8s.io/v1beta1 PodMetricsList response.
type metricsPodList struct {
	Items []metricsPod `json:"items"`
}

type metricsPod struct {
	Metadata   metav1.ObjectMeta  `json:"metadata"`
	Containers []metricsContainer `json:"containers"`
}

type metricsContainer struct {
	Name  string                       `json:"name"`
	Usage map[string]resource.Quantity `json:"usage"`
}

// MetricsCollector fetches node and pod metrics from the metrics-server API.
// It uses a REST client for raw API access to the metrics.k8s.io endpoint,
// since the metrics API may not be available (no metrics-server installed).
type MetricsCollector struct {
	restClient restclient.Interface
}

// NewMetricsCollector creates a new metrics collector.
// The restClient should be capable of reaching the metrics.k8s.io API group.
// Typically built from rest.RESTClientFor with the cluster's rest.Config.
func NewMetricsCollector(restClient restclient.Interface) *MetricsCollector {
	return &MetricsCollector{restClient: restClient}
}

// CollectNodeMetrics fetches metrics for all nodes.
// Returns nil (not an error) if metrics-server is unavailable.
func (mc *MetricsCollector) CollectNodeMetrics(ctx context.Context) ([]NodeMetricsSummary, error) {
	data, err := mc.restClient.Get().AbsPath("/apis/metrics.k8s.io/v1beta1/nodes").DoRaw(ctx)
	if err != nil {
		return nil, nil
	}

	var nodeList metricsNodeList
	if err := json.Unmarshal(data, &nodeList); err != nil {
		return nil, fmt.Errorf("unmarshal node metrics: %w", err)
	}

	summaries := make([]NodeMetricsSummary, 0, len(nodeList.Items))
	for _, n := range nodeList.Items {
		cpuQ := n.Usage["cpu"]
		memQ := n.Usage["memory"]

		summaries = append(summaries, NodeMetricsSummary{
			Name: n.Metadata.Name,
			CPU: ResourceUsage{
				UsedMillis: cpuQ.MilliValue(),
			},
			Memory: ResourceUsage{
				UsedMillis: memQ.Value() / (1024 * 1024),
			},
		})
	}
	return summaries, nil
}

// CollectPodMetrics fetches metrics for pods in the given namespace.
// Pass "" for namespace to get metrics across all namespaces.
// Returns nil (not an error) if metrics-server is unavailable.
func (mc *MetricsCollector) CollectPodMetrics(ctx context.Context, namespace string) ([]PodMetricsSummary, error) {
	path := "/apis/metrics.k8s.io/v1beta1/pods"
	if namespace != "" {
		path = fmt.Sprintf("/apis/metrics.k8s.io/v1beta1/namespaces/%s/pods", namespace)
	}

	data, err := mc.restClient.Get().AbsPath(path).DoRaw(ctx)
	if err != nil {
		return nil, nil
	}

	var podList metricsPodList
	if err := json.Unmarshal(data, &podList); err != nil {
		return nil, fmt.Errorf("unmarshal pod metrics: %w", err)
	}

	summaries := make([]PodMetricsSummary, 0, len(podList.Items))
	for _, p := range podList.Items {
		containers := make([]ContainerMetricsSummary, 0, len(p.Containers))
		for _, c := range p.Containers {
			cpuQ := c.Usage["cpu"]
			memQ := c.Usage["memory"]
			containers = append(containers, ContainerMetricsSummary{
				Name:   c.Name,
				CPUm:   cpuQ.MilliValue(),
				MemMiB: memQ.Value() / (1024 * 1024),
			})
		}
		summaries = append(summaries, PodMetricsSummary{
			Name:       p.Metadata.Name,
			Namespace:  p.Metadata.Namespace,
			Containers: containers,
		})
	}
	return summaries, nil
}

// CollectSnapshot builds a full MetricsSnapshot with cluster-wide aggregation.
// It fetches node capacity from the Node API to calculate usage percentages.
// Returns an empty snapshot (not an error) if metrics-server is unavailable.
func (mc *MetricsCollector) CollectSnapshot(ctx context.Context, client kubernetes.Interface) (MetricsSnapshot, error) {
	snapshot := MetricsSnapshot{
		Timestamp: time.Now(),
	}

	nodeMetrics, err := mc.CollectNodeMetrics(ctx)
	if err != nil {
		return snapshot, err
	}
	if nodeMetrics == nil {
		return snapshot, nil
	}

	nodeList, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return snapshot, fmt.Errorf("list nodes: %w", err)
	}

	capacityMap := buildNodeCapacityMap(nodeList.Items)

	var totalCPUUsed, totalCPUCapacity, totalMemUsed, totalMemCapacity int64

	for i, nm := range nodeMetrics {
		if cap, ok := capacityMap[nm.Name]; ok {
			nodeMetrics[i].CPU.CapacityMillis = cap.cpuMillis
			nodeMetrics[i].CPU.Percentage = safePercentage(nm.CPU.UsedMillis, cap.cpuMillis)
			nodeMetrics[i].Memory.CapacityMillis = cap.memMiB
			nodeMetrics[i].Memory.Percentage = safePercentage(nm.Memory.UsedMillis, cap.memMiB)

			totalCPUCapacity += cap.cpuMillis
			totalMemCapacity += cap.memMiB
		}
		totalCPUUsed += nm.CPU.UsedMillis
		totalMemUsed += nm.Memory.UsedMillis
	}

	snapshot.NodeMetrics = nodeMetrics
	snapshot.ClusterCPU = ResourceUsage{
		UsedMillis:     totalCPUUsed,
		CapacityMillis: totalCPUCapacity,
		Percentage:     safePercentage(totalCPUUsed, totalCPUCapacity),
	}
	snapshot.ClusterMem = ResourceUsage{
		UsedMillis:     totalMemUsed,
		CapacityMillis: totalMemCapacity,
		Percentage:     safePercentage(totalMemUsed, totalMemCapacity),
	}

	return snapshot, nil
}

type nodeCapacity struct {
	cpuMillis int64
	memMiB    int64
}

func buildNodeCapacityMap(nodes []corev1.Node) map[string]nodeCapacity {
	m := make(map[string]nodeCapacity, len(nodes))
	for _, n := range nodes {
		m[n.Name] = nodeCapacity{
			cpuMillis: n.Status.Capacity.Cpu().MilliValue(),
			memMiB:    n.Status.Capacity.Memory().Value() / (1024 * 1024),
		}
	}
	return m
}

func safePercentage(used, capacity int64) float64 {
	if capacity <= 0 {
		return 0
	}
	return float64(used) / float64(capacity) * 100.0
}
