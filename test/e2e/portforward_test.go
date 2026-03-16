//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"

	"kubeviewer/internal/stream"
)

// TC-PF-001: Port forward to nginx pod and verify HTTP response
func TestPortForward_NginxPod(t *testing.T) {
	t.Parallel()
	name := randName("e2e-nginx-pf")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, corev1.PodSpec{
		Containers: []corev1.Container{
			{Name: "nginx", Image: "nginx:latest", Ports: []corev1.ContainerPort{{ContainerPort: 80}}},
		},
	})
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	opts := stream.PortForwardOptions{
		Namespace: testEnv.namespace,
		PodName:   name,
		PodPort:   80,
		LocalPort: 0, // auto-assign
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := stream.StartPortForward(ctx, testEnv.typed, testEnv.clientSet.Config, opts)
	if err != nil {
		t.Fatalf("StartPortForward: %v", err)
	}
	defer stream.StopPortForward(result.LocalPort)

	// Give port forward a moment to establish
	time.Sleep(500 * time.Millisecond)

	// Verify HTTP GET returns nginx response
	url := fmt.Sprintf("http://localhost:%d/", result.LocalPort)
	httpClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpClient.Get(url)
	if err != nil {
		t.Fatalf("HTTP GET to port-forwarded nginx: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	bodyStr := string(body)
	if len(bodyStr) == 0 {
		t.Error("expected non-empty response body from nginx")
	}
}

// TC-PF-002: Stop port forward — verify port is released
func TestPortForward_StopReleasesPort(t *testing.T) {
	t.Parallel()
	name := randName("e2e-nginx-pf-stop")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, corev1.PodSpec{
		Containers: []corev1.Container{
			{Name: "nginx", Image: "nginx:latest", Ports: []corev1.ContainerPort{{ContainerPort: 80}}},
		},
	})
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	opts := stream.PortForwardOptions{
		Namespace: testEnv.namespace,
		PodName:   name,
		PodPort:   80,
		LocalPort: 0,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := stream.StartPortForward(ctx, testEnv.typed, testEnv.clientSet.Config, opts)
	if err != nil {
		t.Fatalf("StartPortForward: %v", err)
	}

	localPort := result.LocalPort

	// Verify it's working
	time.Sleep(500 * time.Millisecond)
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", localPort), 2*time.Second)
	if err != nil {
		t.Fatalf("expected port %d to be accessible, got: %v", localPort, err)
	}
	conn.Close()

	// Stop the port forward
	stream.StopPortForward(localPort)

	// Verify port is released
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", localPort), 500*time.Millisecond)
		if err != nil {
			return // port is no longer accessible — success
		}
		conn.Close()
		time.Sleep(500 * time.Millisecond)
	}
	t.Errorf("port %d still accessible 5s after stop", localPort)
}

// TC-PF-004: Port conflict — try to forward to an already-bound port
func TestPortForward_PortConflict(t *testing.T) {
	t.Parallel()
	name := randName("e2e-nginx-pf-conflict")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	// Bind a local port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("bind local port: %v", err)
	}
	defer listener.Close()

	boundPort := listener.Addr().(*net.TCPAddr).Port

	createPod(t, testEnv.namespace, name, corev1.PodSpec{
		Containers: []corev1.Container{
			{Name: "nginx", Image: "nginx:latest", Ports: []corev1.ContainerPort{{ContainerPort: 80}}},
		},
	})
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	opts := stream.PortForwardOptions{
		Namespace: testEnv.namespace,
		PodName:   name,
		PodPort:   80,
		LocalPort: boundPort, // already in use
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = stream.StartPortForward(ctx, testEnv.typed, testEnv.clientSet.Config, opts)
	if err == nil {
		t.Errorf("expected error for port conflict on port %d, got nil", boundPort)
	}
}
