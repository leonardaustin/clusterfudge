package k8s

import (
	"testing"

	"k8s.io/client-go/rest"
)

func TestNewClientSet_ValidConfig(t *testing.T) {
	cfg := &rest.Config{Host: "https://127.0.0.1:6443"}
	cs, err := NewClientSet(cfg)
	if err != nil {
		t.Fatalf("NewClientSet: %v", err)
	}
	if cs.Typed == nil {
		t.Error("expected non-nil Typed client")
	}
	if cs.Dynamic == nil {
		t.Error("expected non-nil Dynamic client")
	}
	if cs.Config != cfg {
		t.Error("expected Config to be the same pointer")
	}
}

func TestNewClientSet_NilConfig(t *testing.T) {
	_, err := NewClientSet(nil)
	if err == nil {
		t.Error("expected error with nil config, got nil")
	}
}
