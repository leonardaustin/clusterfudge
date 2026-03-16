package stream

import (
	"context"
	"sync"
)

// ContainerLogStream holds state for one container's log stream.
type ContainerLogStream struct {
	ContainerName string
	Cancel        context.CancelFunc
}

// MultiLogStreamer manages concurrent log streams for all containers in a pod.
type MultiLogStreamer struct {
	streamer *LogStreamer
	mu       sync.Mutex
	streams  map[string]*ContainerLogStream // containerName -> stream
}

// NewMultiLogStreamer creates a MultiLogStreamer.
func NewMultiLogStreamer(streamer *LogStreamer) *MultiLogStreamer {
	return &MultiLogStreamer{
		streamer: streamer,
		streams:  make(map[string]*ContainerLogStream),
	}
}

// StartAll opens a log stream for each container, calling onLine with the container name tagged.
// onError is called if a container's stream fails (may be nil).
func (m *MultiLogStreamer) StartAll(
	parentCtx context.Context,
	namespace, podName string,
	containers []string,
	tailLines int64,
	onLine func(LogLine),
	onError func(containerName string, err error),
) {
	m.StopAll()
	for _, c := range containers {
		containerName := c
		ctx, cancel := context.WithCancel(parentCtx) //nolint:gosec // G118 - cancel stored in streams map for later cleanup
		m.mu.Lock()
		m.streams[containerName] = &ContainerLogStream{ContainerName: containerName, Cancel: cancel}
		m.mu.Unlock()

		go func() {
			opts := LogOptions{
				Namespace:     namespace,
				PodName:       podName,
				ContainerName: containerName,
				Follow:        true,
				TailLines:     tailLines,
				Timestamps:    true,
			}
			err := m.streamer.Stream(ctx, opts, func(line LogLine) {
				line.Container = containerName
				onLine(line)
			})
			if err != nil && ctx.Err() == nil && onError != nil {
				onError(containerName, err)
			}
		}()
	}
}

// StopAll cancels every active container stream.
func (m *MultiLogStreamer) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.streams {
		s.Cancel()
	}
	m.streams = make(map[string]*ContainerLogStream)
}

// Stop cancels the stream for a single container.
func (m *MultiLogStreamer) Stop(containerName string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.streams[containerName]; ok {
		s.Cancel()
		delete(m.streams, containerName)
	}
}
