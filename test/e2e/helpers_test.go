//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	apiextensionsclient "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/tools/clientcmd"

	kvresource "clusterfudge/internal/resource"
)

// ---------------------------------------------------------------------------
// Watch event helpers
// ---------------------------------------------------------------------------

// collectWatchEvents collects events from a watch channel for the given duration.
func collectWatchEvents(ch <-chan kvresource.WatchEvent, duration time.Duration) []kvresource.WatchEvent {
	var events []kvresource.WatchEvent
	timer := time.NewTimer(duration)
	defer timer.Stop()
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return events
			}
			events = append(events, ev)
		case <-timer.C:
			return events
		}
	}
}

// assertEventReceived asserts that at least one event of the given type for the
// given resource name arrives on ch within timeout.
func assertEventReceived(t *testing.T, ch <-chan kvresource.WatchEvent, eventType, resourceName string, timeout time.Duration) {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatalf("watch channel closed before receiving %s event for %q", eventType, resourceName)
			}
			if ev.Type == eventType && ev.Resource.Name == resourceName {
				return
			}
		case <-deadline.C:
			t.Fatalf("timed out waiting for %s event for resource %q (waited %v)", eventType, resourceName, timeout)
		}
	}
}

// assertNoEventReceived asserts that no event for the named resource arrives for duration.
func assertNoEventReceived(t *testing.T, ch <-chan kvresource.WatchEvent, resourceName string, duration time.Duration) {
	t.Helper()
	timer := time.NewTimer(duration)
	defer timer.Stop()
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if ev.Resource.Name == resourceName {
				t.Fatalf("unexpected event %q received for resource %q", ev.Type, resourceName)
			}
		case <-timer.C:
			return
		}
	}
}

// ---------------------------------------------------------------------------
// Resource creation helpers
// ---------------------------------------------------------------------------

func createPod(t *testing.T, namespace, name string, spec corev1.PodSpec) {
	t.Helper()
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec:       spec,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().Pods(namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create pod %s/%s: %v", namespace, name, err)
	}
}

func deletePod(t *testing.T, namespace, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err := testEnv.typed.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil && !k8serrors.IsNotFound(err) {
		t.Logf("WARNING: cleanup failed for pod %s/%s: %v", namespace, name, err)
	}
}

func loggingPodSpec(message string) corev1.PodSpec {
	return corev1.PodSpec{
		RestartPolicy: corev1.RestartPolicyNever,
		Containers: []corev1.Container{
			{
				Name:    "logger",
				Image:   "busybox:latest",
				Command: []string{"/bin/sh", "-c"},
				Args:    []string{fmt.Sprintf("while true; do echo %q; sleep 1; done", message)},
			},
		},
	}
}

func nginxPodSpec() corev1.PodSpec {
	return corev1.PodSpec{
		Containers: []corev1.Container{
			{
				Name:  "nginx",
				Image: "nginx:latest",
				Ports: []corev1.ContainerPort{{ContainerPort: 80}},
			},
		},
	}
}

func createDeployment(t *testing.T, namespace, name string, replicas int32) {
	t.Helper()
	dep := deploymentFixture(namespace, name, replicas)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.AppsV1().Deployments(namespace).Create(ctx, dep, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create deployment %s/%s: %v", namespace, name, err)
	}
}

func deleteDeployment(t *testing.T, namespace, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err := testEnv.typed.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil && !k8serrors.IsNotFound(err) {
		t.Logf("WARNING: cleanup failed for deployment %s/%s: %v", namespace, name, err)
	}
}

func createConfigMap(t *testing.T, namespace, name string, data map[string]string) {
	t.Helper()
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().ConfigMaps(namespace).Create(ctx, cm, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create configmap %s/%s: %v", namespace, name, err)
	}
}

func deleteConfigMap(t *testing.T, namespace, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err := testEnv.typed.CoreV1().ConfigMaps(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil && !k8serrors.IsNotFound(err) {
		t.Logf("WARNING: cleanup failed for configmap %s/%s: %v", namespace, name, err)
	}
}

func createSecret(t *testing.T, namespace, name string, data map[string][]byte) {
	t.Helper()
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().Secrets(namespace).Create(ctx, sec, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create secret %s/%s: %v", namespace, name, err)
	}
}

func deleteSecret(t *testing.T, namespace, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err := testEnv.typed.CoreV1().Secrets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil && !k8serrors.IsNotFound(err) {
		t.Logf("WARNING: cleanup failed for secret %s/%s: %v", namespace, name, err)
	}
}

func createService(t *testing.T, namespace, name string, selector map[string]string, port int32) {
	t.Helper()
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: corev1.ServiceSpec{
			Selector: selector,
			Ports: []corev1.ServicePort{
				{Port: port, TargetPort: intstr.FromInt(int(port))},
			},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create service %s/%s: %v", namespace, name, err)
	}
}

func deleteService(t *testing.T, namespace, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err := testEnv.typed.CoreV1().Services(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil && !k8serrors.IsNotFound(err) {
		t.Logf("WARNING: cleanup failed for service %s/%s: %v", namespace, name, err)
	}
}

func createNetworkPolicy(t *testing.T, namespace, name string) {
	t.Helper()
	np := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.NetworkingV1().NetworkPolicies(namespace).Create(ctx, np, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create network policy %s/%s: %v", namespace, name, err)
	}
}

func createRole(t *testing.T, namespace, name string) {
	t.Helper()
	role := &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Rules: []rbacv1.PolicyRule{
			{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.RbacV1().Roles(namespace).Create(ctx, role, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create role %s/%s: %v", namespace, name, err)
	}
}

func createRoleBinding(t *testing.T, namespace, name, roleName, saName string) {
	t.Helper()
	rb := &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: roleName},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: saName, Namespace: namespace}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.RbacV1().RoleBindings(namespace).Create(ctx, rb, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create rolebinding %s/%s: %v", namespace, name, err)
	}
}

func createPVC(t *testing.T, namespace, name string) {
	t.Helper()
	storageClass := "local-path"
	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: corev1.PersistentVolumeClaimSpec{
			StorageClassName: &storageClass,
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("1Gi"),
				},
			},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().PersistentVolumeClaims(namespace).Create(ctx, pvc, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create pvc %s/%s: %v", namespace, name, err)
	}
}

func createCRD(t *testing.T, kubeconfigPath string) {
	t.Helper()
	cfg, err := clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	if err != nil {
		t.Fatalf("build config for CRD client: %v", err)
	}
	extClient, err := apiextensionsclient.NewForConfig(cfg)
	if err != nil {
		t.Fatalf("create apiextensions client: %v", err)
	}

	crd := &apiextensionsv1.CustomResourceDefinition{
		ObjectMeta: metav1.ObjectMeta{Name: "widgets.example.com"},
		Spec: apiextensionsv1.CustomResourceDefinitionSpec{
			Group: "example.com",
			Scope: apiextensionsv1.NamespaceScoped,
			Names: apiextensionsv1.CustomResourceDefinitionNames{
				Plural:   "widgets",
				Singular: "widget",
				Kind:     "Widget",
			},
			Versions: []apiextensionsv1.CustomResourceDefinitionVersion{
				{
					Name:    "v1alpha1",
					Served:  true,
					Storage: true,
					Schema: &apiextensionsv1.CustomResourceValidation{
						OpenAPIV3Schema: &apiextensionsv1.JSONSchemaProps{
							Type: "object",
							Properties: map[string]apiextensionsv1.JSONSchemaProps{
								"spec": {Type: "object", XPreserveUnknownFields: func() *bool { b := true; return &b }()},
							},
						},
					},
				},
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_, err = extClient.ApiextensionsV1().CustomResourceDefinitions().Create(ctx, crd, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create CRD: %v", err)
	}

	// Wait for CRD to be established
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		c, err := extClient.ApiextensionsV1().CustomResourceDefinitions().Get(ctx, "widgets.example.com", metav1.GetOptions{})
		if err == nil {
			for _, cond := range c.Status.Conditions {
				if cond.Type == apiextensionsv1.Established && cond.Status == apiextensionsv1.ConditionTrue {
					return
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatal("CRD widgets.example.com did not become established within 30s")
}

func createCustomResource(t *testing.T, namespace, name string) {
	t.Helper()
	gvr := schema.GroupVersionResource{Group: "example.com", Version: "v1alpha1", Resource: "widgets"}
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "example.com/v1alpha1",
			"kind":       "Widget",
			"metadata":   map[string]interface{}{"name": name, "namespace": namespace},
			"spec":       map[string]interface{}{"color": "blue", "size": "medium"},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.dynamic.Resource(gvr).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create custom resource %s/%s: %v", namespace, name, err)
	}
}

func createServiceAccount(t *testing.T, namespace, name string) {
	t.Helper()
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := testEnv.typed.CoreV1().ServiceAccounts(namespace).Create(ctx, sa, metav1.CreateOptions{})
	if err != nil && !k8serrors.IsAlreadyExists(err) {
		t.Fatalf("create serviceaccount %s/%s: %v", namespace, name, err)
	}
}

// ---------------------------------------------------------------------------
// Fixture constructors
// ---------------------------------------------------------------------------

func namespaceFixture(name string) *corev1.Namespace {
	return &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: map[string]string{"managed-by": "clusterfudge-e2e"},
		},
	}
}

func deploymentFixture(namespace, name string, replicas int32) *appsv1.Deployment {
	labels := map[string]string{"app": name}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "nginx",
							Image: "nginx:latest",
							Ports: []corev1.ContainerPort{{ContainerPort: 80}},
						},
					},
				},
			},
		},
	}
}

func cronJobFixture(namespace, name, schedule string) *batchv1.CronJob {
	return &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: batchv1.CronJobSpec{
			Schedule: schedule,
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							RestartPolicy: corev1.RestartPolicyOnFailure,
							Containers: []corev1.Container{
								{Name: "job", Image: "busybox:latest", Command: []string{"echo", "hello"}},
							},
						},
					},
				},
			},
		},
	}
}

// resourceListQuery builds a ResourceQuery for common resource types.
func resourceListQuery(group, version, resource, namespace string) kvresource.ResourceQuery {
	return kvresource.ResourceQuery{
		Group:     group,
		Version:   version,
		Resource:  resource,
		Namespace: namespace,
	}
}

// podsQuery returns a ResourceQuery for pods.
func podsQuery(namespace string) kvresource.ResourceQuery {
	return resourceListQuery("", "v1", "pods", namespace)
}

// deploymentsQuery returns a ResourceQuery for deployments.
func deploymentsQuery(namespace string) kvresource.ResourceQuery {
	return resourceListQuery("apps", "v1", "deployments", namespace)
}

// configmapsQuery returns a ResourceQuery for configmaps.
func configmapsQuery(namespace string) kvresource.ResourceQuery {
	return resourceListQuery("", "v1", "configmaps", namespace)
}

// findByName returns the first item with the given name from a slice.
func findByName(items []kvresource.ResourceItem, name string) *kvresource.ResourceItem {
	for i := range items {
		if items[i].Name == name {
			return &items[i]
		}
	}
	return nil
}
