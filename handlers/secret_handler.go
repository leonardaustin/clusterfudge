package handlers

import (
	"context"
	"fmt"
	"time"

	"kubeviewer/internal/audit"
	"kubeviewer/internal/cluster"
	"kubeviewer/internal/security"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// SecretHandler exposes secret operations to the frontend.
type SecretHandler struct {
	manager     *cluster.Manager
	auditLogger *audit.Logger
}

// NewSecretHandler creates a SecretHandler.
func NewSecretHandler(mgr *cluster.Manager, auditLogger *audit.Logger) *SecretHandler {
	return &SecretHandler{manager: mgr, auditLogger: auditLogger}
}

// MaskedSecret is a secret with masked data values.
type MaskedSecret struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Type      string            `json:"type"`
	Data      map[string]string `json:"data"`
}

// GetSecret returns a secret with masked data values.
func (h *SecretHandler) GetSecret(namespace, name string) (*MaskedSecret, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("get secret: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	secret, err := cs.Typed.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get secret %s/%s: %w", namespace, name, err)
	}

	if h.auditLogger != nil {
		h.auditLogger.Log(audit.Entry{
			Action:    "secret.view",
			Kind:      "Secret",
			Name:      name,
			Namespace: namespace,
			Status:    "success",
		})
	}

	return &MaskedSecret{
		Name:      secret.Name,
		Namespace: secret.Namespace,
		Type:      string(secret.Type),
		Data:      security.MaskSecretData(secret.Data),
	}, nil
}

// RevealSecretKey reveals the raw value for a specific key in a secret.
func (h *SecretHandler) RevealSecretKey(namespace, name, key string) (string, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("reveal secret: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	secret, err := cs.Typed.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("get secret %s/%s: %w", namespace, name, err)
	}

	val, ok := security.RevealSecretValue(secret.Data, key)
	if !ok {
		return "", fmt.Errorf("key %q not found in secret %s/%s", key, namespace, name)
	}

	if h.auditLogger != nil {
		h.auditLogger.Log(audit.Entry{
			Action:    "secret.reveal",
			Kind:      "Secret",
			Name:      name,
			Namespace: namespace,
			Details:   fmt.Sprintf("key=%s", key),
			Status:    "success",
		})
	}

	return val, nil
}
