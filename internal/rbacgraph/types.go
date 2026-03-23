package rbacgraph

type RBACGraph struct {
	Subjects []Subject     `json:"subjects"`
	Roles    []RoleNode    `json:"roles"`
	Bindings []BindingEdge `json:"bindings"`
}

type Subject struct {
	Kind      string `json:"kind"` // "User", "Group", "ServiceAccount"
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

type RoleNode struct {
	Kind      string       `json:"kind"` // "Role", "ClusterRole"
	Name      string       `json:"name"`
	Namespace string       `json:"namespace,omitempty"`
	Rules     []PolicyRule `json:"rules"`
}

type PolicyRule struct {
	Resources []string `json:"resources"`
	Verbs     []string `json:"verbs"`
	APIGroups []string `json:"apiGroups"`
}

type BindingEdge struct {
	BindingName string  `json:"bindingName"`
	BindingKind string  `json:"bindingKind"` // "RoleBinding", "ClusterRoleBinding"
	Subject     Subject `json:"subject"`
	RoleName    string  `json:"roleName"`
	RoleKind    string  `json:"roleKind"`
	Namespace   string  `json:"namespace,omitempty"`
}
