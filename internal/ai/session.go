package ai

import (
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// LocalSession wraps an AI CLI process running in a local PTY.
type LocalSession struct {
	cmd     *exec.Cmd
	ptmx    *os.File // PTY master
	mu      sync.Mutex
	closed  bool
	tmpFile string // temp context file path, cleaned up on close
}

// StartLocalSession launches a command in a local PTY.
// The onOutput callback receives PTY output chunks.
// The onExit callback is called when the process exits.
func StartLocalSession(args []string, env []string, tmpFile string, onOutput func([]byte), onExit func(error)) (*LocalSession, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	cmd := exec.Command(args[0], args[1:]...) //nolint:gosec // args are constructed by the handler, not user input
	cmd.Env = append(os.Environ(), env...)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("pty start: %w", err)
	}

	// Set initial size
	_ = pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80})

	s := &LocalSession{
		cmd:     cmd,
		ptmx:    ptmx,
		tmpFile: tmpFile,
	}

	// Read goroutine: read from PTY master and deliver to callback
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				// Copy data to avoid races with buffer reuse
				data := make([]byte, n)
				copy(data, buf[:n])
				onOutput(data)
			}
			if err != nil {
				break
			}
		}
		// Wait for process to finish
		exitErr := cmd.Wait()
		onExit(exitErr)
	}()

	return s, nil
}

// Write sends data (keyboard input) to the PTY.
func (s *LocalSession) Write(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("session closed")
	}
	_, err := s.ptmx.Write(data)
	return err
}

// Resize changes the PTY window size.
func (s *LocalSession) Resize(rows, cols uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	return pty.Setsize(s.ptmx, &pty.Winsize{Rows: rows, Cols: cols})
}

// Close terminates the session, kills the process, and removes the temp file.
func (s *LocalSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true

	// Close the PTY master (this causes the read goroutine to exit)
	_ = s.ptmx.Close()

	// Kill the process if still running
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}

	// Clean up temp file
	if s.tmpFile != "" {
		_ = os.Remove(s.tmpFile)
	}
}
