package rbacgraph

// Builder constructs RBAC graphs from raw Kubernetes resources.
type Builder struct{}

// NewBuilder creates a new RBAC graph builder.
func NewBuilder() *Builder {
	return &Builder{}
}

// BuildGraph constructs an RBACGraph from raw JSON-decoded Kubernetes resources.
func (b *Builder) BuildGraph(roles, clusterRoles, bindings, clusterBindings []map[string]any) *RBACGraph {
	graph := &RBACGraph{}
	subjectSet := make(map[string]Subject)
	roleSet := make(map[string]RoleNode)

	for _, r := range roles {
		node := extractRole(r, "Role")
		key := "Role/" + node.Namespace + "/" + node.Name
		roleSet[key] = node
	}

	for _, r := range clusterRoles {
		node := extractRole(r, "ClusterRole")
		key := "ClusterRole//" + node.Name
		roleSet[key] = node
	}

	processBindings(bindings, "RoleBinding", graph, subjectSet)
	processBindings(clusterBindings, "ClusterRoleBinding", graph, subjectSet)

	for _, s := range subjectSet {
		graph.Subjects = append(graph.Subjects, s)
	}
	for _, r := range roleSet {
		graph.Roles = append(graph.Roles, r)
	}

	return graph
}

func processBindings(bindings []map[string]any, kind string, graph *RBACGraph, subjectSet map[string]Subject) {
	for _, binding := range bindings {
		meta, _ := binding["metadata"].(map[string]any)
		bindingName, _ := meta["name"].(string)
		bindingNS, _ := meta["namespace"].(string)

		roleRef, _ := binding["roleRef"].(map[string]any)
		roleName, _ := roleRef["name"].(string)
		roleKind, _ := roleRef["kind"].(string)

		subjects, _ := binding["subjects"].([]any)
		for _, s := range subjects {
			sm, ok := s.(map[string]any)
			if !ok {
				continue
			}
			subj := Subject{
				Kind:      getString(sm, "kind"),
				Name:      getString(sm, "name"),
				Namespace: getString(sm, "namespace"),
			}

			key := subj.Kind + "/" + subj.Namespace + "/" + subj.Name
			subjectSet[key] = subj

			graph.Bindings = append(graph.Bindings, BindingEdge{
				BindingName: bindingName,
				BindingKind: kind,
				Subject:     subj,
				RoleName:    roleName,
				RoleKind:    roleKind,
				Namespace:   bindingNS,
			})
		}
	}
}

func extractRole(raw map[string]any, kind string) RoleNode {
	meta, _ := raw["metadata"].(map[string]any)
	node := RoleNode{
		Kind:      kind,
		Name:      getString(meta, "name"),
		Namespace: getString(meta, "namespace"),
	}

	rules, _ := raw["rules"].([]any)
	for _, r := range rules {
		rm, ok := r.(map[string]any)
		if !ok {
			continue
		}
		node.Rules = append(node.Rules, PolicyRule{
			Resources: getStringSlice(rm, "resources"),
			Verbs:     getStringSlice(rm, "verbs"),
			APIGroups: getStringSlice(rm, "apiGroups"),
		})
	}
	return node
}

func getString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func getStringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	raw, _ := m[key].([]any)
	result := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			result = append(result, s)
		}
	}
	return result
}
