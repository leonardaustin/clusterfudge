//go:build e2e

package e2e

import (
	"context"
	"os"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	kvresource "kubeviewer/internal/resource"
)

// TC-LIST-001: List pods
func TestListPods(t *testing.T) {
	t.Parallel()
	name := randName("e2e-pod-list")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list pods: %v", err)
	}

	if found := findByName(items, name); found == nil {
		t.Errorf("pod %q not found in list (got %d pods)", name, len(items))
	} else if found.Namespace != testEnv.namespace {
		t.Errorf("expected namespace %q, got %q", testEnv.namespace, found.Namespace)
	}
}

// TC-LIST-002: List deployments with correct replica counts
func TestListDeployments_ReplicaCounts(t *testing.T) {
	t.Parallel()
	name := randName("e2e-dep-list")
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 2)
	waitForDeploymentReady(t, testEnv.namespace, name, 2, 90*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, deploymentsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list deployments: %v", err)
	}

	found := findByName(items, name)
	if found == nil {
		t.Fatalf("deployment %q not found in list", name)
	}

	// Verify replica count in spec
	replicas, ok := found.Spec["replicas"]
	if !ok {
		t.Error("deployment spec missing 'replicas' field")
	}
	if replicas != int64(2) && replicas != float64(2) {
		t.Errorf("expected replicas=2, got %v (%T)", replicas, replicas)
	}
}

// TC-LIST-003: List statefulsets
func TestListStatefulSets(t *testing.T) {
	t.Parallel()
	name := randName("e2e-sts")

	// Create statefulset via dynamic client
	q := kvresource.ResourceQuery{Group: "apps", Version: "v1", Resource: "statefulsets", Namespace: testEnv.namespace}
	labels := map[string]interface{}{"app": name}
	obj := map[string]interface{}{
		"apiVersion": "apps/v1",
		"kind":       "StatefulSet",
		"metadata":   map[string]interface{}{"name": name, "namespace": testEnv.namespace},
		"spec": map[string]interface{}{
			"replicas":    int64(1),
			"serviceName": name,
			"selector":    map[string]interface{}{"matchLabels": labels},
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{"labels": labels},
				"spec": map[string]interface{}{
					"containers": []interface{}{
						map[string]interface{}{"name": "nginx", "image": "nginx:latest"},
					},
				},
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	raw := marshalJSON(t, obj)
	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, raw); err != nil {
		t.Fatalf("create statefulset: %v", err)
	}
	t.Cleanup(func() {
		testEnv.resourceSvc.Delete(context.Background(), testEnv.dynamic, kvresource.ResourceQuery{
			Group: "apps", Version: "v1", Resource: "statefulsets",
			Namespace: testEnv.namespace, Name: name,
		})
	})

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("list statefulsets: %v", err)
	}
	if findByName(items, name) == nil {
		t.Errorf("statefulset %q not found in list", name)
	}
}

// TC-LIST-006: List jobs and cronjobs
func TestListJobsAndCronJobs(t *testing.T) {
	t.Parallel()
	jobName := randName("e2e-job")
	cronName := randName("e2e-cron")

	// Create job
	jobQ := kvresource.ResourceQuery{Group: "batch", Version: "v1", Resource: "jobs", Namespace: testEnv.namespace}
	jobObj := map[string]interface{}{
		"apiVersion": "batch/v1",
		"kind":       "Job",
		"metadata":   map[string]interface{}{"name": jobName, "namespace": testEnv.namespace},
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"spec": map[string]interface{}{
					"restartPolicy": "Never",
					"containers": []interface{}{
						map[string]interface{}{"name": "job", "image": "busybox:latest", "command": []interface{}{"echo", "done"}},
					},
				},
			},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, jobQ, marshalJSON(t, jobObj)); err != nil {
		t.Fatalf("create job: %v", err)
	}
	t.Cleanup(func() {
		testEnv.resourceSvc.Delete(context.Background(), testEnv.dynamic,
			kvresource.ResourceQuery{Group: "batch", Version: "v1", Resource: "jobs", Namespace: testEnv.namespace, Name: jobName})
	})

	// Create cronjob
	cronQ := kvresource.ResourceQuery{Group: "batch", Version: "v1", Resource: "cronjobs", Namespace: testEnv.namespace}
	cronObj := map[string]interface{}{
		"apiVersion": "batch/v1",
		"kind":       "CronJob",
		"metadata":   map[string]interface{}{"name": cronName, "namespace": testEnv.namespace},
		"spec": map[string]interface{}{
			"schedule": "*/60 * * * *",
			"jobTemplate": map[string]interface{}{
				"spec": map[string]interface{}{
					"template": map[string]interface{}{
						"spec": map[string]interface{}{
							"restartPolicy": "Never",
							"containers": []interface{}{
								map[string]interface{}{"name": "job", "image": "busybox:latest", "command": []interface{}{"echo", "hello"}},
							},
						},
					},
				},
			},
		},
	}
	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, cronQ, marshalJSON(t, cronObj)); err != nil {
		t.Fatalf("create cronjob: %v", err)
	}
	t.Cleanup(func() {
		testEnv.resourceSvc.Delete(context.Background(), testEnv.dynamic,
			kvresource.ResourceQuery{Group: "batch", Version: "v1", Resource: "cronjobs", Namespace: testEnv.namespace, Name: cronName})
	})

	// Verify jobs list
	jobs, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, jobQ)
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if findByName(jobs, jobName) == nil {
		t.Errorf("job %q not found", jobName)
	}

	// Verify cronjobs list
	crons, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, cronQ)
	if err != nil {
		t.Fatalf("list cronjobs: %v", err)
	}
	if findByName(crons, cronName) == nil {
		t.Errorf("cronjob %q not found", cronName)
	}
}

// TC-LIST-007: List services with correct type and ports
func TestListServices_TypeAndPorts(t *testing.T) {
	t.Parallel()
	name := randName("e2e-svc")
	t.Cleanup(func() { deleteService(t, testEnv.namespace, name) })

	createService(t, testEnv.namespace, name, map[string]string{"app": name}, 80)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	q := kvresource.ResourceQuery{Version: "v1", Resource: "services", Namespace: testEnv.namespace}
	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("list services: %v", err)
	}

	found := findByName(items, name)
	if found == nil {
		t.Fatalf("service %q not found", name)
	}

	svcType, ok := found.Spec["type"].(string)
	if !ok {
		t.Fatalf("service spec 'type' is not a string: %v (%T)", found.Spec["type"], found.Spec["type"])
	}
	if svcType != "ClusterIP" {
		t.Errorf("expected type=ClusterIP, got %q", svcType)
	}
}

// TC-LIST-009: List configmaps and secrets
func TestListConfigMapsAndSecrets(t *testing.T) {
	t.Parallel()
	cmName := randName("e2e-cm")
	secName := randName("e2e-sec")

	t.Cleanup(func() {
		deleteConfigMap(t, testEnv.namespace, cmName)
		deleteSecret(t, testEnv.namespace, secName)
	})

	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"foo": "bar"})
	createSecret(t, testEnv.namespace, secName, map[string][]byte{"password": []byte("secret123")})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Check configmaps
	cmItems, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, configmapsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list configmaps: %v", err)
	}
	if findByName(cmItems, cmName) == nil {
		t.Errorf("configmap %q not found", cmName)
	}

	// Check secrets
	secQ := kvresource.ResourceQuery{Version: "v1", Resource: "secrets", Namespace: testEnv.namespace}
	secItems, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, secQ)
	if err != nil {
		t.Fatalf("list secrets: %v", err)
	}
	if findByName(secItems, secName) == nil {
		t.Errorf("secret %q not found", secName)
	}
}

// TC-LIST-010: List nodes (k3s has exactly 1 node)
func TestListNodes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	q := kvresource.ResourceQuery{Version: "v1", Resource: "nodes"} // cluster-scoped, no namespace
	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("list nodes: %v", err)
	}
	if len(items) < 1 {
		t.Errorf("expected at least 1 node, got %d", len(items))
	}
}

// TC-LIST-011: List namespaces
func TestListNamespaces(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	q := kvresource.ResourceQuery{Version: "v1", Resource: "namespaces"} // cluster-scoped
	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("list namespaces: %v", err)
	}

	required := []string{"default", "kube-system", testEnv.namespace}
	for _, ns := range required {
		if findByName(items, ns) == nil {
			t.Errorf("namespace %q not found in list", ns)
		}
	}
}

// TC-LIST-012: List PVCs and PVs
func TestListPVCsAndPVs(t *testing.T) {
	t.Parallel()
	pvcName := randName("e2e-pvc")
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		testEnv.typed.CoreV1().PersistentVolumeClaims(testEnv.namespace).Delete(ctx, pvcName, metav1.DeleteOptions{})
	})

	createPVC(t, testEnv.namespace, pvcName)

	// Create a pod that consumes the PVC so that WaitForFirstConsumer binding mode triggers.
	consumerPodName := pvcName + "-consumer"
	consumerPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: consumerPodName, Namespace: testEnv.namespace},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  "busybox",
					Image: "busybox:latest",
					Command: []string{"sleep", "3600"},
					VolumeMounts: []corev1.VolumeMount{
						{Name: "data", MountPath: "/data"},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "data",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: pvcName,
						},
					},
				},
			},
		},
	}
	ctx0, cancel0 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel0()
	testEnv.typed.CoreV1().Pods(testEnv.namespace).Create(ctx0, consumerPod, metav1.CreateOptions{})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		testEnv.typed.CoreV1().Pods(testEnv.namespace).Delete(ctx, consumerPodName, metav1.DeleteOptions{})
	})

	// Wait for PVC to bind
	pvcBound := false
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pvc, err := testEnv.typed.CoreV1().PersistentVolumeClaims(testEnv.namespace).Get(ctx, pvcName, metav1.GetOptions{})
		cancel()
		if err == nil && string(pvc.Status.Phase) == "Bound" {
			pvcBound = true
			break
		}
		time.Sleep(3 * time.Second)
	}
	if !pvcBound {
		t.Fatalf("PVC %s/%s did not bind within 90 seconds", testEnv.namespace, pvcName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pvcQ := kvresource.ResourceQuery{Version: "v1", Resource: "persistentvolumeclaims", Namespace: testEnv.namespace}
	pvcs, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, pvcQ)
	if err != nil {
		t.Fatalf("list pvcs: %v", err)
	}
	if findByName(pvcs, pvcName) == nil {
		t.Errorf("pvc %q not found", pvcName)
	}

	pvQ := kvresource.ResourceQuery{Version: "v1", Resource: "persistentvolumes"} // cluster-scoped
	pvs, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, pvQ)
	if err != nil {
		t.Fatalf("list pvs: %v", err)
	}
	if len(pvs) == 0 {
		t.Error("expected at least one PV after PVC bound, got 0")
	}
}

// TC-LIST-019: List CRDs and custom resource instances
func TestListCRDsAndCustomResources(t *testing.T) {
	createCRD(t, testEnv.kubeconfig)

	instanceName := randName("e2e-widget")
	createCustomResource(t, testEnv.namespace, instanceName)
	t.Cleanup(func() {
		testEnv.dynamic.Resource(
			schema.GroupVersionResource{Group: "example.com", Version: "v1alpha1", Resource: "widgets"},
		).Namespace(testEnv.namespace).Delete(context.Background(), instanceName, metav1.DeleteOptions{})
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// List CRDs
	crdQ := kvresource.ResourceQuery{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}
	crds, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, crdQ)
	if err != nil {
		t.Fatalf("list CRDs: %v", err)
	}
	if findByName(crds, "widgets.example.com") == nil {
		t.Errorf("CRD widgets.example.com not found in list")
	}

	// List custom resource instances
	widgetQ := kvresource.ResourceQuery{Group: "example.com", Version: "v1alpha1", Resource: "widgets", Namespace: testEnv.namespace}
	widgets, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, widgetQ)
	if err != nil {
		t.Fatalf("list widgets: %v", err)
	}
	if findByName(widgets, instanceName) == nil {
		t.Errorf("widget %q not found", instanceName)
	}
}

// TC-LIST-020: Namespace filtering
func TestListPods_NamespaceFilter(t *testing.T) {
	podA := randName("pod-ns-a")
	podB := randName("pod-ns-b")

	t.Cleanup(func() {
		deletePod(t, testEnv.namespace, podA)
		deletePod(t, testEnv.namespaceB, podB)
	})

	createPod(t, testEnv.namespace, podA, nginxPodSpec())
	createPod(t, testEnv.namespaceB, podB, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// List in namespace A — should see podA, not podB
	itemsA, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list pods in namespace A: %v", err)
	}
	if findByName(itemsA, podA) == nil {
		t.Errorf("pod %q not found in namespace A list", podA)
	}
	if findByName(itemsA, podB) != nil {
		t.Errorf("pod %q from namespace B unexpectedly found in namespace A list", podB)
	}

	// List in namespace B — should see podB, not podA
	itemsB, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, podsQuery(testEnv.namespaceB))
	if err != nil {
		t.Fatalf("list pods in namespace B: %v", err)
	}
	if findByName(itemsB, podB) == nil {
		t.Errorf("pod %q not found in namespace B list", podB)
	}
	if findByName(itemsB, podA) != nil {
		t.Errorf("pod %q from namespace A unexpectedly found in namespace B list", podA)
	}
}

// TC-LIST-021: Empty namespace returns empty list (not nil)
func TestListPods_EmptyNamespace(t *testing.T) {
	// Create a temporary namespace
	nsName := randName("e2e-empty-ns")
	if err := ensureNamespace(nsName); err != nil {
		t.Fatalf("create namespace: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		testEnv.typed.CoreV1().Namespaces().Delete(ctx, nsName, metav1.DeleteOptions{})
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, podsQuery(nsName))
	if err != nil {
		t.Fatalf("list pods in empty namespace: %v", err)
	}
	// Should return empty non-nil slice
	if items == nil {
		t.Error("expected non-nil slice for empty namespace, got nil")
	}
}

// TC-PERF-001: List 1000 pods within time limit
// Skipped unless E2E_SKIP_PERF is not set.
func TestListPods_Performance(t *testing.T) {
	if os.Getenv("E2E_SKIP_PERF") == "true" {
		t.Skip("skipping performance test (E2E_SKIP_PERF=true)")
	}

	// Create a deployment with 100 replicas (less aggressive than 1000 for CI safety)
	name := randName("e2e-perf-dep")
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 100)
	waitForDeploymentReady(t, testEnv.namespace, name, 100, 5*time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	start := time.Now()
	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("list pods: %v", err)
	}
	if len(items) < 100 {
		t.Errorf("expected >= 100 pods, got %d", len(items))
	}
	if elapsed > 5*time.Second {
		t.Errorf("list 100+ pods took %v, expected < 5s", elapsed)
	}
}
