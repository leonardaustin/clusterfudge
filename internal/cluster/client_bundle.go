package cluster

import (
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ClientBundle holds all client variants for a single cluster connection.
// All fields except Metrics are guaranteed to be non-nil when the connection
// is in StateConnected. Metrics is nil if metrics-server is not available.
type ClientBundle struct {
	// Typed provides strongly typed access to core and extension API groups.
	Typed kubernetes.Interface

	// Dynamic provides unstructured access to any API resource, including CRDs.
	Dynamic dynamic.Interface

	// Discovery provides access to server API group and resource discovery.
	Discovery discovery.DiscoveryInterface

	// Metrics provides access to the metrics.k8s.io API (metrics-server).
	// This is nil if metrics-server is not installed in the cluster.
	Metrics metricsv.Interface

	// Config is the underlying REST configuration.
	Config *rest.Config
}

// HasMetrics returns true if the metrics-server client is available.
func (b *ClientBundle) HasMetrics() bool {
	return b.Metrics != nil
}
