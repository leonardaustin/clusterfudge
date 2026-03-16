# Setup Guides & Re-Auth Help

Cloud provider setup guides on the Welcome page, plus contextual re-authentication help when credentials expire.

## Tasks

### Backend

- [x] Add `AuthProvider` field to `PreflightResult` — detect cloud provider from kubeconfig exec plugin
- [x] Add `DetectProvider` method to `KubeconfigLoader` — returns provider ID from kubeconfig
- [x] Add provider detection logic in `kubeconfig.go` — parse exec plugin command to identify EKS/GKE/AKS
- [x] Add `AuthProvider` field to `ContextInfo` for use by the Welcome page
- [x] Unit tests for provider detection logic (16 test cases)

### Frontend

- [x] Create `providerGuides.ts` — data file with setup + re-auth commands per provider
- [x] Create `SetupGuides.tsx` component — expandable provider cards with copy-to-clipboard CLI steps
- [x] Create `AuthErrorHelp.tsx` component — contextual re-auth instructions based on error + provider
- [x] Create `CopyButton.tsx` — shared clipboard copy button with error handling
- [x] Update `Welcome.tsx` — show setup guides when no clusters; discoverable link otherwise; auth help on preflight errors
- [x] Update `ConnectionBanners.tsx` — show provider-specific re-auth steps in ConnectionLostBanner
- [x] Unit tests for SetupGuides component (7 tests)
- [x] Unit tests for AuthErrorHelp component (13 tests)
- [x] Unit tests for providerGuides data (7 tests)

## Providers

| Provider | ID | Exec Plugin Command | Setup Commands | Re-Auth Commands |
|----------|-----|---------------------|----------------|------------------|
| AWS EKS | `eks` | `aws` or `aws-iam-authenticator` | `aws configure`, `aws eks update-kubeconfig` | `aws sso login` |
| GCP GKE | `gke` | `gke-gcloud-auth-plugin` or `gcloud` | `gcloud auth login`, `gcloud container clusters get-credentials` | `gcloud auth login` |
| Azure AKS | `aks` | `kubelogin` | `az login`, `az aks get-credentials` | `az login` |
| minikube | `minikube` | — (certificate auth) | `minikube start` | N/A |
| kind | `kind` | — (certificate auth) | `kind create cluster` | N/A |
| Docker Desktop | `docker-desktop` | — (certificate auth) | Enable K8s in Docker Desktop settings | N/A |
| Rancher Desktop | `rancher-desktop` | — | Enable K8s in Rancher Desktop settings | N/A |
| Generic | `generic` | — | Configure kubeconfig manually | Check credentials |
