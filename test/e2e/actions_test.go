//go:build e2e

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

// TC-ACT-001: Scale deployment from 1 to 3 replicas
func TestActions_ScaleDeploymentUp(t *testing.T) {
	t.Parallel()
	name := randName("e2e-scale-up")
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 1)
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 90*time.Second)

	// Patch replicas to 3
	patch := `{"spec":{"replicas":3}}`
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := testEnv.typed.AppsV1().Deployments(testEnv.namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("patch deployment replicas: %v", err)
	}

	waitForDeploymentReady(t, testEnv.namespace, name, 3, 120*time.Second)

	// Verify pod count
	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()
	pods, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).List(ctx2, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", name),
	})
	if err != nil {
		t.Fatalf("list pods: %v", err)
	}
	if len(pods.Items) != 3 {
		t.Errorf("expected 3 pods after scale, got %d", len(pods.Items))
	}
}

// TC-ACT-002: Scale deployment to 0 — verify pods terminate
func TestActions_ScaleDeploymentToZero(t *testing.T) {
	t.Parallel()
	name := randName("e2e-scale-zero")
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 1)
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 90*time.Second)

	patch := `{"spec":{"replicas":0}}`
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := testEnv.typed.AppsV1().Deployments(testEnv.namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("patch deployment to 0 replicas: %v", err)
	}

	// Wait for all pods to terminate
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		pods, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).List(ctx2, metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name),
		})
		cancel2()
		if err == nil && len(pods.Items) == 0 {
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatal("pods did not terminate within 60s after scaling to 0")
}

// TC-ACT-003: Rolling restart deployment — verify pods get new UIDs
func TestActions_RollingRestartDeployment(t *testing.T) {
	t.Parallel()
	name := randName("e2e-restart")
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 1)
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 90*time.Second)

	// Record original pod UID
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pods, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", name),
	})
	if err != nil || len(pods.Items) == 0 {
		t.Fatalf("list original pods: %v (count: %d)", err, len(pods.Items))
	}
	originalUID := string(pods.Items[0].UID)

	// Trigger rolling restart via annotation patch
	restartTime := time.Now().UTC().Format(time.RFC3339)
	patchData := map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{
					"annotations": map[string]interface{}{
						"kubectl.kubernetes.io/restartedAt": restartTime,
					},
				},
			},
		},
	}
	patchBytes, err := json.Marshal(patchData)
	if err != nil {
		t.Fatalf("marshal patch data: %v", err)
	}

	_, err = testEnv.typed.AppsV1().Deployments(testEnv.namespace).Patch(
		ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("patch restart annotation: %v", err)
	}

	// Wait for the deployment to roll out (old pod goes, new pod comes)
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 120*time.Second)

	// Verify new pod has different UID
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		newPods, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).List(ctx2, metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name),
		})
		cancel2()
		if err == nil {
			for _, p := range newPods.Items {
				if string(p.UID) != originalUID && p.Status.Phase == "Running" {
					return // success: new pod with different UID is running
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("no new pod with different UID found within 30s after restart")
}

// TC-ACT-004 & TC-ACT-005: Cordon and uncordon node
func TestActions_CordonUncordonNode(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the node name
	nodes, err := testEnv.typed.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil || len(nodes.Items) == 0 {
		t.Fatalf("list nodes: %v (count: %d)", err, len(nodes.Items))
	}
	nodeName := nodes.Items[0].Name

	// Ensure uncordoned at the end no matter what
	t.Cleanup(func() {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel2()
		_, err := testEnv.typed.CoreV1().Nodes().Patch(
			ctx2, nodeName, types.MergePatchType,
			[]byte(`{"spec":{"unschedulable":false}}`), metav1.PatchOptions{},
		)
		if err != nil {
			t.Errorf("CRITICAL: failed to uncordon node %q during cleanup: %v — subsequent tests will likely fail", nodeName, err)
		}
	})

	// Cordon
	_, err = testEnv.typed.CoreV1().Nodes().Patch(
		ctx, nodeName, types.MergePatchType,
		[]byte(`{"spec":{"unschedulable":true}}`), metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("cordon node: %v", err)
	}

	// Verify cordon
	node, err := testEnv.typed.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get node after cordon: %v", err)
	}
	if !node.Spec.Unschedulable {
		t.Error("expected node to be unschedulable after cordon")
	}

	// Uncordon
	_, err = testEnv.typed.CoreV1().Nodes().Patch(
		ctx, nodeName, types.MergePatchType,
		[]byte(`{"spec":{"unschedulable":false}}`), metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("uncordon node: %v", err)
	}

	// Verify uncordon
	node, err = testEnv.typed.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get node after uncordon: %v", err)
	}
	if node.Spec.Unschedulable {
		t.Error("expected node to be schedulable after uncordon")
	}
}

// TC-ACT-006: Suspend a cronjob
func TestActions_SuspendCronJob(t *testing.T) {
	t.Parallel()
	name := randName("e2e-cron-suspend")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cj := cronJobFixture(testEnv.namespace, name, "*/60 * * * *")
	_, err := testEnv.typed.BatchV1().CronJobs(testEnv.namespace).Create(ctx, cj, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create cronjob: %v", err)
	}
	t.Cleanup(func() {
		testEnv.typed.BatchV1().CronJobs(testEnv.namespace).Delete(
			context.Background(), name, metav1.DeleteOptions{},
		)
	})

	// Suspend
	suspended := true
	patch := map[string]interface{}{"spec": map[string]interface{}{"suspend": suspended}}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		t.Fatalf("marshal patch data: %v", err)
	}

	_, err = testEnv.typed.BatchV1().CronJobs(testEnv.namespace).Patch(
		ctx, name, types.MergePatchType, patchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("suspend cronjob: %v", err)
	}

	// Verify
	cjUpdated, err := testEnv.typed.BatchV1().CronJobs(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get cronjob after suspend: %v", err)
	}
	if cjUpdated.Spec.Suspend == nil || !*cjUpdated.Spec.Suspend {
		t.Error("expected spec.suspend=true after suspend")
	}
}
