package k8s

import (
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Core v1 resources.
var (
	GVRPods                   = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	GVRServices               = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	GVRConfigMaps             = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	GVRSecrets                = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
	GVRNamespaces             = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	GVRNodes                  = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "nodes"}
	GVRPersistentVolumes      = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumes"}
	GVRPersistentVolumeClaims = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	GVRServiceAccounts        = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "serviceaccounts"}
	GVREvents                 = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	GVREndpoints              = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "endpoints"}
	GVRResourceQuotas         = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "resourcequotas"}
	GVRLimitRanges            = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "limitranges"}
)

// Apps v1 resources.
var (
	GVRDeployments  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	GVRStatefulSets = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
	GVRDaemonSets   = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}
	GVRReplicaSets  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
)

// Batch v1 resources.
var (
	GVRJobs     = schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}
	GVRCronJobs = schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}
)

// Networking v1 resources.
var (
	GVRIngresses       = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	GVRNetworkPolicies = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	GVRIngressClasses  = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingressclasses"}
)

// RBAC v1 resources.
var (
	GVRRoles               = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"}
	GVRRoleBindings        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"}
	GVRClusterRoles        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"}
	GVRClusterRoleBindings = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"}
)

// Autoscaling v2 resources.
var (
	GVRHPAs = schema.GroupVersionResource{Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"}
)

// Policy v1 resources.
var (
	GVRPDBs = schema.GroupVersionResource{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"}
)

// Storage v1 resources.
var (
	GVRStorageClasses = schema.GroupVersionResource{Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"}
)

// CRD discovery.
var (
	GVRCRDs = schema.GroupVersionResource{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}
)

// gvrByResource maps plural resource names to their GVR for O(1) lookup.
var gvrByResource map[string]schema.GroupVersionResource

// kindToResource maps Kind names (e.g. "Deployment") to plural resource
// names (e.g. "deployments"). Covers all standard resources where simple
// pluralization (lowercase + "s") would produce incorrect results.
var kindToResource = map[string]string{
	"Ingress":             "ingresses",
	"IngressClass":        "ingressclasses",
	"NetworkPolicy":       "networkpolicies",
	"Endpoints":           "endpoints",
	"StorageClass":        "storageclasses",
	"PriorityClass":       "priorityclasses",
	"ResourceQuota":       "resourcequotas",
	"LimitRange":          "limitranges",
}

func init() {
	gvrs := AllCoreGVRs()
	gvrByResource = make(map[string]schema.GroupVersionResource, len(gvrs))
	for _, g := range gvrs {
		gvrByResource[g.Resource] = g
	}
}

// LookupGVR resolves a plural resource name (e.g. "deployments") to its GVR.
// Returns an error if the resource name is not recognized.
func LookupGVR(resourceName string) (schema.GroupVersionResource, error) {
	if g, ok := gvrByResource[resourceName]; ok {
		return g, nil
	}
	return schema.GroupVersionResource{}, fmt.Errorf("unknown resource %q", resourceName)
}

// LookupGVRByKind resolves a Kind name (e.g. "Deployment") to its GVR.
// Uses a known exceptions map for irregular plurals, falls back to
// lowercase + "s" for regular kinds.
func LookupGVRByKind(kind string) (schema.GroupVersionResource, error) {
	if res, ok := kindToResource[kind]; ok {
		return LookupGVR(res)
	}
	return LookupGVR(strings.ToLower(kind) + "s")
}

// AllCoreGVRs returns all GVRs that the application watches by default.
func AllCoreGVRs() []schema.GroupVersionResource {
	return []schema.GroupVersionResource{
		GVRPods, GVRServices, GVRConfigMaps, GVRSecrets,
		GVRNamespaces, GVRNodes,
		GVRPersistentVolumes, GVRPersistentVolumeClaims,
		GVRServiceAccounts, GVREvents, GVREndpoints,
		GVRResourceQuotas, GVRLimitRanges,
		GVRDeployments, GVRStatefulSets, GVRDaemonSets, GVRReplicaSets,
		GVRJobs, GVRCronJobs,
		GVRIngresses, GVRNetworkPolicies, GVRIngressClasses,
		GVRRoles, GVRRoleBindings, GVRClusterRoles, GVRClusterRoleBindings,
		GVRHPAs, GVRPDBs, GVRStorageClasses,
	}
}

// GVRDisplayName returns a human-friendly name for a GVR.
func GVRDisplayName(gvr schema.GroupVersionResource) string {
	names := map[string]string{
		"pods":                      "Pods",
		"services":                  "Services",
		"configmaps":               "ConfigMaps",
		"secrets":                  "Secrets",
		"namespaces":               "Namespaces",
		"nodes":                    "Nodes",
		"persistentvolumes":        "Persistent Volumes",
		"persistentvolumeclaims":   "Persistent Volume Claims",
		"serviceaccounts":          "Service Accounts",
		"events":                   "Events",
		"endpoints":                "Endpoints",
		"resourcequotas":           "Resource Quotas",
		"limitranges":              "Limit Ranges",
		"deployments":              "Deployments",
		"statefulsets":             "StatefulSets",
		"daemonsets":               "DaemonSets",
		"replicasets":              "ReplicaSets",
		"jobs":                     "Jobs",
		"cronjobs":                 "CronJobs",
		"ingresses":                "Ingresses",
		"networkpolicies":          "Network Policies",
		"roles":                    "Roles",
		"rolebindings":             "Role Bindings",
		"clusterroles":             "Cluster Roles",
		"clusterrolebindings":      "Cluster Role Bindings",
		"horizontalpodautoscalers": "Horizontal Pod Autoscalers",
		"poddisruptionbudgets":     "Pod Disruption Budgets",
		"storageclasses":           "Storage Classes",
		"customresourcedefinitions": "Custom Resource Definitions",
	}
	if name, ok := names[gvr.Resource]; ok {
		return name
	}
	return gvr.Resource
}

// IsNamespaced returns true if the given GVR is namespace-scoped.
func IsNamespaced(gvr schema.GroupVersionResource) bool {
	clusterScoped := map[string]bool{
		"namespaces":                true,
		"nodes":                     true,
		"persistentvolumes":         true,
		"clusterroles":              true,
		"clusterrolebindings":       true,
		"storageclasses":            true,
		"customresourcedefinitions": true,
		"ingressclasses":            true,
	}
	return !clusterScoped[gvr.Resource]
}

// ParseGVR parses a string like "apps/v1/deployments" into a GVR.
func ParseGVR(s string) (schema.GroupVersionResource, error) {
	parts := strings.Split(s, "/")
	switch len(parts) {
	case 2:
		// "v1/pods" -> group="", version="v1", resource="pods"
		return schema.GroupVersionResource{
			Group: "", Version: parts[0], Resource: parts[1],
		}, nil
	case 3:
		// "apps/v1/deployments" -> group="apps", version="v1", resource="deployments"
		return schema.GroupVersionResource{
			Group: parts[0], Version: parts[1], Resource: parts[2],
		}, nil
	default:
		return schema.GroupVersionResource{}, fmt.Errorf("invalid GVR string %q: expected group/version/resource", s)
	}
}
