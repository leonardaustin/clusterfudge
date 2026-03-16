package netpol

import "testing"

func TestBuildGraphPodGrouping(t *testing.T) {
	b := NewBuilder()

	pods := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "web-1",
				"namespace": "default",
				"labels":    map[string]any{"app": "web"},
			},
		},
		{
			"metadata": map[string]any{
				"name":      "web-2",
				"namespace": "default",
				"labels":    map[string]any{"app": "web"},
			},
		},
		{
			"metadata": map[string]any{
				"name":      "db-1",
				"namespace": "default",
				"labels":    map[string]any{"app": "db"},
			},
		},
	}

	graph := b.BuildGraph(nil, pods)

	if len(graph.Groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(graph.Groups))
	}

	for _, g := range graph.Groups {
		if g.Labels["app"] == "web" && g.PodCount != 2 {
			t.Errorf("expected web group to have 2 pods, got %d", g.PodCount)
		}
		if g.Labels["app"] == "db" && g.PodCount != 1 {
			t.Errorf("expected db group to have 1 pod, got %d", g.PodCount)
		}
	}
}

func TestBuildGraphWithPolicy(t *testing.T) {
	b := NewBuilder()

	pods := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "web-1",
				"namespace": "default",
				"labels":    map[string]any{"app": "web"},
			},
		},
		{
			"metadata": map[string]any{
				"name":      "api-1",
				"namespace": "default",
				"labels":    map[string]any{"app": "api"},
			},
		},
	}

	policies := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "allow-web-to-api",
				"namespace": "default",
			},
			"spec": map[string]any{
				"podSelector": map[string]any{
					"matchLabels": map[string]any{"app": "api"},
				},
				"ingress": []any{
					map[string]any{
						"from": []any{
							map[string]any{
								"podSelector": map[string]any{
									"matchLabels": map[string]any{"app": "web"},
								},
							},
						},
						"ports": []any{
							map[string]any{
								"port":     float64(8080),
								"protocol": "TCP",
							},
						},
					},
				},
			},
		},
	}

	graph := b.BuildGraph(policies, pods)

	if len(graph.Edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(graph.Edges))
	}

	edge := graph.Edges[0]
	if edge.Port != 8080 {
		t.Errorf("expected port 8080, got %d", edge.Port)
	}
	if !edge.Allowed {
		t.Error("expected edge to be allowed")
	}
	if edge.PolicyRef != "allow-web-to-api" {
		t.Errorf("expected policy ref allow-web-to-api, got %s", edge.PolicyRef)
	}
}

func TestBuildGraphIsolation(t *testing.T) {
	b := NewBuilder()

	pods := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "db-1",
				"namespace": "default",
				"labels":    map[string]any{"app": "db"},
			},
		},
	}

	policies := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "isolate-db",
				"namespace": "default",
			},
			"spec": map[string]any{
				"podSelector": map[string]any{
					"matchLabels": map[string]any{"app": "db"},
				},
			},
		},
	}

	graph := b.BuildGraph(policies, pods)

	if len(graph.Groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(graph.Groups))
	}
	if !graph.Groups[0].Isolated {
		t.Error("expected db group to be isolated")
	}
}

func TestBuildGraphEmpty(t *testing.T) {
	b := NewBuilder()
	graph := b.BuildGraph(nil, nil)

	if len(graph.Groups) != 0 {
		t.Errorf("expected 0 groups, got %d", len(graph.Groups))
	}
	if len(graph.Edges) != 0 {
		t.Errorf("expected 0 edges, got %d", len(graph.Edges))
	}
}
