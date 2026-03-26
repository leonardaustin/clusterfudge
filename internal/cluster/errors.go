package cluster

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
)

// ErrorCode classifies errors into categories the frontend understands.
type ErrorCode string

const (
	ErrConnection ErrorCode = "CONNECTION_ERROR"
	ErrAuth       ErrorCode = "AUTH_ERROR"
	ErrForbidden  ErrorCode = "FORBIDDEN"
	ErrNotFound   ErrorCode = "NOT_FOUND"
	ErrConflict   ErrorCode = "CONFLICT"
	ErrTimeout    ErrorCode = "TIMEOUT"
	ErrValidation ErrorCode = "VALIDATION_ERROR"
	ErrServer     ErrorCode = "SERVER_ERROR"
	ErrUnknown    ErrorCode = "UNKNOWN"
)

// KubeError is the base error type for all structured cluster errors.
// It carries a machine-readable code, a human-readable message, optional
// detail, and supports error wrapping via Unwrap for errors.Is/As traversal.
type KubeError struct {
	Code      ErrorCode
	Message   string
	Detail    string
	Cause     error
	Retryable bool
}

func (e *KubeError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("[%s] %s: %s", e.Code, e.Message, e.Detail)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *KubeError) Unwrap() error { return e.Cause }

// ConnectionError indicates the API server cannot be reached (network, DNS, TLS).
type ConnectionError struct{ KubeError }

// AuthError indicates authentication failed (401 Unauthorized).
type AuthError struct{ KubeError }

// NotFoundError indicates the resource was not found (404).
type NotFoundError struct{ KubeError }

// ConflictError indicates a resource version conflict (409).
type ConflictError struct{ KubeError }

// ForbiddenError indicates insufficient RBAC permissions (403).
type ForbiddenError struct{ KubeError }

// TimeoutError indicates a context deadline exceeded or cancellation.
type TimeoutError struct{ KubeError }

// ValidationError indicates an invalid resource specification (422).
type ValidationError struct{ KubeError }

// kubeErrorer is implemented by KubeError and all typed variants via promotion.
// Used by WrapKubeError to detect already-wrapped errors.
type kubeErrorer interface {
	isKubeError()
}

func (*KubeError) isKubeError() {}

// IsNotFound returns true if err is a NotFoundError, a KubeError with ErrNotFound code,
// or a Kubernetes 404 status error.
func IsNotFound(err error) bool {
	var e *NotFoundError
	if errors.As(err, &e) {
		return true
	}
	var ke *KubeError
	if errors.As(err, &ke) {
		return ke.Code == ErrNotFound
	}
	return k8serrors.IsNotFound(err)
}

// IsForbidden returns true if err is a ForbiddenError, a KubeError with ErrForbidden code,
// or a Kubernetes 403 status error.
func IsForbidden(err error) bool {
	var e *ForbiddenError
	if errors.As(err, &e) {
		return true
	}
	var ke *KubeError
	if errors.As(err, &ke) {
		return ke.Code == ErrForbidden
	}
	return k8serrors.IsForbidden(err)
}

// IsConflict returns true if err is a ConflictError, a KubeError with ErrConflict code,
// or a Kubernetes 409 status error.
func IsConflict(err error) bool {
	var e *ConflictError
	if errors.As(err, &e) {
		return true
	}
	var ke *KubeError
	if errors.As(err, &ke) {
		return ke.Code == ErrConflict
	}
	return k8serrors.IsConflict(err)
}

// IsTimeout returns true if err is a TimeoutError, a KubeError with ErrTimeout code,
// or a context deadline/cancellation error.
func IsTimeout(err error) bool {
	var e *TimeoutError
	if errors.As(err, &e) {
		return true
	}
	var ke *KubeError
	if errors.As(err, &ke) {
		return ke.Code == ErrTimeout
	}
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)
}

// WrapKubeError classifies any error into the appropriate typed KubeError.
// Returns nil if err is nil. If err is already a KubeError (or typed variant),
// it is returned unchanged.
func WrapKubeError(err error) error {
	if err == nil {
		return nil
	}

	// Already wrapped — return as-is.
	var ke kubeErrorer
	if errors.As(err, &ke) {
		return err
	}

	// Kubernetes API status errors (4xx / 5xx).
	var statusErr *k8serrors.StatusError
	if errors.As(err, &statusErr) {
		return wrapStatusError(statusErr, err)
	}

	// Context deadline / cancellation.
	if errors.Is(err, context.DeadlineExceeded) {
		return &TimeoutError{KubeError{
			Code: ErrTimeout, Message: "Request timed out",
			Cause: err, Retryable: true,
		}}
	}
	if errors.Is(err, context.Canceled) {
		return &TimeoutError{KubeError{
			Code: ErrTimeout, Message: "Request was cancelled",
			Cause: err,
		}}
	}

	// Network errors.
	var netOpErr *net.OpError
	if errors.As(err, &netOpErr) {
		return &ConnectionError{KubeError{
			Code: ErrConnection, Message: "Cannot reach API server",
			Detail: netOpErr.Error(), Cause: err, Retryable: true,
		}}
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return &ConnectionError{KubeError{
			Code:    ErrConnection,
			Message: fmt.Sprintf("DNS lookup failed for %q", dnsErr.Name),
			Detail:  dnsErr.Error(), Cause: err, Retryable: true,
		}}
	}

	// HTTP client timeout (wraps differently than context.DeadlineExceeded).
	errStr := err.Error()
	if strings.Contains(errStr, "Client.Timeout exceeded") {
		return &TimeoutError{KubeError{
			Code: ErrTimeout, Message: "Connection timed out",
			Cause: err, Retryable: true,
		}}
	}

	// TLS certificate errors (detected by string matching).
	if strings.Contains(errStr, "x509:") || strings.Contains(errStr, "certificate") {
		return &ConnectionError{KubeError{
			Code: ErrConnection, Message: "TLS certificate error",
			Detail: errStr, Cause: err,
		}}
	}

	// Exec plugin / auth plugin errors.
	if strings.Contains(errStr, "exec plugin") || strings.Contains(errStr, "unable to connect to the server") {
		return &AuthError{KubeError{
			Code: ErrAuth, Message: "Authentication plugin failed",
			Detail: errStr, Cause: err, Retryable: true,
		}}
	}

	// Fallback: unknown error.
	return &KubeError{
		Code: ErrUnknown, Message: "An unexpected error occurred",
		Detail: err.Error(), Cause: err,
	}
}

// wrapStatusError converts a Kubernetes StatusError into the appropriate typed error.
func wrapStatusError(statusErr *k8serrors.StatusError, original error) error {
	code := statusErr.ErrStatus.Code
	message := statusErr.ErrStatus.Message
	reason := string(statusErr.ErrStatus.Reason)

	switch {
	case code == 401:
		return &AuthError{KubeError{
			Code: ErrAuth, Message: "Authentication failed",
			Detail: message, Cause: original, Retryable: true,
		}}
	case code == 403:
		return &ForbiddenError{KubeError{
			Code:    ErrForbidden,
			Message: fmt.Sprintf("Permission denied (%s)", reason),
			Detail:  message, Cause: original,
		}}
	case code == 404:
		return &NotFoundError{KubeError{
			Code:    ErrNotFound,
			Message: fmt.Sprintf("Resource not found (%s)", reason),
			Detail:  message, Cause: original,
		}}
	case code == 409:
		return &ConflictError{KubeError{
			Code: ErrConflict, Message: "Resource version conflict",
			Detail: message, Cause: original, Retryable: true,
		}}
	case code == 422:
		return &ValidationError{KubeError{
			Code: ErrValidation, Message: "Invalid resource specification",
			Detail: message, Cause: original,
		}}
	case code >= 500:
		return &KubeError{
			Code: ErrServer, Message: "API server error",
			Detail: message, Cause: original, Retryable: true,
		}
	default:
		return &KubeError{
			Code: ErrUnknown, Message: "Unexpected API error",
			Detail: message, Cause: original,
		}
	}
}
