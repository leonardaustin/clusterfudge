package rbacgraph

import "testing"

func TestBuildGraphBasic(t *testing.T) {
	b := NewBuilder()

	roles := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "pod-reader",
				"namespace": "default",
			},
			"rules": []any{
				map[string]any{
					"resources": []any{"pods"},
					"verbs":     []any{"get", "list"},
					"apiGroups": []any{""},
				},
			},
		},
	}

	bindings := []map[string]any{
		{
			"metadata": map[string]any{
				"name":      "read-pods",
				"namespace": "default",
			},
			"roleRef": map[string]any{
				"kind": "Role",
				"name": "pod-reader",
			},
			"subjects": []any{
				map[string]any{
					"kind":      "User",
					"name":      "jane",
					"namespace": "",
				},
			},
		},
	}

	graph := b.BuildGraph(roles, nil, bindings, nil)

	if len(graph.Roles) != 1 {
		t.Fatalf("expected 1 role, got %d", len(graph.Roles))
	}
	if graph.Roles[0].Name != "pod-reader" {
		t.Errorf("expected pod-reader, got %s", graph.Roles[0].Name)
	}
	if len(graph.Subjects) != 1 {
		t.Fatalf("expected 1 subject, got %d", len(graph.Subjects))
	}
	if graph.Subjects[0].Name != "jane" {
		t.Errorf("expected jane, got %s", graph.Subjects[0].Name)
	}
	if len(graph.Bindings) != 1 {
		t.Fatalf("expected 1 binding, got %d", len(graph.Bindings))
	}
	if graph.Bindings[0].RoleName != "pod-reader" {
		t.Errorf("expected binding to pod-reader, got %s", graph.Bindings[0].RoleName)
	}
}

func TestBuildGraphClusterRoles(t *testing.T) {
	b := NewBuilder()

	clusterRoles := []map[string]any{
		{
			"metadata": map[string]any{"name": "cluster-admin"},
			"rules": []any{
				map[string]any{
					"resources": []any{"*"},
					"verbs":     []any{"*"},
					"apiGroups": []any{"*"},
				},
			},
		},
	}

	clusterBindings := []map[string]any{
		{
			"metadata": map[string]any{"name": "admin-binding"},
			"roleRef": map[string]any{
				"kind": "ClusterRole",
				"name": "cluster-admin",
			},
			"subjects": []any{
				map[string]any{
					"kind": "Group",
					"name": "system:masters",
				},
			},
		},
	}

	graph := b.BuildGraph(nil, clusterRoles, nil, clusterBindings)

	if len(graph.Roles) != 1 {
		t.Fatalf("expected 1 role, got %d", len(graph.Roles))
	}
	if graph.Roles[0].Kind != "ClusterRole" {
		t.Errorf("expected ClusterRole, got %s", graph.Roles[0].Kind)
	}
	if len(graph.Bindings) != 1 {
		t.Fatalf("expected 1 binding, got %d", len(graph.Bindings))
	}
	if graph.Bindings[0].BindingKind != "ClusterRoleBinding" {
		t.Errorf("expected ClusterRoleBinding, got %s", graph.Bindings[0].BindingKind)
	}
}

func TestBuildGraphEmpty(t *testing.T) {
	b := NewBuilder()
	graph := b.BuildGraph(nil, nil, nil, nil)

	if len(graph.Subjects) != 0 {
		t.Errorf("expected 0 subjects, got %d", len(graph.Subjects))
	}
	if len(graph.Roles) != 0 {
		t.Errorf("expected 0 roles, got %d", len(graph.Roles))
	}
	if len(graph.Bindings) != 0 {
		t.Errorf("expected 0 bindings, got %d", len(graph.Bindings))
	}
}
