package handlers

import (
	"strings"
	"testing"

	"clusterfudge/internal/audit"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	kubefake "k8s.io/client-go/kubernetes/fake"
)

func newSecretManager(objects ...runtime.Object) *cluster.Manager {
	fakeClient := kubefake.NewClientset(objects...)
	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient})
	return mgr
}

func TestNewSecretHandler(t *testing.T) {
	mgr := cluster.NewManager()
	logger := audit.NewLogger()
	h := NewSecretHandler(mgr, logger)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestNewSecretHandler_NilLogger(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewSecretHandler(mgr, nil)
	if h == nil {
		t.Fatal("expected non-nil handler even with nil logger")
	}
}

func TestSecretHandler_GetSecret_Success(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-secret",
			Namespace: "default",
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username": []byte("admin"),
			"password": []byte("s3cret"),
		},
	}
	mgr := newSecretManager(secret)
	logger := audit.NewLogger()
	h := NewSecretHandler(mgr, logger)

	result, err := h.GetSecret("default", "my-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Name != "my-secret" {
		t.Errorf("expected name %q, got %q", "my-secret", result.Name)
	}
	if result.Namespace != "default" {
		t.Errorf("expected namespace %q, got %q", "default", result.Namespace)
	}
	if result.Type != string(corev1.SecretTypeOpaque) {
		t.Errorf("expected type %q, got %q", corev1.SecretTypeOpaque, result.Type)
	}
	// Data should be masked
	if result.Data["username"] != "******" {
		t.Errorf("expected masked username, got %q", result.Data["username"])
	}
	if result.Data["password"] != "******" {
		t.Errorf("expected masked password, got %q", result.Data["password"])
	}

	// Check audit log was recorded
	if logger.Count() != 1 {
		t.Errorf("expected 1 audit entry, got %d", logger.Count())
	}
}

func TestSecretHandler_GetSecret_MaskedValues(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "tls-secret",
			Namespace: "kube-system",
		},
		Type: corev1.SecretTypeTLS,
		Data: map[string][]byte{
			"tls.crt": []byte("cert-data-here"),
			"tls.key": []byte("key-data-here"),
		},
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil)

	result, err := h.GetSecret("kube-system", "tls-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify all keys are present but values are masked
	for _, key := range []string{"tls.crt", "tls.key"} {
		val, ok := result.Data[key]
		if !ok {
			t.Errorf("expected key %q in masked data", key)
			continue
		}
		if val != "******" {
			t.Errorf("expected masked value for %q, got %q", key, val)
		}
	}
}

func TestSecretHandler_GetSecret_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewSecretHandler(mgr, nil)

	_, err := h.GetSecret("default", "my-secret")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestSecretHandler_GetSecret_NotFound(t *testing.T) {
	mgr := newSecretManager() // no secrets
	h := NewSecretHandler(mgr, nil)

	_, err := h.GetSecret("default", "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent secret")
	}
}

func TestSecretHandler_GetSecret_EmptyData(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "empty-secret",
			Namespace: "default",
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{},
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil)

	result, err := h.GetSecret("default", "empty-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Data) != 0 {
		t.Errorf("expected empty data map, got %v", result.Data)
	}
}

func TestSecretHandler_GetSecret_NilData(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nil-data-secret",
			Namespace: "default",
		},
		Type: corev1.SecretTypeOpaque,
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil)

	result, err := h.GetSecret("default", "nil-data-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Data == nil {
		// MaskSecretData on nil returns an empty map
		t.Errorf("expected non-nil data map from masking nil input")
	}
}

func TestSecretHandler_GetSecret_NilLogger(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-secret",
			Namespace: "default",
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{"key": []byte("value")},
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil) // nil logger

	// Should not panic with nil logger
	result, err := h.GetSecret("default", "my-secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Name != "my-secret" {
		t.Errorf("expected name %q, got %q", "my-secret", result.Name)
	}
}

func TestSecretHandler_RevealSecretKey_Success(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{
			"username": []byte("admin"),
			"password": []byte("s3cret"),
		},
	}
	mgr := newSecretManager(secret)
	logger := audit.NewLogger()
	h := NewSecretHandler(mgr, logger)

	val, err := h.RevealSecretKey("default", "my-secret", "password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "s3cret" {
		t.Errorf("expected %q, got %q", "s3cret", val)
	}

	// Check audit log was recorded
	if logger.Count() != 1 {
		t.Errorf("expected 1 audit entry, got %d", logger.Count())
	}
	entries := logger.Query(audit.QueryFilter{})
	if entries[0].Action != "secret.reveal" {
		t.Errorf("expected action %q, got %q", "secret.reveal", entries[0].Action)
	}
	if !strings.Contains(entries[0].Details, "password") {
		t.Errorf("expected details to contain key name, got %q", entries[0].Details)
	}
}

func TestSecretHandler_RevealSecretKey_KeyNotFound(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{
			"username": []byte("admin"),
		},
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil)

	_, err := h.RevealSecretKey("default", "my-secret", "nonexistent-key")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}
	if !strings.Contains(err.Error(), "nonexistent-key") {
		t.Errorf("expected error to mention key name, got: %v", err)
	}
}

func TestSecretHandler_RevealSecretKey_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewSecretHandler(mgr, nil)

	_, err := h.RevealSecretKey("default", "my-secret", "key")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestSecretHandler_RevealSecretKey_SecretNotFound(t *testing.T) {
	mgr := newSecretManager() // no secrets
	h := NewSecretHandler(mgr, nil)

	_, err := h.RevealSecretKey("default", "nonexistent", "key")
	if err == nil {
		t.Fatal("expected error for nonexistent secret")
	}
}

func TestSecretHandler_RevealSecretKey_NilLogger(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{"key": []byte("value")},
	}
	mgr := newSecretManager(secret)
	h := NewSecretHandler(mgr, nil) // nil logger

	// Should not panic with nil logger
	val, err := h.RevealSecretKey("default", "my-secret", "key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "value" {
		t.Errorf("expected %q, got %q", "value", val)
	}
}

func TestSecretHandler_GetSecret_AuditEntry(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "audit-test",
			Namespace: "prod",
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{"token": []byte("abc")},
	}
	mgr := newSecretManager(secret)
	logger := audit.NewLogger()
	h := NewSecretHandler(mgr, logger)

	_, err := h.GetSecret("prod", "audit-test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries := logger.Query(audit.QueryFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 audit entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Action != "secret.view" {
		t.Errorf("expected action %q, got %q", "secret.view", e.Action)
	}
	if e.Kind != "Secret" {
		t.Errorf("expected kind %q, got %q", "Secret", e.Kind)
	}
	if e.Name != "audit-test" {
		t.Errorf("expected name %q, got %q", "audit-test", e.Name)
	}
	if e.Namespace != "prod" {
		t.Errorf("expected namespace %q, got %q", "prod", e.Namespace)
	}
	if e.Status != "success" {
		t.Errorf("expected status %q, got %q", "success", e.Status)
	}
}
