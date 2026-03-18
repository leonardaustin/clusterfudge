package cluster

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// KubeconfigLoader loads and merges kubeconfig files from one or more paths.
type KubeconfigLoader struct {
	paths   []string
	timeout time.Duration
	qps     float32
	burst   int
}

// SetClientOptions configures the REST client parameters used by RestConfigForContext.
// Zero values fall back to defaults (15s timeout, 50 QPS, 100 burst).
func (l *KubeconfigLoader) SetClientOptions(timeout time.Duration, qps float32, burst int) {
	l.timeout = timeout
	l.qps = qps
	l.burst = burst
}

// NewKubeconfigLoader discovers all kubeconfig file paths from $KUBECONFIG
// or falls back to ~/.kube/config.
func NewKubeconfigLoader() *KubeconfigLoader {
	return &KubeconfigLoader{paths: kubeconfigPaths()}
}

// NewKubeconfigLoaderFromPaths creates a loader that reads from the given file paths.
func NewKubeconfigLoaderFromPaths(paths []string) *KubeconfigLoader {
	return &KubeconfigLoader{paths: paths}
}

// Paths returns the list of kubeconfig file paths being used.
func (l *KubeconfigLoader) Paths() []string {
	return l.paths
}

// ResolvedPath returns the expanded kubeconfig paths joined with the OS
// path separator so tools like Helm that accept a single path string can
// locate the merged kubeconfig.
func (l *KubeconfigLoader) ResolvedPath() string {
	expanded := make([]string, 0, len(l.paths))
	for _, p := range l.paths {
		if strings.HasPrefix(p, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				p = filepath.Join(home, p[2:])
			}
		}
		expanded = append(expanded, p)
	}
	return strings.Join(expanded, string(filepath.ListSeparator))
}

// SetPaths replaces the loader's kubeconfig file paths.
// Tilde prefixes are expanded to the user's home directory.
func (l *KubeconfigLoader) SetPaths(paths []string) {
	l.paths = expandPaths(paths)
}

// AddPath appends a kubeconfig file path if not already present.
func (l *KubeconfigLoader) AddPath(path string) {
	for _, existing := range l.paths {
		if existing == path {
			return
		}
	}
	l.paths = append(l.paths, path)
}

// kubeconfigPaths returns an ordered list of kubeconfig files to merge.
func kubeconfigPaths() []string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		parts := strings.Split(env, string(os.PathListSeparator))
		var valid []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				valid = append(valid, p)
			}
		}
		if len(valid) > 0 {
			return valid
		}
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return []string{}
	}
	return []string{filepath.Join(home, ".kube", "config")}
}

// expandPaths resolves tilde prefixes to the user's home directory.
func expandPaths(paths []string) []string {
	home, _ := os.UserHomeDir()
	out := make([]string, len(paths))
	for i, p := range paths {
		if home != "" && strings.HasPrefix(p, "~/") {
			p = filepath.Join(home, p[2:])
		}
		out[i] = p
	}
	return out
}

// Load reads and merges kubeconfigs from all paths. Returns an error if any
// path cannot be read or parsed.
func (l *KubeconfigLoader) Load() (*clientcmdapi.Config, error) {
	resolved := expandPaths(l.paths)
	for _, p := range resolved {
		if _, err := os.Stat(p); err != nil {
			return nil, fmt.Errorf("kubeconfig path %q: %w", p, err)
		}
	}

	rules := &clientcmd.ClientConfigLoadingRules{Precedence: resolved}
	cfg, err := rules.Load()
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}
	return cfg, nil
}

// ListContexts returns all contexts from the merged kubeconfig.
func (l *KubeconfigLoader) ListContexts() ([]ContextInfo, error) {
	cfg, err := l.Load()
	if err != nil {
		return nil, err
	}

	var out []ContextInfo
	for name, ctx := range cfg.Contexts {
		server := ""
		if cluster, ok := cfg.Clusters[ctx.Cluster]; ok {
			server = cluster.Server
		}
		authType := authTypeFor(cfg, ctx.AuthInfo)
		provider := detectAuthProvider(cfg, name)
		out = append(out, ContextInfo{
			Name:         name,
			Cluster:      ctx.Cluster,
			Namespace:    ctx.Namespace,
			AuthInfo:     ctx.AuthInfo,
			Server:       server,
			IsCurrent:    name == cfg.CurrentContext,
			AuthType:     authType,
			AuthProvider: provider,
		})
	}
	return out, nil
}

// DetectProvider identifies the cloud/tool provider for a kubeconfig context.
// It delegates to detectAuthProvider using the provided config.
func (l *KubeconfigLoader) DetectProvider(cfg *clientcmdapi.Config, contextName string) string {
	return detectAuthProvider(cfg, contextName)
}

// detectAuthProvider identifies the cloud/tool provider for a kubeconfig context
// by inspecting the exec plugin command, server URL, and context/cluster names.
func detectAuthProvider(cfg *clientcmdapi.Config, contextName string) string {
	ctx, ok := cfg.Contexts[contextName]
	if !ok {
		return "generic"
	}

	// Check exec plugin command first (most reliable signal).
	if ai, ok := cfg.AuthInfos[ctx.AuthInfo]; ok && ai.Exec != nil {
		cmd := filepath.Base(ai.Exec.Command)
		switch {
		case cmd == "aws" || cmd == "aws-iam-authenticator":
			return "eks"
		case cmd == "gke-gcloud-auth-plugin" || cmd == "gcloud":
			return "gke"
		case cmd == "kubelogin":
			return "aks"
		}
	}

	// Check auth provider name (older kubeconfigs).
	if ai, ok := cfg.AuthInfos[ctx.AuthInfo]; ok && ai.AuthProvider != nil {
		switch ai.AuthProvider.Name {
		case "gcp":
			return "gke"
		case "azure":
			return "aks"
		case "oidc":
			// OIDC could be anything, check server URL below
		}
	}

	// Fall back to server URL and context/cluster name heuristics.
	server := ""
	clusterName := ctx.Cluster
	if c, ok := cfg.Clusters[ctx.Cluster]; ok {
		server = c.Server
	}
	lowerServer := strings.ToLower(server)
	lowerCtx := strings.ToLower(contextName)
	lowerCluster := strings.ToLower(clusterName)

	switch {
	case strings.Contains(lowerServer, ".eks.amazonaws.com") ||
		(strings.Contains(lowerServer, "eks") && strings.Contains(lowerServer, "amazonaws")):
		return "eks"
	case strings.Contains(lowerServer, "container.googleapis.com"):
		return "gke"
	case strings.Contains(lowerServer, ".azmk8s.io") ||
		(strings.Contains(lowerServer, "hcp.") && strings.Contains(lowerServer, "azmk8s")):
		return "aks"
	case lowerCtx == "minikube" || lowerCluster == "minikube":
		return "minikube"
	case strings.HasPrefix(lowerCtx, "kind-") || strings.HasPrefix(lowerCluster, "kind-"):
		return "kind"
	case lowerCtx == "docker-desktop" || lowerCluster == "docker-desktop":
		return "docker-desktop"
	case lowerCtx == "rancher-desktop" || lowerCluster == "rancher-desktop":
		return "rancher-desktop"
	}

	return "generic"
}

// authTypeFor classifies the auth mechanism used by an authInfo entry.
func authTypeFor(cfg *clientcmdapi.Config, authName string) string {
	ai, ok := cfg.AuthInfos[authName]
	if !ok {
		return "unknown"
	}
	switch {
	case ai.Exec != nil:
		return "exec"
	case ai.AuthProvider != nil:
		return ai.AuthProvider.Name
	case ai.Token != "" || ai.TokenFile != "":
		return "token"
	case ai.ClientCertificate != "" || len(ai.ClientCertificateData) > 0:
		return "certificate"
	case ai.Username != "":
		return "basic"
	}
	return "unknown"
}

// RestConfigForContext creates a rest.Config for a specific context.
func (l *KubeconfigLoader) RestConfigForContext(contextName string) (*rest.Config, error) {
	rules := &clientcmd.ClientConfigLoadingRules{Precedence: l.paths}
	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}
	cc := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, overrides)
	cfg, err := cc.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest.Config for context %q: %w", contextName, err)
	}
	timeout := l.timeout
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	qps := l.qps
	if qps == 0 {
		qps = 50
	}
	burst := l.burst
	if burst == 0 {
		burst = 100
	}
	cfg.Timeout = timeout
	cfg.QPS = qps
	cfg.Burst = burst
	return cfg, nil
}

// ValidateContext checks that a context's cluster and user entries are present.
func (l *KubeconfigLoader) ValidateContext(contextName string) error {
	cfg, err := l.Load()
	if err != nil {
		return err
	}
	ctx, ok := cfg.Contexts[contextName]
	if !ok {
		return fmt.Errorf("context %q not found in kubeconfig", contextName)
	}
	if ctx.Cluster == "" {
		return fmt.Errorf("context %q has no cluster reference", contextName)
	}
	cluster, ok := cfg.Clusters[ctx.Cluster]
	if !ok {
		return fmt.Errorf("cluster %q referenced by context %q not found", ctx.Cluster, contextName)
	}
	if cluster.Server == "" {
		return fmt.Errorf("cluster %q has no server URL", ctx.Cluster)
	}
	if ctx.AuthInfo != "" {
		if _, ok := cfg.AuthInfos[ctx.AuthInfo]; !ok {
			return fmt.Errorf("user %q referenced by context %q not found", ctx.AuthInfo, contextName)
		}
	}
	return nil
}
