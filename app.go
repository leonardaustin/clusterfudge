package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/config"
	"clusterfudge/internal/events"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"
	"clusterfudge/internal/system"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// emitterReceiver is implemented by types that accept an event emitter.
type emitterReceiver interface {
	SetEmitter(emitter *events.Emitter)
}

// App is the root application struct. It holds the Wails context and wires
// startup/shutdown lifecycle events.
type App struct {
	ctx                     context.Context
	clusterMgr              *cluster.Manager
	cfgStore                *config.Store
	emitterReceivers        []emitterReceiver
	enableKubeconfigWatcher bool
	kubeconfigWatcherCancel context.CancelFunc
	sleepWakeCancel         context.CancelFunc
	onWake                  func() // called when OS wakes from sleep
	onShutdown              func() // called during app shutdown for cleanup
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

	// Start sleep/wake detector to probe port forwards after OS sleep.
	if a.onWake != nil {
		sleepCtx, sleepCancel := context.WithCancel(context.Background())
		a.sleepWakeCancel = sleepCancel
		onWake := a.onWake
		detector := system.NewSleepWakeDetector(func() {
			log.Println("System wake detected, probing port forwards")
			emitter.Emit("system:wake", nil)
			onWake()
		})
		detector.Start(sleepCtx)
		log.Println("Sleep/wake detector started")
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

	// Stop sleep/wake detector.
	if a.sleepWakeCancel != nil {
		a.sleepWakeCancel()
	}

	// Stop all port forwards gracefully.
	if a.onShutdown != nil {
		a.onShutdown()
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

// SearchResourceResult is a single item returned by SearchResources.
type SearchResourceResult struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Path      string `json:"path"`
}

// resourceRoutes maps GVR resource names to their frontend route prefixes.
var resourceRoutes = map[string]string{ //nolint:gosec // G101 false positive: these are UI route prefixes, not credentials
	"pods":                        "/workloads/pods",
	"deployments":                 "/workloads/deployments",
	"statefulsets":                "/workloads/statefulsets",
	"daemonsets":                  "/workloads/daemonsets",
	"replicasets":                 "/workloads/replicasets",
	"jobs":                        "/workloads/jobs",
	"cronjobs":                    "/workloads/cronjobs",
	"services":                    "/networking/services",
	"ingresses":                   "/networking/ingresses",
	"endpoints":                   "/networking/endpoints",
	"endpointslices":              "/networking/endpoints",
	"networkpolicies":             "/networking/networkpolicies",
	"ingressclasses":              "/networking/ingresses",
	"configmaps":                  "/config/configmaps",
	"secrets":                     "/config/secrets",
	"resourcequotas":              "/config/resourcequotas",
	"limitranges":                 "/config/limitranges",
	"horizontalpodautoscalers":    "/config/hpas",
	"poddisruptionbudgets":       "/config/pdbs",
	"persistentvolumeclaims":     "/storage/pvcs",
	"persistentvolumes":          "/storage/pvs",
	"storageclasses":              "/storage/storageclasses",
	"csidrivers":                  "/storage/storageclasses",
	"csinodes":                    "/cluster/nodes",
	"volumeattachments":           "/storage/pvs",
	"volumesnapshots":             "/storage/pvcs",
	"leases":                      "/cluster/events",
	"nodes":                       "/cluster/nodes",
	"namespaces":                  "/cluster/namespaces",
	"events":                      "/cluster/events",
	"priorityclasses":             "/cluster/priorityclasses",
	"runtimeclasses":              "/cluster/nodes",
	"flowschemas":                 "/cluster/events",
	"prioritylevelconfigurations": "/cluster/events",
	"serviceaccounts":             "/rbac/serviceaccounts",
	"roles":                       "/rbac/roles",
	"clusterroles":                "/rbac/clusterroles",
	"rolebindings":                "/rbac/rolebindings",
	"clusterrolebindings":         "/rbac/clusterrolebindings",
}

// searchResult collects results from a single GVR search.
type searchResult struct {
	items []SearchResourceResult
}

// SearchResources searches across all known resource types for resources
// whose name contains the query string (case-insensitive).
func (a *App) SearchResources(query string) ([]SearchResourceResult, error) {
	if len(query) < 2 {
		return nil, nil
	}
	cs, err := a.clusterMgr.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("search resources: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	queryLower := strings.ToLower(query)
	svc := resource.NewService()
	gvrs := k8s.AllCoreGVRs()

	// Search GVRs concurrently with a bounded worker pool.
	const workers = 8
	type gvrWork struct {
		gvr schema.GroupVersionResource
	}
	jobs := make(chan gvrWork, len(gvrs))
	resultsCh := make(chan searchResult, len(gvrs))

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				gvr := job.gvr
				q := resource.ResourceQuery{
					Group:    gvr.Group,
					Version:  gvr.Version,
					Resource: gvr.Resource,
				}
				items, listErr := svc.List(ctx, cs.Dynamic, q)
				if listErr != nil {
					continue
				}

				displayName := k8s.GVRDisplayName(gvr)
				kind := singularDisplayName(displayName)
				basePath, ok := resourceRoutes[gvr.Resource]

				var matched []SearchResourceResult
				for _, item := range items {
					if !strings.Contains(strings.ToLower(item.Name), queryLower) {
						continue
					}
					path := ""
					if ok {
						if k8s.IsNamespaced(gvr) && item.Namespace != "" {
							path = basePath + "/" + item.Namespace + "/" + item.Name
						} else {
							path = basePath + "/" + item.Name
						}
					}
					matched = append(matched, SearchResourceResult{
						Kind:      kind,
						Name:      item.Name,
						Namespace: item.Namespace,
						Path:      path,
					})
				}
				if len(matched) > 0 {
					resultsCh <- searchResult{items: matched}
				}
			}
		}()
	}

	for _, gvr := range gvrs {
		jobs <- gvrWork{gvr: gvr}
	}
	close(jobs)

	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	var results []SearchResourceResult
	for sr := range resultsCh {
		results = append(results, sr.items...)
		if len(results) >= 50 {
			break
		}
	}
	return results, nil
}

// singularDisplayName converts a plural display name like "Deployments"
// or "Priority Classes" to singular form.
func singularDisplayName(plural string) string {
	// For multi-word names, only singularize the last word.
	words := strings.Split(plural, " ")
	last := words[len(words)-1]

	var singular string
	switch {
	case strings.HasSuffix(last, "ies"):
		singular = strings.TrimSuffix(last, "ies") + "y"
	case strings.HasSuffix(last, "sses"):
		singular = strings.TrimSuffix(last, "es")
	case strings.HasSuffix(last, "shes"):
		singular = strings.TrimSuffix(last, "es")
	case strings.HasSuffix(last, "s"):
		singular = strings.TrimSuffix(last, "s")
	default:
		singular = last
	}

	words[len(words)-1] = singular
	return strings.Join(words, " ")
}
