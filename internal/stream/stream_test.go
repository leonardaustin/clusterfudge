package stream

import (
	"io"
	"testing"
)

func TestNewLogStreamer(t *testing.T) {
	streamer := NewLogStreamer(nil)
	if streamer == nil {
		t.Fatal("expected non-nil LogStreamer")
	}
}

func TestExecSession_WriteAfterClose(t *testing.T) {
	_, w := io.Pipe()
	session := &ExecSession{stdinWriter: w}
	session.Close()

	err := session.Write([]byte("hello"))
	if err == nil {
		t.Error("expected error writing to closed session")
	}
}

func TestExecSession_DoubleClose(t *testing.T) {
	_, w := io.Pipe()
	session := &ExecSession{stdinWriter: w}
	session.Close()
	session.Close() // should not panic
}

func TestPortForwardResult(t *testing.T) {
	result := &PortForwardResult{LocalPort: 8080}
	if result.LocalPort != 8080 {
		t.Errorf("expected port 8080, got %d", result.LocalPort)
	}
}

func TestStopPortForward_NoOp(t *testing.T) {
	m := NewPortForwardManager()
	m.StopPortForward(99999)
}
