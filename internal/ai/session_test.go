package ai

import (
	"sync"
	"testing"
	"time"
)

func TestStartLocalSession_Echo(t *testing.T) {
	// Use /bin/echo to test a simple command that exits immediately
	var (
		mu     sync.Mutex
		output []byte
		exited bool
	)

	session, err := StartLocalSession(
		[]string{"/bin/echo", "hello world"},
		nil,
		func(data []byte) {
			mu.Lock()
			output = append(output, data...)
			mu.Unlock()
		},
		func(_ error) {
			mu.Lock()
			exited = true
			mu.Unlock()
		},
	)
	if err != nil {
		t.Fatalf("StartLocalSession: %v", err)
	}
	defer session.Close()

	// Wait for process to complete
	deadline := time.After(5 * time.Second)
	for {
		mu.Lock()
		done := exited
		mu.Unlock()
		if done {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timeout waiting for process exit")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	mu.Lock()
	got := string(output)
	mu.Unlock()

	if len(got) == 0 {
		t.Error("expected some output from echo")
	}
}

func TestStartLocalSession_EmptyCommand(t *testing.T) {
	_, err := StartLocalSession(nil, nil, func([]byte) {}, func(error) {})
	if err == nil {
		t.Error("expected error for empty command")
	}
}

func TestLocalSession_Write(t *testing.T) {
	// Start a cat process that echoes input
	var mu sync.Mutex
	var output []byte

	session, err := StartLocalSession(
		[]string{"/bin/cat"},
		nil,
		func(data []byte) {
			mu.Lock()
			output = append(output, data...)
			mu.Unlock()
		},
		func(_ error) {},
	)
	if err != nil {
		t.Fatalf("StartLocalSession: %v", err)
	}
	defer session.Close()

	// Write some data
	if err := session.Write([]byte("test\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}

	// Wait for echo
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	got := string(output)
	mu.Unlock()

	if len(got) == 0 {
		t.Error("expected output from cat after write")
	}
}

func TestLocalSession_Resize(t *testing.T) {
	session, err := StartLocalSession(
		[]string{"/bin/cat"},
		nil,
		func([]byte) {},
		func(error) {},
	)
	if err != nil {
		t.Fatalf("StartLocalSession: %v", err)
	}
	defer session.Close()

	if err := session.Resize(40, 120); err != nil {
		t.Errorf("Resize: %v", err)
	}
}

func TestLocalSession_DoubleClose(t *testing.T) {
	session, err := StartLocalSession(
		[]string{"/bin/echo", "x"},
		nil,
		func([]byte) {},
		func(error) {},
	)
	if err != nil {
		t.Fatalf("StartLocalSession: %v", err)
	}

	// Double close should not panic
	session.Close()
	session.Close()
}
