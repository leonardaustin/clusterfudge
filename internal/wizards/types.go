package wizards

// DeploymentSpec defines parameters for creating a Kubernetes Deployment.
type DeploymentSpec struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Image         string            `json:"image"`
	Replicas      int32             `json:"replicas"`
	ContainerPort int32             `json:"containerPort,omitempty"`
	Protocol      string            `json:"protocol,omitempty"`
	CPURequest    string            `json:"cpuRequest,omitempty"`
	CPULimit      string            `json:"cpuLimit,omitempty"`
	MemoryRequest string            `json:"memoryRequest,omitempty"`
	MemoryLimit   string            `json:"memoryLimit,omitempty"`
	EnvVars       map[string]string `json:"envVars,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// ServiceSpec defines parameters for creating a Kubernetes Service.
type ServiceSpec struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Type      string            `json:"type"`
	Selector  map[string]string `json:"selector"`
	Ports     []ServicePort     `json:"ports"`
}

// ServicePort defines a port mapping for a Service.
type ServicePort struct {
	Name       string `json:"name,omitempty"`
	Port       int32  `json:"port"`
	TargetPort int32  `json:"targetPort"`
	Protocol   string `json:"protocol,omitempty"`
}

// ConfigMapSpec defines parameters for creating a Kubernetes ConfigMap.
type ConfigMapSpec struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Data      map[string]string `json:"data"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// SecretSpec defines parameters for creating a Kubernetes Secret.
type SecretSpec struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Type      string            `json:"type,omitempty"` // Opaque, kubernetes.io/tls, etc.
	Data      map[string]string `json:"data"`
	Labels    map[string]string `json:"labels,omitempty"`
}
