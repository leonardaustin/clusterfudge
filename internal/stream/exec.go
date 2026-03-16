package stream

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"sync"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// GenerateID creates a random session ID.
func GenerateID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("crypto/rand.Read failed: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// ExecSession represents an active exec session to a container.
type ExecSession struct {
	stdinWriter io.WriteCloser
	mu          sync.Mutex
	closed      bool
}

// Write sends data to the exec session's stdin.
func (s *ExecSession) Write(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("session closed")
	}
	_, err := s.stdinWriter.Write(data)
	return err
}

// Close terminates the exec session.
func (s *ExecSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed {
		s.closed = true
		s.stdinWriter.Close()
	}
}

type callbackWriter struct {
	fn func([]byte)
}

func (w *callbackWriter) Write(p []byte) (int, error) {
	w.fn(p)
	return len(p), nil
}

// StartExec opens an exec session to the specified container.
func StartExec(
	ctx context.Context,
	client kubernetes.Interface,
	cfg *rest.Config,
	opts ExecOptions,
	onStdout, onStderr func([]byte),
	onExit func(error),
) (*ExecSession, error) {
	// Verify pod exists first
	_, err := client.CoreV1().Pods(opts.Namespace).Get(ctx, opts.PodName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get pod %s/%s: %w", opts.Namespace, opts.PodName, err)
	}

	req := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(opts.PodName).
		Namespace(opts.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: opts.ContainerName,
			Command:   opts.Command,
			Stdin:     true,
			Stdout:    true,
			Stderr:    !opts.TTY,
			TTY:       opts.TTY,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(cfg, "POST", req.URL())
	if err != nil {
		return nil, fmt.Errorf("create SPDY executor: %w", err)
	}

	stdinReader, stdinWriter := io.Pipe()
	session := &ExecSession{stdinWriter: stdinWriter}

	streamOpts := remotecommand.StreamOptions{
		Stdin:  stdinReader,
		Stdout: &callbackWriter{fn: onStdout},
		Tty:    opts.TTY,
	}
	if !opts.TTY {
		streamOpts.Stderr = &callbackWriter{fn: onStderr}
	}

	go func() {
		err := exec.StreamWithContext(ctx, streamOpts)
		onExit(err)
	}()

	return session, nil
}
