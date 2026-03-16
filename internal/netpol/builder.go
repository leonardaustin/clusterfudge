package netpol

import (
	"sort"
	"strings"
)

// Builder constructs network policy graphs.
type Builder struct{}

// NewBuilder creates a new network graph builder.
func NewBuilder() *Builder {
	return &Builder{}
}

// BuildGraph constructs a NetworkGraph from raw network policies and pods.
func (b *Builder) BuildGraph(policies, pods []map[string]any) *NetworkGraph {
	graph := &NetworkGraph{}

	// Group pods by namespace+labels
	groups := buildPodGroups(pods)
	isolatedGroups := findIsolatedGroups(policies, groups)

	for id, g := range groups {
		g.Isolated = isolatedGroups[id]
		graph.Groups = append(graph.Groups, g)
	}

	// Sort groups for deterministic output
	sort.Slice(graph.Groups, func(i, j int) bool {
		return graph.Groups[i].ID < graph.Groups[j].ID
	})

	// Build edges from policies
	for _, policy := range policies {
		edges := buildEdgesFromPolicy(policy, groups)
		graph.Edges = append(graph.Edges, edges...)
	}

	return graph
}

func buildPodGroups(pods []map[string]any) map[string]PodGroup {
	groups := make(map[string]PodGroup)

	for _, pod := range pods {
		meta, _ := pod["metadata"].(map[string]any)
		ns, _ := meta["namespace"].(string)
		labels, _ := meta["labels"].(map[string]any)

		labelMap := make(map[string]string)
		for k, v := range labels {
			if s, ok := v.(string); ok {
				labelMap[k] = s
			}
		}

		id := groupID(ns, labelMap)
		if g, exists := groups[id]; exists {
			g.PodCount++
			groups[id] = g
		} else {
			name, _ := meta["name"].(string)
			groups[id] = PodGroup{
				ID:        id,
				Name:      name,
				Namespace: ns,
				Labels:    labelMap,
				PodCount:  1,
			}
		}
	}

	return groups
}

func findIsolatedGroups(policies []map[string]any, groups map[string]PodGroup) map[string]bool {
	isolated := make(map[string]bool)

	for _, policy := range policies {
		spec, _ := policy["spec"].(map[string]any)
		meta, _ := policy["metadata"].(map[string]any)
		ns, _ := meta["namespace"].(string)
		podSelector, _ := spec["podSelector"].(map[string]any)

		for id, g := range groups {
			if g.Namespace == ns && matchesSelector(g.Labels, podSelector) {
				isolated[id] = true
			}
		}
	}

	return isolated
}

func buildEdgesFromPolicy(policy map[string]any, groups map[string]PodGroup) []NetworkEdge {
	var edges []NetworkEdge

	meta, _ := policy["metadata"].(map[string]any)
	policyName, _ := meta["name"].(string)
	policyNS, _ := meta["namespace"].(string)
	spec, _ := policy["spec"].(map[string]any)
	podSelector, _ := spec["podSelector"].(map[string]any)

	// Find target groups
	var targetIDs []string
	for id, g := range groups {
		if g.Namespace == policyNS && matchesSelector(g.Labels, podSelector) {
			targetIDs = append(targetIDs, id)
		}
	}

	// Process ingress rules
	ingress, _ := spec["ingress"].([]any)
	for _, rule := range ingress {
		rm, ok := rule.(map[string]any)
		if !ok {
			continue
		}

		ports := extractPorts(rm)
		from, _ := rm["from"].([]any)

		for _, f := range from {
			fm, ok := f.(map[string]any)
			if !ok {
				continue
			}
			peerSelector, _ := fm["podSelector"].(map[string]any)
			peerNSSelector, _ := fm["namespaceSelector"].(map[string]any)

			for sourceID, g := range groups {
				if !matchesPeer(g, peerSelector, peerNSSelector, policyNS) {
					continue
				}
				for _, targetID := range targetIDs {
					for _, p := range ports {
						edges = append(edges, NetworkEdge{
							From:      sourceID,
							To:        targetID,
							Port:      p.port,
							Protocol:  p.protocol,
							Allowed:   true,
							PolicyRef: policyName,
						})
					}
					if len(ports) == 0 {
						edges = append(edges, NetworkEdge{
							From:      sourceID,
							To:        targetID,
							Allowed:   true,
							PolicyRef: policyName,
						})
					}
				}
			}
		}
	}

	return edges
}

type portInfo struct {
	port     int
	protocol string
}

func extractPorts(rule map[string]any) []portInfo {
	var result []portInfo
	ports, _ := rule["ports"].([]any)
	for _, p := range ports {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		port := 0
		if v, ok := pm["port"].(float64); ok {
			port = int(v)
		}
		protocol := "TCP"
		if v, ok := pm["protocol"].(string); ok {
			protocol = v
		}
		result = append(result, portInfo{port: port, protocol: protocol})
	}
	return result
}

func matchesPeer(g PodGroup, podSelector, nsSelector map[string]any, policyNS string) bool {
	if nsSelector != nil {
		if !matchesSelector(map[string]string{"kubernetes.io/metadata.name": g.Namespace}, nsSelector) {
			return false
		}
	} else if g.Namespace != policyNS {
		return false
	}

	if podSelector != nil {
		return matchesSelector(g.Labels, podSelector)
	}
	return true
}

func matchesSelector(labels map[string]string, selector map[string]any) bool {
	if selector == nil {
		return true
	}
	matchLabels, _ := selector["matchLabels"].(map[string]any)
	if matchLabels == nil {
		// Empty selector matches all
		return true
	}
	for k, v := range matchLabels {
		s, ok := v.(string)
		if !ok {
			continue
		}
		if labels[k] != s {
			return false
		}
	}
	return true
}

func groupID(ns string, labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := []string{ns}
	for _, k := range keys {
		parts = append(parts, k+"="+labels[k])
	}
	return strings.Join(parts, "/")
}
