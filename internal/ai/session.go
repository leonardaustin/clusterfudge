package ai

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

const (
	// flushInterval is the maximum time to buffer PTY output before emitting.
	// Matches ~60fps to align with frontend animation frames.
	flushInterval = 16 * time.Millisecond

	// maxBatchSize triggers an immediate flush when the buffer exceeds this size.
	maxBatchSize = 32 * 1024
)

// LocalSession wraps an AI CLI process running in a local PTY.
type LocalSession struct {
	cmd    *exec.Cmd
	ptmx   *os.File // PTY master
	mu     sync.Mutex
	closed bool
}

// StartLocalSession launches a command in a local PTY.
// The onOutput callback receives PTY output chunks.
// The onExit callback is called when the process exits.
func StartLocalSession(args []string, env []string, onOutput func([]byte), onExit func(error)) (*LocalSession, error) {
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
		cmd:  cmd,
		ptmx: ptmx,
	}

	// Read goroutine: read from PTY master, batch output, and deliver to callback.
	// Batching collapses many small PTY writes (cursor moves, spinner frames) into
	// fewer, larger events so the frontend renders complete frames instead of
	// intermediate states.
	go func() {
		readBuf := make([]byte, 32768)
		var accum bytes.Buffer
		timer := time.NewTimer(flushInterval)
		timer.Stop()
		timerRunning := false

		flush := func() {
			if accum.Len() > 0 {
				out := make([]byte, accum.Len())
				copy(out, accum.Bytes())
				accum.Reset()
				onOutput(out)
			}
			if timerRunning {
				timer.Stop()
				timerRunning = false
			}
		}

		// dataCh receives PTY reads; nil signals EOF.
		dataCh := make(chan []byte, 64)
		go func() {
			for {
				n, err := ptmx.Read(readBuf)
				if n > 0 {
					chunk := make([]byte, n)
					copy(chunk, readBuf[:n])
					dataCh <- chunk
				}
				if err != nil {
					close(dataCh)
					return
				}
			}
		}()

		for {
			select {
			case chunk, ok := <-dataCh:
				if !ok {
					// PTY closed — flush remaining and exit
					flush()
					exitErr := cmd.Wait()
					onExit(exitErr)
					return
				}
				accum.Write(chunk)
				if accum.Len() >= maxBatchSize {
					flush()
				} else if !timerRunning {
					timer.Reset(flushInterval)
					timerRunning = true
				}

			case <-timer.C:
				timerRunning = false
				flush()
			}
		}
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

// Close terminates the session and kills the process.
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
}
