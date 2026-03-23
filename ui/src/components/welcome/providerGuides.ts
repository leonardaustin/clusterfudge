export type ProviderCategory = 'cloud' | 'local' | 'other'

export interface ProviderGuide {
  id: string
  name: string
  description: string
  category: ProviderCategory
  setupSteps: SetupStep[]
  reauthSteps?: SetupStep[]
  docsUrl?: string
}

export interface SetupStep {
  label: string
  command?: string
  note?: string
}

export const providerGuides: ProviderGuide[] = [
  {
    id: 'eks',
    name: 'AWS EKS',
    description: 'Amazon Elastic Kubernetes Service',
    category: 'cloud',
    setupSteps: [
      { label: 'Install the AWS CLI', command: 'brew install awscli', note: 'Or download from aws.amazon.com/cli' },
      { label: 'Configure AWS credentials', command: 'aws configure' },
      { label: 'Update your kubeconfig', command: 'aws eks update-kubeconfig --name <cluster-name> --region <region>' },
    ],
    reauthSteps: [
      { label: 'Re-authenticate with AWS SSO', command: 'aws sso login --profile <profile>' },
      { label: 'Or refresh session credentials', command: 'aws sts get-caller-identity', note: 'Verify your credentials are valid' },
    ],
    docsUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html',
  },
  {
    id: 'gke',
    name: 'Google GKE',
    description: 'Google Kubernetes Engine',
    category: 'cloud',
    setupSteps: [
      { label: 'Install the gcloud CLI', command: 'brew install google-cloud-sdk', note: 'Or download from cloud.google.com/sdk' },
      { label: 'Authenticate with Google Cloud', command: 'gcloud auth login' },
      { label: 'Install the auth plugin', command: 'gcloud components install gke-gcloud-auth-plugin' },
      { label: 'Get cluster credentials', command: 'gcloud container clusters get-credentials <cluster-name> --region <region> --project <project>' },
    ],
    reauthSteps: [
      { label: 'Re-authenticate with Google Cloud', command: 'gcloud auth login' },
      { label: 'Refresh application default credentials', command: 'gcloud auth application-default login' },
    ],
    docsUrl: 'https://cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl',
  },
  {
    id: 'aks',
    name: 'Azure AKS',
    description: 'Azure Kubernetes Service',
    category: 'cloud',
    setupSteps: [
      { label: 'Install the Azure CLI', command: 'brew install azure-cli', note: 'Or download from learn.microsoft.com/cli/azure' },
      { label: 'Sign in to Azure', command: 'az login' },
      { label: 'Get cluster credentials', command: 'az aks get-credentials --resource-group <group> --name <cluster-name>' },
    ],
    reauthSteps: [
      { label: 'Re-authenticate with Azure', command: 'az login' },
      { label: 'Clear cached tokens', command: 'az account clear && az login' },
    ],
    docsUrl: 'https://learn.microsoft.com/en-us/azure/aks/learn/quick-kubernetes-deploy-cli',
  },
  {
    id: 'minikube',
    name: 'minikube',
    description: 'Local Kubernetes for development',
    category: 'local',
    setupSteps: [
      { label: 'Install minikube', command: 'brew install minikube' },
      { label: 'Start a cluster', command: 'minikube start' },
    ],
    docsUrl: 'https://minikube.sigs.k8s.io/docs/start/',
  },
  {
    id: 'kind',
    name: 'kind',
    description: 'Kubernetes in Docker',
    category: 'local',
    setupSteps: [
      { label: 'Install kind', command: 'brew install kind' },
      { label: 'Create a cluster', command: 'kind create cluster' },
    ],
    docsUrl: 'https://kind.sigs.k8s.io/docs/user/quick-start/',
  },
  {
    id: 'docker-desktop',
    name: 'Docker Desktop',
    description: 'Built-in Kubernetes with Docker Desktop',
    category: 'local',
    setupSteps: [
      { label: 'Open Docker Desktop settings' },
      { label: 'Go to Kubernetes tab' },
      { label: 'Check "Enable Kubernetes"' },
      { label: 'Click "Apply & Restart"' },
    ],
    docsUrl: 'https://docs.docker.com/desktop/kubernetes/',
  },
  {
    id: 'rancher-desktop',
    name: 'Rancher Desktop',
    description: 'Open-source desktop Kubernetes',
    category: 'local',
    setupSteps: [
      { label: 'Open Rancher Desktop preferences' },
      { label: 'Enable Kubernetes under the Kubernetes tab' },
      { label: 'Select your preferred K8s version' },
    ],
    docsUrl: 'https://docs.rancherdesktop.io/',
  },
  {
    id: 'generic',
    name: 'Other / Manual',
    description: 'Configure kubeconfig manually',
    category: 'other',
    setupSteps: [
      { label: 'Obtain a kubeconfig file from your cluster admin' },
      { label: 'Place it at ~/.kube/config or set KUBECONFIG', command: 'export KUBECONFIG=/path/to/kubeconfig' },
      { label: 'Verify connectivity', command: 'kubectl cluster-info' },
    ],
  },
]

export function guideForProvider(providerId: string | undefined): ProviderGuide | undefined {
  if (!providerId) return undefined
  return providerGuides.find((g) => g.id === providerId)
}
