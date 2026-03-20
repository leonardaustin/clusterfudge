package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/config"
	"clusterfudge/internal/events"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// emitterReceiver is implemented by types that accept an event emitter.
type emitterReceiver interface {
	SetEmitter(emitter *events.Emitter)
}

// App is the root application struct. It holds the Wails context and wires
// startup/shutdown lifecycle events.
type App struct {
	ctx                      context.Context
	clusterMgr               *cluster.Manager
	cfgStore                 *config.Store
	emitterReceivers         []emitterReceiver
	enableKubeconfigWatcher  bool
	kubeconfigWatcherCancel  context.CancelFunc
}

// NewApp creates the App with required dependencies.
func NewApp(clusterMgr *cluster.Manager, cfgStore *config.Store) *App {
	if clusterMgr == nil {
		panic("NewApp: clusterMgr must not be nil")
	}
	return &App{clusterMgr: clusterMgr, cfgStore: cfgStore}
}

// RegisterEmitterReceivers registers handlers that need the event emitter
// wired once the Wails context is available.
func (a *App) RegisterEmitterReceivers(receivers ...emitterReceiver) {
	a.emitterReceivers = append(a.emitterReceivers, receivers...)
}

// startup is called when the Wails app is ready.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("Clusterfudge starting up")

	// Create the event emitter now that the Wails context is available.
	emitter := events.NewEmitter(func(topic string, payload any) {
		wailsRuntime.EventsEmit(ctx, topic, payload)
	})
	for _, r := range a.emitterReceivers {
		r.SetEmitter(emitter)
	}

	// Start kubeconfig file watcher if enabled.
	if a.enableKubeconfigWatcher {
		loader := a.clusterMgr.Loader()
		kcWatcher, watchErr := cluster.NewKubeconfigWatcher(loader, func(_ *clientcmdapi.Config) {
			// Emit event to frontend so it re-fetches the cluster list.
			emitter.Emit("kubeconfig:changed", nil)
		})
		if watchErr != nil {
			log.Printf("warning: failed to create kubeconfig watcher: %v", watchErr)
		} else {
			watchCtx, cancel := context.WithCancel(context.Background())
			a.kubeconfigWatcherCancel = cancel
			kcWatcher.Start(watchCtx)
			log.Println("Kubeconfig file watcher started")
		}
	}

	// Restore window state from config.
	if a.cfgStore != nil {
		ws := a.cfgStore.Get().WindowState
		if ws.X != -1 && ws.Y != -1 {
			wailsRuntime.WindowSetPosition(ctx, ws.X, ws.Y)
		}
		if ws.Width > 0 && ws.Height > 0 {
			wailsRuntime.WindowSetSize(ctx, ws.Width, ws.Height)
		}
		if ws.Maximized {
			wailsRuntime.WindowMaximise(ctx)
		}
	}
}

// domReady is called after the frontend is fully rendered.
func (a *App) domReady(_ context.Context) {
	log.Println("DOM ready")
}

// shutdown is called when the application is closing.
func (a *App) shutdown(_ context.Context) {
	log.Println("Clusterfudge shutting down")

	// Persist window position and size to config.
	// Deep merge preserves frontend-managed layout fields (sidebarWidth, etc.).
	if a.cfgStore != nil && a.ctx != nil {
		x, y := wailsRuntime.WindowGetPosition(a.ctx)
		w, h := wailsRuntime.WindowGetSize(a.ctx)
		maximized := wailsRuntime.WindowIsMaximised(a.ctx)
		wsUpdate := map[string]interface{}{
			"x":         x,
			"y":         y,
			"width":     w,
			"height":    h,
			"maximized": maximized,
		}
		if err := a.cfgStore.Update(map[string]interface{}{"windowState": wsUpdate}); err != nil {
			log.Printf("warning: failed to save window state: %v", err)
		}
	}

	// Stop kubeconfig watcher if running.
	if a.kubeconfigWatcherCancel != nil {
		a.kubeconfigWatcherCancel()
	}

	a.clusterMgr.Disconnect()
}

// SaveFileDialog opens a native save dialog and writes data to the chosen path.
func (a *App) SaveFileDialog(defaultFilename, content string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app not ready")
	}
	path, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
			{DisplayName: "YAML Files", Pattern: "*.yaml;*.yml"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("save dialog: %w", err)
	}
	if path == "" {
		return "", nil // user cancelled
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return path, nil
}

// GetVersion returns the app version string with build metadata.
func (a *App) GetVersion() string {
	if Commit == "unknown" {
		return Version
	}
	return Version + " (" + Commit + " " + BuildDate + ")"
}
