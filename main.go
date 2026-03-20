package main

import (
	"embed"
	"io/fs"
	"log"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"clusterfudge/handlers"
	"clusterfudge/internal/alerts"
	"clusterfudge/internal/audit"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/config"
	"clusterfudge/internal/resource"
	"clusterfudge/internal/troubleshoot"
	"clusterfudge/internal/updater"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

// Version, Commit, and BuildDate are set at build time via ldflags.
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

//go:embed all:ui/dist
var assets embed.FS

func main() {
	ensurePath()

	// Initialise internal services
	cfgStore, err := config.NewStore()
	if err != nil {
		log.Fatalf("config.NewStore: %v", err)
	}

	cfg := cfgStore.Get()

	// Use kubeconfig paths from settings if configured, otherwise auto-detect.
	var mgr *cluster.Manager
	if len(cfg.KubeconfigPaths) > 0 {
		loader := cluster.NewKubeconfigLoaderFromPaths(cfg.KubeconfigPaths)
		mgr = cluster.NewManagerWithLoader(loader)
	} else {
		mgr = cluster.NewManager()
	}

	// Apply K8s client tuning from config (M6: configurable timeouts/QPS).
	if cfg.K8sRequestTimeoutSec > 0 || cfg.K8sQPS > 0 || cfg.K8sBurst > 0 {
		mgr.Loader().SetClientOptions(
			time.Duration(cfg.K8sRequestTimeoutSec)*time.Second,
			float32(cfg.K8sQPS),
			cfg.K8sBurst,
		)
	}

	svc := resource.NewService()

	// Initialise updater
	u := updater.NewUpdater("leonardaustin", "clusterfudge", Version)
	scheduler := updater.NewScheduler(u, 4*time.Hour, 30*time.Second, func(info updater.UpdateInfo) {
		slog.Info("update available", "version", info.Version)
	})

	// Initialise Phase 9 services
	timeline := troubleshoot.NewTimeline(10000)
	tsEngine := troubleshoot.NewEngine(timeline)
	alertStore := alerts.NewStore()
	// Use file-backed audit logger so entries survive restarts (L2).
	auditLogPath := ""
	if configDir, err := os.UserConfigDir(); err == nil {
		auditLogPath = filepath.Join(configDir, "clusterfudge", "audit.jsonl")
	}
	var auditLogger *audit.Logger
	if auditLogPath != "" {
		var auditErr error
		auditLogger, auditErr = audit.NewLoggerWithFile(auditLogPath)
		if auditErr != nil {
			slog.Warn("failed to open audit log file, falling back to in-memory", "path", auditLogPath, "error", auditErr)
			auditLogger = audit.NewLogger()
		}
	} else {
		auditLogger = audit.NewLogger()
	}

	// Prune old audit entries on startup (keep last 90 days).
	if pruned := auditLogger.Prune(90 * 24 * time.Hour); pruned > 0 {
		slog.Info("pruned old audit entries", "count", pruned)
	}

	// Initialise handlers (thin Wails-bound layer)
	app := NewApp(mgr, cfgStore)

	// Enable kubeconfig file watcher if auto-reload is configured.
	if cfg.AutoReloadKubeconfig {
		app.enableKubeconfigWatcher = true
	}
	clusterHandler := handlers.NewClusterHandler(mgr)
	resourceHandler := handlers.NewResourceHandler(svc, mgr)
	resourceHandler.SetAlertStore(alertStore)
	resourceHandler.SetTimeline(timeline)
	resourceHandler.SetAuditLogger(auditLogger)
	streamHandler := handlers.NewStreamHandler(mgr)
	helmHandler := handlers.NewHelmHandler("", "")
	configHandler := handlers.NewConfigHandler(cfgStore)

	// Wire cluster changes to Helm handler and alert store.
	kubeconfigPath := mgr.Loader().ResolvedPath()
	mgr.SetUpdateCallback(func(contextName string, snap cluster.ConnectionSnapshot) {
		if snap.State == cluster.StateConnected {
			helmHandler.SetCluster(kubeconfigPath, contextName)
		}
	})
	updateHandler := handlers.NewUpdateHandler(u, scheduler)

	secretHandler := handlers.NewSecretHandler(mgr, auditLogger)

	// AI handler
	aiHandler := handlers.NewAIHandler(svc, mgr, cfgStore)

	// Phase 9 handlers
	troubleshootHandler := handlers.NewTroubleshootHandler(tsEngine, mgr)
	wizardHandler := handlers.NewWizardHandler()
	templateHandler := handlers.NewTemplateHandler()
	alertHandler := handlers.NewAlertHandler(alertStore)
	auditHandler := handlers.NewAuditHandler(auditLogger)
	backupHandler := handlers.NewBackupHandler(svc, mgr)
	gitopsHandler := handlers.NewGitOpsHandler(mgr)
	securityScanHandler := handlers.NewSecurityScanHandler(mgr)
	rbacHandler := handlers.NewRBACHandler(mgr)
	netpolHandler := handlers.NewNetPolHandler(mgr)

	// Start update scheduler if auto-check is enabled.
	if cfg.AutoCheckUpdates {
		scheduler.Start()
	}

	// Register handlers that need the event emitter (wired during startup).
	app.RegisterEmitterReceivers(resourceHandler, streamHandler, mgr, aiHandler)

	// Serve embedded frontend assets with the ui/dist prefix stripped
	distFS, fsErr := fs.Sub(assets, "ui/dist")
	if fsErr != nil {
		log.Fatalf("fs.Sub: %v", fsErr)
	}

	// Wails app options
	defer scheduler.Stop()
	defer func() { _ = auditLogger.Close() }()
	defer aiHandler.CloseAll()

	err = wails.Run(&options.App{
		Title:                    "Clusterfudge",
		Width:                    1280,
		Height:                   800,
		MinWidth:                 900,
		MinHeight:                600,
		EnableDefaultContextMenu: true,
		AssetServer:              &assetserver.Options{Assets: distFS},
		BackgroundColour:         &options.RGBA{R: 0, G: 0, B: 0, A: 0},

		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               true,
				FullSizeContent:            true,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},

		OnStartup:  app.startup,
		OnDomReady: app.domReady,
		OnShutdown: app.shutdown,

		Bind: []interface{}{
			app,
			clusterHandler,
			resourceHandler,
			streamHandler,
			helmHandler,
			configHandler,
			updateHandler,
			secretHandler,
			troubleshootHandler,
			wizardHandler,
			templateHandler,
			alertHandler,
			auditHandler,
			backupHandler,
			gitopsHandler,
			securityScanHandler,
			rbacHandler,
			netpolHandler,
			aiHandler,
		},
	})
	if err != nil {
		log.Fatalf("wails.Run: %v", err)
	}
}

// ensurePath inherits the user's login shell PATH so that exec-based
// credential plugins (e.g. gke-gcloud-auth-plugin, aws-iam-authenticator)
// can be found when the app is launched from Finder/Dock, which provides
// only a minimal default PATH.
func ensurePath() {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		return
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	// fish stores PATH as a list (space-separated) rather than a
	// colon-separated string, so we need a different command to extract it.
	shellCmd := shellPathCmd(shell)

	out, err := exec.Command(shell, "-l", "-c", shellCmd).Output() //nolint:gosec // shell comes from the user's own SHELL env var
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "__PATH__=") {
			_ = os.Setenv("PATH", strings.TrimPrefix(line, "__PATH__="))
			return
		}
	}
}

// shellPathCmd returns the shell command to extract the PATH variable.
// Fish uses a space-separated list for PATH, so it needs special handling.
func shellPathCmd(shell string) string {
	if filepath.Base(shell) == "fish" {
		return "echo __PATH__=(string join : $PATH)"
	}
	return "echo __PATH__=$PATH"
}
