package stream

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

// LogStreamer streams container logs.
type LogStreamer struct {
	client kubernetes.Interface
}

// NewLogStreamer creates a LogStreamer.
func NewLogStreamer(client kubernetes.Interface) *LogStreamer {
	return &LogStreamer{client: client}
}

// Stream opens a log stream and calls onLine for each line received.
// It blocks until the stream ends or ctx is cancelled.
func (l *LogStreamer) Stream(ctx context.Context, opts LogOptions, onLine func(LogLine)) error {
	podOpts := &corev1.PodLogOptions{
		Container:  opts.ContainerName,
		Follow:     opts.Follow,
		Previous:   opts.Previous,
		Timestamps: opts.Timestamps,
	}
	if opts.TailLines > 0 {
		tl := opts.TailLines
		podOpts.TailLines = &tl
	}

	req := l.client.CoreV1().Pods(opts.Namespace).GetLogs(opts.PodName, podOpts)
	stream, err := req.Stream(ctx)
	if err != nil {
		return fmt.Errorf("open log stream for %s/%s: %w", opts.Namespace, opts.PodName, err)
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		line := scanner.Text()
		logLine := LogLine{
			Content:   line,
			Container: opts.ContainerName,
		}
		if opts.Timestamps {
			if idx := strings.IndexByte(line, ' '); idx > 0 {
				if t, err := time.Parse(time.RFC3339Nano, line[:idx]); err == nil {
					logLine.Timestamp = t
					logLine.Content = line[idx+1:]
				}
			}
		}
		onLine(logLine)
	}
	if err := scanner.Err(); err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("read log stream: %w", err)
	}
	return nil
}
