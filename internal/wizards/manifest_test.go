package wizards

import (
	"strings"
	"testing"
)

func TestDeploymentManifest(t *testing.T) {
	spec := DeploymentSpec{
		Name:          "web",
		Namespace:     "production",
		Image:         "nginx:1.25",
		Replicas:      3,
		ContainerPort: 80,
		CPURequest:    "100m",
		MemoryLimit:   "256Mi",
		EnvVars:       map[string]string{"ENV": "prod"},
		Labels:        map[string]string{"tier": "frontend"},
	}

	yaml, err := DeploymentManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, want := range []string{
		"apiVersion: apps/v1",
		"kind: Deployment",
		"name: web",
		"namespace: production",
		"image: nginx:1.25",
		"replicas: 3",
		"containerPort: 80",
		"cpu: 100m",
		"memory: 256Mi",
		"name: ENV",
		"value: prod",
		"tier: frontend",
	} {
		if !strings.Contains(yaml, want) {
			t.Errorf("manifest missing %q\nGot:\n%s", want, yaml)
		}
	}
}

func TestDeploymentManifest_Defaults(t *testing.T) {
	spec := DeploymentSpec{
		Name:  "app",
		Image: "busybox",
	}

	yaml, err := DeploymentManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(yaml, "namespace: default") {
		t.Error("expected default namespace")
	}
	if !strings.Contains(yaml, "replicas: 1") {
		t.Error("expected replicas default to 1")
	}
}

func TestDeploymentManifest_Validation(t *testing.T) {
	_, err := DeploymentManifest(DeploymentSpec{})
	if err == nil {
		t.Error("expected error for empty name")
	}

	_, err = DeploymentManifest(DeploymentSpec{Name: "x"})
	if err == nil {
		t.Error("expected error for empty image")
	}
}

func TestServiceManifest(t *testing.T) {
	spec := ServiceSpec{
		Name:      "web-svc",
		Namespace: "production",
		Type:      "LoadBalancer",
		Selector:  map[string]string{"app": "web"},
		Ports: []ServicePort{
			{Name: "http", Port: 80, TargetPort: 8080},
		},
	}

	yaml, err := ServiceManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, want := range []string{
		"apiVersion: v1",
		"kind: Service",
		"name: web-svc",
		"type: LoadBalancer",
		"port: 80",
		"targetPort: 8080",
		"name: http",
	} {
		if !strings.Contains(yaml, want) {
			t.Errorf("manifest missing %q\nGot:\n%s", want, yaml)
		}
	}
}

func TestServiceManifest_Validation(t *testing.T) {
	_, err := ServiceManifest(ServiceSpec{})
	if err == nil {
		t.Error("expected error for empty name")
	}

	_, err = ServiceManifest(ServiceSpec{Name: "svc"})
	if err == nil {
		t.Error("expected error for no ports")
	}
}

func TestConfigMapManifest(t *testing.T) {
	spec := ConfigMapSpec{
		Name:      "app-config",
		Namespace: "staging",
		Data: map[string]string{
			"key1": "value1",
		},
		Labels: map[string]string{"env": "staging"},
	}

	yaml, err := ConfigMapManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, want := range []string{
		"apiVersion: v1",
		"kind: ConfigMap",
		"name: app-config",
		"namespace: staging",
		"key1: value1",
		"env: staging",
	} {
		if !strings.Contains(yaml, want) {
			t.Errorf("manifest missing %q\nGot:\n%s", want, yaml)
		}
	}
}

func TestConfigMapManifest_Validation(t *testing.T) {
	_, err := ConfigMapManifest(ConfigMapSpec{})
	if err == nil {
		t.Error("expected error for empty name")
	}
}

func TestSecretManifest(t *testing.T) {
	spec := SecretSpec{
		Name:      "db-creds",
		Namespace: "production",
		Type:      "Opaque",
		Data: map[string]string{
			"username": "admin",
			"password": "secret123",
		},
		Labels: map[string]string{"app": "db"},
	}

	yaml, err := SecretManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, want := range []string{
		"apiVersion: v1",
		"kind: Secret",
		"name: db-creds",
		"namespace: production",
		"type: Opaque",
		"username: admin",
		"password: secret123",
	} {
		if !strings.Contains(yaml, want) {
			t.Errorf("manifest missing %q\nGot:\n%s", want, yaml)
		}
	}
}

func TestSecretManifest_Defaults(t *testing.T) {
	spec := SecretSpec{
		Name: "my-secret",
		Data: map[string]string{"key": "val"},
	}

	yaml, err := SecretManifest(spec)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(yaml, "namespace: default") {
		t.Error("expected default namespace")
	}
	if !strings.Contains(yaml, "type: Opaque") {
		t.Error("expected default type Opaque")
	}
}

func TestSecretManifest_Validation(t *testing.T) {
	_, err := SecretManifest(SecretSpec{})
	if err == nil {
		t.Error("expected error for empty name")
	}
}
