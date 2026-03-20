package cluster

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// --- KubeError base ---

func TestKubeError_Error(t *testing.T) {
	tests := []struct {
		name   string
		err    *KubeError
		expect string
	}{
		{
			name:   "without detail",
			err:    &KubeError{Code: ErrUnknown, Message: "something broke"},
			expect: "[UNKNOWN] something broke",
		},
		{
			name:   "with detail",
			err:    &KubeError{Code: ErrServer, Message: "API error", Detail: "500 internal"},
			expect: "[SERVER_ERROR] API error: 500 internal",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.err.Error(); got != tt.expect {
				t.Errorf("got %q, want %q", got, tt.expect)
			}
		})
	}
}

func TestKubeError_Unwrap(t *testing.T) {
	cause := fmt.Errorf("root cause")
	ke := &KubeError{Code: ErrUnknown, Message: "wrapped", Cause: cause}
	if ke.Unwrap() != cause {
		t.Error("Unwrap did not return the cause")
	}
}

func TestKubeError_UnwrapNil(t *testing.T) {
	ke := &KubeError{Code: ErrUnknown, Message: "no cause"}
	if ke.Unwrap() != nil {
		t.Error("Unwrap should return nil when Cause is nil")
	}
}

// --- Typed error construction ---

func TestTypedErrors_ImplementErrorInterface(t *testing.T) {
	typed := []error{
		&ConnectionError{KubeError{Code: ErrConnection, Message: "conn"}},
		&AuthError{KubeError{Code: ErrAuth, Message: "auth"}},
		&NotFoundError{KubeError{Code: ErrNotFound, Message: "nf"}},
		&ConflictError{KubeError{Code: ErrConflict, Message: "conflict"}},
		&ForbiddenError{KubeError{Code: ErrForbidden, Message: "forbidden"}},
		&TimeoutError{KubeError{Code: ErrTimeout, Message: "timeout"}},
		&ValidationError{KubeError{Code: ErrValidation, Message: "validation"}},
	}
	for _, e := range typed {
		if e.Error() == "" {
			t.Errorf("Error() returned empty string for %T", e)
		}
	}
}

// --- errors.As support ---

func TestErrorsAs_ConnectionError(t *testing.T) {
	original := &ConnectionError{KubeError{Code: ErrConnection, Message: "net fail"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *ConnectionError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find ConnectionError")
	}
	if target.Code != ErrConnection {
		t.Errorf("code = %s, want %s", target.Code, ErrConnection)
	}
}

func TestErrorsAs_AuthError(t *testing.T) {
	original := &AuthError{KubeError{Code: ErrAuth, Message: "bad creds"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *AuthError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find AuthError")
	}
}

func TestErrorsAs_NotFoundError(t *testing.T) {
	original := &NotFoundError{KubeError{Code: ErrNotFound, Message: "gone"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *NotFoundError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find NotFoundError")
	}
}

func TestErrorsAs_ConflictError(t *testing.T) {
	original := &ConflictError{KubeError{Code: ErrConflict, Message: "conflict"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *ConflictError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find ConflictError")
	}
}

func TestErrorsAs_ForbiddenError(t *testing.T) {
	original := &ForbiddenError{KubeError{Code: ErrForbidden, Message: "denied"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *ForbiddenError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find ForbiddenError")
	}
}

func TestErrorsAs_TimeoutError(t *testing.T) {
	original := &TimeoutError{KubeError{Code: ErrTimeout, Message: "slow"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *TimeoutError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find TimeoutError")
	}
}

func TestErrorsAs_ValidationError(t *testing.T) {
	original := &ValidationError{KubeError{Code: ErrValidation, Message: "bad spec"}}
	wrapped := fmt.Errorf("outer: %w", original)

	var target *ValidationError
	if !errors.As(wrapped, &target) {
		t.Fatal("errors.As should find ValidationError")
	}
}

// --- errors.Is chain traversal ---

func TestErrorsIs_TraversesCauseChain(t *testing.T) {
	root := context.DeadlineExceeded
	te := &TimeoutError{KubeError{Code: ErrTimeout, Message: "timeout", Cause: root}}
	wrapped := fmt.Errorf("layer: %w", te)

	if !errors.Is(wrapped, context.DeadlineExceeded) {
		t.Error("errors.Is should traverse through TimeoutError.Cause to find DeadlineExceeded")
	}
}

func TestErrorsIs_NilCause(t *testing.T) {
	te := &TimeoutError{KubeError{Code: ErrTimeout, Message: "timeout"}}
	if errors.Is(te, context.DeadlineExceeded) {
		t.Error("should not match when Cause is nil")
	}
}

// --- IsNotFound ---

func TestIsNotFound_WithNotFoundError(t *testing.T) {
	err := &NotFoundError{KubeError{Code: ErrNotFound, Message: "gone"}}
	if !IsNotFound(err) {
		t.Error("IsNotFound should return true for NotFoundError")
	}
}

func TestIsNotFound_WithWrappedNotFoundError(t *testing.T) {
	err := fmt.Errorf("wrap: %w", &NotFoundError{KubeError{Code: ErrNotFound, Message: "gone"}})
	if !IsNotFound(err) {
		t.Error("IsNotFound should return true for wrapped NotFoundError")
	}
}

func TestIsNotFound_WithKubeErrorNotFoundCode(t *testing.T) {
	err := &KubeError{Code: ErrNotFound, Message: "not found via base"}
	if !IsNotFound(err) {
		t.Error("IsNotFound should return true for KubeError with ErrNotFound code")
	}
}

func TestIsNotFound_WithK8sNotFoundError(t *testing.T) {
	err := k8serrors.NewNotFound(schema.GroupResource{Group: "", Resource: "pods"}, "mypod")
	if !IsNotFound(err) {
		t.Error("IsNotFound should return true for k8s NotFound error")
	}
}

func TestIsNotFound_ReturnsFalse(t *testing.T) {
	if IsNotFound(fmt.Errorf("random error")) {
		t.Error("IsNotFound should return false for unrelated errors")
	}
}

// --- IsForbidden ---

func TestIsForbidden_WithForbiddenError(t *testing.T) {
	err := &ForbiddenError{KubeError{Code: ErrForbidden, Message: "denied"}}
	if !IsForbidden(err) {
		t.Error("IsForbidden should return true for ForbiddenError")
	}
}

func TestIsForbidden_WithWrappedForbiddenError(t *testing.T) {
	err := fmt.Errorf("wrap: %w", &ForbiddenError{KubeError{Code: ErrForbidden, Message: "denied"}})
	if !IsForbidden(err) {
		t.Error("IsForbidden should return true for wrapped ForbiddenError")
	}
}

func TestIsForbidden_WithK8sForbiddenError(t *testing.T) {
	err := k8serrors.NewForbidden(schema.GroupResource{Group: "", Resource: "secrets"}, "mysecret", fmt.Errorf("rbac"))
	if !IsForbidden(err) {
		t.Error("IsForbidden should return true for k8s Forbidden error")
	}
}

func TestIsForbidden_ReturnsFalse(t *testing.T) {
	if IsForbidden(fmt.Errorf("random error")) {
		t.Error("IsForbidden should return false for unrelated errors")
	}
}

// --- IsConflict ---

func TestIsConflict_WithConflictError(t *testing.T) {
	err := &ConflictError{KubeError{Code: ErrConflict, Message: "conflict"}}
	if !IsConflict(err) {
		t.Error("IsConflict should return true for ConflictError")
	}
}

func TestIsConflict_WithWrappedConflictError(t *testing.T) {
	err := fmt.Errorf("wrap: %w", &ConflictError{KubeError{Code: ErrConflict, Message: "conflict"}})
	if !IsConflict(err) {
		t.Error("IsConflict should return true for wrapped ConflictError")
	}
}

func TestIsConflict_WithK8sConflictError(t *testing.T) {
	err := k8serrors.NewConflict(schema.GroupResource{Group: "", Resource: "pods"}, "mypod", fmt.Errorf("version mismatch"))
	if !IsConflict(err) {
		t.Error("IsConflict should return true for k8s Conflict error")
	}
}

func TestIsConflict_ReturnsFalse(t *testing.T) {
	if IsConflict(fmt.Errorf("random error")) {
		t.Error("IsConflict should return false for unrelated errors")
	}
}

// --- IsTimeout ---

func TestIsTimeout_WithTimeoutError(t *testing.T) {
	err := &TimeoutError{KubeError{Code: ErrTimeout, Message: "slow"}}
	if !IsTimeout(err) {
		t.Error("IsTimeout should return true for TimeoutError")
	}
}

func TestIsTimeout_WithDeadlineExceeded(t *testing.T) {
	if !IsTimeout(context.DeadlineExceeded) {
		t.Error("IsTimeout should return true for context.DeadlineExceeded")
	}
}

func TestIsTimeout_WithContextCanceled(t *testing.T) {
	if !IsTimeout(context.Canceled) {
		t.Error("IsTimeout should return true for context.Canceled")
	}
}

func TestIsTimeout_WithWrappedDeadline(t *testing.T) {
	err := fmt.Errorf("operation failed: %w", context.DeadlineExceeded)
	if !IsTimeout(err) {
		t.Error("IsTimeout should return true for wrapped DeadlineExceeded")
	}
}

func TestIsTimeout_ReturnsFalse(t *testing.T) {
	if IsTimeout(fmt.Errorf("random error")) {
		t.Error("IsTimeout should return false for unrelated errors")
	}
}

// --- WrapKubeError ---

func TestWrapKubeError_Nil(t *testing.T) {
	if WrapKubeError(nil) != nil {
		t.Error("WrapKubeError(nil) should return nil")
	}
}

func TestWrapKubeError_AlreadyKubeError(t *testing.T) {
	original := &NotFoundError{KubeError{Code: ErrNotFound, Message: "already typed"}}
	result := WrapKubeError(original)
	if result != original {
		t.Error("WrapKubeError should return existing KubeError unchanged")
	}
}

func TestWrapKubeError_K8s401(t *testing.T) {
	err := &k8serrors.StatusError{ErrStatus: metav1.Status{
		Code:    401,
		Message: "Unauthorized",
		Reason:  metav1.StatusReasonUnauthorized,
	}}
	result := WrapKubeError(err)
	var authErr *AuthError
	if !errors.As(result, &authErr) {
		t.Fatalf("expected AuthError, got %T", result)
	}
	if authErr.Code != ErrAuth {
		t.Errorf("code = %s, want %s", authErr.Code, ErrAuth)
	}
	if !authErr.Retryable {
		t.Error("401 should be retryable")
	}
}

func TestWrapKubeError_K8s403(t *testing.T) {
	err := &k8serrors.StatusError{ErrStatus: metav1.Status{
		Code:    403,
		Message: "Forbidden",
		Reason:  metav1.StatusReasonForbidden,
	}}
	result := WrapKubeError(err)
	var forbErr *ForbiddenError
	if !errors.As(result, &forbErr) {
		t.Fatalf("expected ForbiddenError, got %T", result)
	}
	if forbErr.Code != ErrForbidden {
		t.Errorf("code = %s, want %s", forbErr.Code, ErrForbidden)
	}
	if forbErr.Retryable {
		t.Error("403 should not be retryable")
	}
}

func TestWrapKubeError_K8s404(t *testing.T) {
	err := k8serrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "mypod")
	result := WrapKubeError(err)
	var nfErr *NotFoundError
	if !errors.As(result, &nfErr) {
		t.Fatalf("expected NotFoundError, got %T", result)
	}
	if nfErr.Code != ErrNotFound {
		t.Errorf("code = %s, want %s", nfErr.Code, ErrNotFound)
	}
}

func TestWrapKubeError_K8s409(t *testing.T) {
	err := k8serrors.NewConflict(schema.GroupResource{Resource: "pods"}, "mypod", fmt.Errorf("version"))
	result := WrapKubeError(err)
	var confErr *ConflictError
	if !errors.As(result, &confErr) {
		t.Fatalf("expected ConflictError, got %T", result)
	}
	if !confErr.Retryable {
		t.Error("409 should be retryable")
	}
}

func TestWrapKubeError_K8s422(t *testing.T) {
	err := &k8serrors.StatusError{ErrStatus: metav1.Status{
		Code:    422,
		Message: "Unprocessable Entity",
		Reason:  metav1.StatusReasonInvalid,
	}}
	result := WrapKubeError(err)
	var valErr *ValidationError
	if !errors.As(result, &valErr) {
		t.Fatalf("expected ValidationError, got %T", result)
	}
	if valErr.Retryable {
		t.Error("422 should not be retryable")
	}
}

func TestWrapKubeError_K8s500(t *testing.T) {
	err := &k8serrors.StatusError{ErrStatus: metav1.Status{
		Code:    500,
		Message: "Internal Server Error",
	}}
	result := WrapKubeError(err)
	var ke *KubeError
	if !errors.As(result, &ke) {
		t.Fatal("expected KubeError")
	}
	if ke.Code != ErrServer {
		t.Errorf("code = %s, want %s", ke.Code, ErrServer)
	}
	if !ke.Retryable {
		t.Error("500 should be retryable")
	}
}

func TestWrapKubeError_DeadlineExceeded(t *testing.T) {
	result := WrapKubeError(context.DeadlineExceeded)
	var te *TimeoutError
	if !errors.As(result, &te) {
		t.Fatalf("expected TimeoutError, got %T", result)
	}
	if !te.Retryable {
		t.Error("DeadlineExceeded should be retryable")
	}
}

func TestWrapKubeError_ContextCanceled(t *testing.T) {
	result := WrapKubeError(context.Canceled)
	var te *TimeoutError
	if !errors.As(result, &te) {
		t.Fatalf("expected TimeoutError, got %T", result)
	}
	if te.Retryable {
		t.Error("Canceled should not be retryable")
	}
}

func TestWrapKubeError_NetOpError(t *testing.T) {
	err := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Addr: &net.TCPAddr{
			IP:   net.ParseIP("10.0.0.1"),
			Port: 6443,
		},
		Err: fmt.Errorf("connection refused"),
	}
	result := WrapKubeError(err)
	var ce *ConnectionError
	if !errors.As(result, &ce) {
		t.Fatalf("expected ConnectionError, got %T", result)
	}
	if !ce.Retryable {
		t.Error("network error should be retryable")
	}
}

func TestWrapKubeError_DNSError(t *testing.T) {
	err := &net.DNSError{
		Name: "api.cluster.local",
		Err:  "no such host",
	}
	result := WrapKubeError(err)
	var ce *ConnectionError
	if !errors.As(result, &ce) {
		t.Fatalf("expected ConnectionError, got %T", result)
	}
	if ce.Code != ErrConnection {
		t.Errorf("code = %s, want %s", ce.Code, ErrConnection)
	}
}

func TestWrapKubeError_TLSError(t *testing.T) {
	err := fmt.Errorf("x509: certificate signed by unknown authority")
	result := WrapKubeError(err)
	var ce *ConnectionError
	if !errors.As(result, &ce) {
		t.Fatalf("expected ConnectionError, got %T", result)
	}
}

func TestWrapKubeError_CertificateError(t *testing.T) {
	err := fmt.Errorf("certificate has expired")
	result := WrapKubeError(err)
	var ce *ConnectionError
	if !errors.As(result, &ce) {
		t.Fatalf("expected ConnectionError, got %T", result)
	}
}

func TestWrapKubeError_ExecPluginError(t *testing.T) {
	err := fmt.Errorf("exec plugin: failed to execute /usr/local/bin/aws-iam-authenticator")
	result := WrapKubeError(err)
	var ae *AuthError
	if !errors.As(result, &ae) {
		t.Fatalf("expected AuthError, got %T", result)
	}
	if !ae.Retryable {
		t.Error("exec plugin error should be retryable")
	}
}

func TestWrapKubeError_UnableToConnect(t *testing.T) {
	err := fmt.Errorf("unable to connect to the server: dial tcp: timeout")
	result := WrapKubeError(err)
	var ae *AuthError
	if !errors.As(result, &ae) {
		t.Fatalf("expected AuthError, got %T", result)
	}
}

func TestWrapKubeError_UnknownError(t *testing.T) {
	err := fmt.Errorf("something completely unexpected")
	result := WrapKubeError(err)
	var ke *KubeError
	if !errors.As(result, &ke) {
		t.Fatal("expected KubeError")
	}
	if ke.Code != ErrUnknown {
		t.Errorf("code = %s, want %s", ke.Code, ErrUnknown)
	}
}

func TestWrapKubeError_PreservesOriginalCause(t *testing.T) {
	original := fmt.Errorf("the original error")
	result := WrapKubeError(original)
	if !errors.Is(result, original) {
		t.Error("wrapped error should preserve original in chain")
	}
}

func TestWrapKubeError_WrappedAlreadyTyped(t *testing.T) {
	inner := &AuthError{KubeError{Code: ErrAuth, Message: "already"}}
	wrapped := fmt.Errorf("outer: %w", inner)
	result := WrapKubeError(wrapped)
	// Should return the wrapped error as-is since errors.As finds the inner AuthError
	if result != wrapped {
		t.Error("should return wrapped error unchanged when it already contains a KubeError")
	}
}

// --- Helpers with nil ---

func TestIsNotFound_Nil(t *testing.T) {
	// nil errors should not match
	if IsNotFound(nil) {
		t.Error("IsNotFound(nil) should return false")
	}
}

func TestIsForbidden_Nil(t *testing.T) {
	if IsForbidden(nil) {
		t.Error("IsForbidden(nil) should return false")
	}
}

func TestIsConflict_Nil(t *testing.T) {
	if IsConflict(nil) {
		t.Error("IsConflict(nil) should return false")
	}
}

func TestIsTimeout_Nil(t *testing.T) {
	if IsTimeout(nil) {
		t.Error("IsTimeout(nil) should return false")
	}
}
