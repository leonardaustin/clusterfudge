package resource

// ResourceQuery identifies a Kubernetes resource type and optionally a
// specific instance by namespace and name.
type ResourceQuery struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

// ResourceItem is a normalised representation of a single Kubernetes resource.
type ResourceItem struct {
	Name      string                 `json:"name"`
	Namespace string                 `json:"namespace"`
	Labels    map[string]string      `json:"labels"`
	Spec      map[string]interface{} `json:"spec"`
	Status    map[string]interface{} `json:"status"`
	Raw       map[string]interface{} `json:"raw"`
}

// WatchEvent describes a change observed on a watched resource.
type WatchEvent struct {
	Type     string       `json:"type"` // "ADDED", "MODIFIED", "DELETED"
	Resource ResourceItem `json:"resource"`
}

// SearchResult represents a resource found by a cross-type search.
type SearchResult struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	GVR       string `json:"gvr"` // "group/version/resource"
}
