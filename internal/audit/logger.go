package audit

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maxEntries = 10000

// Logger is an audit logger with optional file persistence.
type Logger struct {
	mu       sync.RWMutex
	entries  []Entry
	nextID   int
	filePath string
	file     *os.File
}

// NewLogger creates a new in-memory audit logger.
func NewLogger() *Logger {
	return &Logger{}
}

// NewLoggerWithFile creates a logger that persists entries to a JSONL file.
// Existing entries are loaded from the file on creation.
func NewLoggerWithFile(path string) (*Logger, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("create audit log directory: %w", err)
	}

	l := &Logger{filePath: path}

	// Load existing entries from file.
	if data, err := os.Open(path); err == nil {
		scanner := bufio.NewScanner(data)
		for scanner.Scan() {
			var e Entry
			if err := json.Unmarshal(scanner.Bytes(), &e); err == nil {
				l.entries = append(l.entries, e)
				l.nextID++
			}
		}
		data.Close()
	}

	// Trim to maxEntries if file had more.
	if len(l.entries) > maxEntries {
		l.entries = l.entries[len(l.entries)-maxEntries:]
	}

	// Open file for appending new entries.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return nil, fmt.Errorf("open audit log file: %w", err)
	}
	l.file = f

	return l, nil
}

// Log records an audit entry. If the log exceeds maxEntries, the oldest entry is removed.
func (l *Logger) Log(entry Entry) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.nextID++
	entry.ID = fmt.Sprintf("audit-%d", l.nextID)
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	l.entries = append(l.entries, entry)
	if len(l.entries) > maxEntries {
		l.entries = l.entries[len(l.entries)-maxEntries:]
	}

	// Persist to file if configured.
	if l.file != nil {
		if data, err := json.Marshal(entry); err == nil {
			if _, wErr := l.file.Write(append(data, '\n')); wErr != nil {
				slog.Warn("failed to write audit entry to file", "error", wErr)
			}
		}
	}
}

// Query returns audit entries matching the filter, newest first.
func (l *Logger) Query(filter QueryFilter) []Entry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]Entry, 0)
	// Iterate in reverse for newest-first ordering.
	for i := len(l.entries) - 1; i >= 0; i-- {
		e := l.entries[i]
		if filter.Since != nil && e.Timestamp.Before(*filter.Since) {
			continue
		}
		if filter.Until != nil && e.Timestamp.After(*filter.Until) {
			continue
		}
		if filter.Action != "" && e.Action != filter.Action {
			continue
		}
		if filter.Kind != "" && e.Kind != filter.Kind {
			continue
		}
		if filter.Namespace != "" && e.Namespace != filter.Namespace {
			continue
		}
		result = append(result, e)
		if filter.Limit > 0 && len(result) >= filter.Limit {
			break
		}
	}
	return result
}

// Prune removes entries older than the given duration and returns the count removed.
// If the logger is file-backed, the file is rewritten with the remaining entries.
func (l *Logger) Prune(olderThan time.Duration) int {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := time.Now().Add(-olderThan)
	kept := make([]Entry, 0, len(l.entries))
	removed := 0
	for _, e := range l.entries {
		if e.Timestamp.Before(cutoff) {
			removed++
		} else {
			kept = append(kept, e)
		}
	}
	l.entries = kept

	// Rewrite the backing file to reclaim space from pruned entries.
	if removed > 0 && l.file != nil && l.filePath != "" {
		l.rewriteFile()
	}

	return removed
}

// rewriteFile rewrites the JSONL file with only the current in-memory entries.
// Must be called with l.mu held.
func (l *Logger) rewriteFile() {
	// Write to a temp file, then rename for atomicity.
	tmpPath := l.filePath + ".tmp"
	tmp, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	w := bufio.NewWriter(tmp)
	for _, e := range l.entries {
		if data, err := json.Marshal(e); err == nil {
			_, _ = w.Write(append(data, '\n'))
		}
	}
	_ = w.Flush()
	_ = tmp.Close()

	// Close old file, rename temp, reopen for append.
	_ = l.file.Close()
	if err := os.Rename(tmpPath, l.filePath); err != nil {
		slog.Warn("failed to rename audit log temp file", "error", err)
	}
	f, err := os.OpenFile(l.filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		slog.Error("failed to reopen audit log file after prune; file logging disabled", "error", err)
		l.file = nil
		return
	}
	l.file = f
}

// Count returns the total number of audit entries.
func (l *Logger) Count() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.entries)
}

// Close flushes and closes the backing file, if any.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}
