package cluster

import (
	"testing"

	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestDetectAuthProvider(t *testing.T) {
	tests := []struct {
		name     string
		cfg      *clientcmdapi.Config
		ctxName  string
		expected string
	}{
		{
			name: "EKS via aws exec plugin",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"eks-prod": {Cluster: "eks-prod", AuthInfo: "eks-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"eks-prod": {Server: "https://ABCDEF.gr7.us-east-1.eks.amazonaws.com"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"eks-user": {Exec: &clientcmdapi.ExecConfig{Command: "aws"}}},
			},
			ctxName:  "eks-prod",
			expected: "eks",
		},
		{
			name: "EKS via aws-iam-authenticator",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"eks-dev": {Cluster: "eks-dev", AuthInfo: "eks-iam"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"eks-dev": {Server: "https://XYZ.gr7.us-west-2.eks.amazonaws.com"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"eks-iam": {Exec: &clientcmdapi.ExecConfig{Command: "aws-iam-authenticator"}}},
			},
			ctxName:  "eks-dev",
			expected: "eks",
		},
		{
			name: "GKE via gke-gcloud-auth-plugin",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"gke_project_zone_cluster": {Cluster: "gke-cluster", AuthInfo: "gke-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"gke-cluster": {Server: "https://1.2.3.4"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"gke-user": {Exec: &clientcmdapi.ExecConfig{Command: "gke-gcloud-auth-plugin"}}},
			},
			ctxName:  "gke_project_zone_cluster",
			expected: "gke",
		},
		{
			name: "GKE via legacy gcp auth provider",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"gke-legacy": {Cluster: "gke-legacy", AuthInfo: "gke-legacy-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"gke-legacy": {Server: "https://1.2.3.4"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"gke-legacy-user": {AuthProvider: &clientcmdapi.AuthProviderConfig{Name: "gcp"}}},
			},
			ctxName:  "gke-legacy",
			expected: "gke",
		},
		{
			name: "AKS via kubelogin exec plugin",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"aks-prod": {Cluster: "aks-prod", AuthInfo: "aks-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"aks-prod": {Server: "https://aks-prod-dns-abc123.hcp.eastus.azmk8s.io:443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"aks-user": {Exec: &clientcmdapi.ExecConfig{Command: "kubelogin"}}},
			},
			ctxName:  "aks-prod",
			expected: "aks",
		},
		{
			name: "AKS via azure auth provider",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"aks-legacy": {Cluster: "aks-legacy", AuthInfo: "aks-legacy-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"aks-legacy": {Server: "https://aks-legacy.azmk8s.io"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"aks-legacy-user": {AuthProvider: &clientcmdapi.AuthProviderConfig{Name: "azure"}}},
			},
			ctxName:  "aks-legacy",
			expected: "aks",
		},
		{
			name: "EKS detected by server URL only",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"my-cluster": {Cluster: "my-cluster", AuthInfo: "my-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"my-cluster": {Server: "https://ABC123.gr7.us-east-1.eks.amazonaws.com"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"my-user": {Token: "some-token"}},
			},
			ctxName:  "my-cluster",
			expected: "eks",
		},
		{
			name: "AKS detected by server URL only",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"my-aks": {Cluster: "my-aks", AuthInfo: "aks-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"my-aks": {Server: "https://my-aks-dns.hcp.eastus.azmk8s.io:443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"aks-user": {Token: "some-token"}},
			},
			ctxName:  "my-aks",
			expected: "aks",
		},
		{
			name: "GKE detected by server URL only",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"my-gke": {Cluster: "my-gke", AuthInfo: "gke-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"my-gke": {Server: "https://container.googleapis.com/v1/projects/myproj/zones/us-east1-b/clusters/mycluster"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"gke-user": {Token: "some-token"}},
			},
			ctxName:  "my-gke",
			expected: "gke",
		},
		{
			name: "minikube detected by context name",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"minikube": {Cluster: "minikube", AuthInfo: "minikube"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"minikube": {Server: "https://192.168.49.2:8443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"minikube": {ClientCertificate: "/home/user/.minikube/profiles/minikube/client.crt"}},
			},
			ctxName:  "minikube",
			expected: "minikube",
		},
		{
			name: "kind detected by context name prefix",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"kind-my-cluster": {Cluster: "kind-my-cluster", AuthInfo: "kind-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"kind-my-cluster": {Server: "https://127.0.0.1:43619"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"kind-user": {ClientCertificate: "/tmp/cert"}},
			},
			ctxName:  "kind-my-cluster",
			expected: "kind",
		},
		{
			name: "docker-desktop detected by context name",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"docker-desktop": {Cluster: "docker-desktop", AuthInfo: "docker-desktop"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"docker-desktop": {Server: "https://kubernetes.docker.internal:6443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"docker-desktop": {ClientCertificate: "/cert"}},
			},
			ctxName:  "docker-desktop",
			expected: "docker-desktop",
		},
		{
			name: "rancher-desktop detected by context name",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"rancher-desktop": {Cluster: "rancher-desktop", AuthInfo: "rancher-desktop"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"rancher-desktop": {Server: "https://127.0.0.1:6443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"rancher-desktop": {ClientCertificate: "/cert"}},
			},
			ctxName:  "rancher-desktop",
			expected: "rancher-desktop",
		},
		{
			name: "generic for unknown provider",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"my-cluster": {Cluster: "my-cluster", AuthInfo: "my-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"my-cluster": {Server: "https://10.0.0.1:6443"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"my-user": {Token: "abc123"}},
			},
			ctxName:  "my-cluster",
			expected: "generic",
		},
		{
			name: "missing context returns generic",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{},
			},
			ctxName:  "nonexistent",
			expected: "generic",
		},
		{
			name: "exec plugin with full path",
			cfg: &clientcmdapi.Config{
				Contexts: map[string]*clientcmdapi.Context{
					"eks-full-path": {Cluster: "eks-cluster", AuthInfo: "eks-full-path-user"},
				},
				Clusters:  map[string]*clientcmdapi.Cluster{"eks-cluster": {Server: "https://eks.amazonaws.com"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"eks-full-path-user": {Exec: &clientcmdapi.ExecConfig{Command: "/usr/local/bin/aws"}}},
			},
			ctxName:  "eks-full-path",
			expected: "eks",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectAuthProvider(tt.cfg, tt.ctxName)
			if got != tt.expected {
				t.Errorf("detectAuthProvider() = %q, want %q", got, tt.expected)
			}
		})
	}
}
