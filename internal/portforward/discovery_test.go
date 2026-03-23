package portforward

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDiscoverPortForwards_SinglePort(t *testing.T) {
	client := fake.NewSimpleClientset(&corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-api",
			Namespace: "default",
			Annotations: map[string]string{
				"clusterfudge.dev/port-forward": "true",
				"clusterfudge.dev/local-port":   "3000",
				"clusterfudge.dev/label":        "My API",
			},
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 8080}},
		},
	})

	results, err := DiscoverPortForwards(context.Background(), client, "default")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.ServiceName != "my-api" {
		t.Errorf("ServiceName = %q, want %q", r.ServiceName, "my-api")
	}
	if r.ServicePort != 8080 {
		t.Errorf("ServicePort = %d, want 8080", r.ServicePort)
	}
	if r.LocalPort != 3000 {
		t.Errorf("LocalPort = %d, want 3000", r.LocalPort)
	}
	if r.Label != "My API" {
		t.Errorf("Label = %q, want %q", r.Label, "My API")
	}
	if r.AutoStart {
		t.Error("AutoStart should be false")
	}
}

func TestDiscoverPortForwards_MultiPort(t *testing.T) {
	client := fake.NewSimpleClientset(&corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "multi-svc",
			Namespace: "prod",
			Annotations: map[string]string{
				"clusterfudge.dev/port-forwards": `[{"port":8080,"localPort":3000,"label":"HTTP"},{"port":9090,"localPort":9090,"label":"Metrics"}]`,
				"clusterfudge.dev/auto-start":    "true",
			},
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 8080}, {Port: 9090}},
		},
	})

	results, err := DiscoverPortForwards(context.Background(), client, "prod")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	if results[0].Label != "HTTP" || results[0].LocalPort != 3000 {
		t.Errorf("first entry: Label=%q LocalPort=%d", results[0].Label, results[0].LocalPort)
	}
	if results[1].Label != "Metrics" || results[1].LocalPort != 9090 {
		t.Errorf("second entry: Label=%q LocalPort=%d", results[1].Label, results[1].LocalPort)
	}
	if !results[0].AutoStart || !results[1].AutoStart {
		t.Error("both entries should have AutoStart=true")
	}
}

func TestDiscoverPortForwards_NoAnnotation(t *testing.T) {
	client := fake.NewSimpleClientset(&corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "plain-svc",
			Namespace: "default",
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	})

	results, err := DiscoverPortForwards(context.Background(), client, "default")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestDiscoverPortForwards_DefaultLabel(t *testing.T) {
	client := fake.NewSimpleClientset(&corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "backend",
			Namespace: "default",
			Annotations: map[string]string{
				"clusterfudge.dev/port-forward": "true",
			},
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 4000}},
		},
	})

	results, err := DiscoverPortForwards(context.Background(), client, "default")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Label != "backend" {
		t.Errorf("Label = %q, want %q (should default to service name)", results[0].Label, "backend")
	}
	if results[0].LocalPort != 4000 {
		t.Errorf("LocalPort = %d, want 4000 (should default to service port)", results[0].LocalPort)
	}
}

func TestDiscoverPortForwards_AllNamespaces(t *testing.T) {
	client := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "svc-a",
				Namespace: "ns1",
				Annotations: map[string]string{
					"clusterfudge.dev/port-forward": "true",
				},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{{Port: 80}},
			},
		},
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "svc-b",
				Namespace: "ns2",
				Annotations: map[string]string{
					"clusterfudge.dev/port-forward": "true",
				},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{{Port: 8080}},
			},
		},
	)

	results, err := DiscoverPortForwards(context.Background(), client, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results across all namespaces, got %d", len(results))
	}
}
