package netpol

type NetworkGraph struct {
	Groups []PodGroup    `json:"groups"`
	Edges  []NetworkEdge `json:"edges"`
}

type PodGroup struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Labels    map[string]string `json:"labels"`
	PodCount  int               `json:"podCount"`
	Isolated  bool              `json:"isolated"`
}

type NetworkEdge struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Allowed   bool   `json:"allowed"`
	PolicyRef string `json:"policyRef"`
}
