import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { AppShell } from './layouts/AppShell'
import { ViewSkeleton } from './components/skeletons/ViewSkeleton'
import { NotFound } from './views/NotFound'
import { Welcome } from './views/Welcome'
import { useClusterStore } from './stores/clusterStore'
import { ThemeProvider } from './providers/ThemeProvider'
import { SettingsProvider, getSavedRoute, clearSavedRoute } from './providers/SettingsProvider'
import { RoutePersist } from './components/RoutePersist'

// Eagerly loaded (critical path)
import { ClusterOverview } from './pages/ClusterOverview'

// Lazy loaded heavy views
const PodList = lazy(() => import('./pages/PodList').then((m) => ({ default: m.PodList })))
const DeploymentList = lazy(() =>
  import('./pages/DeploymentList').then((m) => ({ default: m.DeploymentList }))
)
const StatefulSetList = lazy(() =>
  import('./pages/StatefulSetList').then((m) => ({ default: m.StatefulSetList }))
)
const DaemonSetList = lazy(() =>
  import('./pages/DaemonSetList').then((m) => ({ default: m.DaemonSetList }))
)
const ReplicaSetList = lazy(() =>
  import('./pages/ReplicaSetList').then((m) => ({ default: m.ReplicaSetList }))
)
const JobList = lazy(() => import('./pages/JobList').then((m) => ({ default: m.JobList })))
const CronJobList = lazy(() =>
  import('./pages/CronJobList').then((m) => ({ default: m.CronJobList }))
)

const ServiceList = lazy(() =>
  import('./pages/ServiceList').then((m) => ({ default: m.ServiceList }))
)
const IngressList = lazy(() =>
  import('./pages/IngressList').then((m) => ({ default: m.IngressList }))
)
const EndpointList = lazy(() =>
  import('./pages/EndpointList').then((m) => ({ default: m.EndpointList }))
)
const NetworkPolicyList = lazy(() =>
  import('./pages/NetworkPolicyList').then((m) => ({ default: m.NetworkPolicyList }))
)

const ConfigMapList = lazy(() =>
  import('./pages/ConfigMapList').then((m) => ({ default: m.ConfigMapList }))
)
const SecretList = lazy(() =>
  import('./pages/SecretList').then((m) => ({ default: m.SecretList }))
)
const SecretDetail = lazy(() =>
  import('./pages/SecretDetail').then((m) => ({ default: m.SecretDetail }))
)
const ResourceQuotaList = lazy(() =>
  import('./pages/ResourceQuotaList').then((m) => ({ default: m.ResourceQuotaList }))
)
const LimitRangeList = lazy(() =>
  import('./pages/LimitRangeList').then((m) => ({ default: m.LimitRangeList }))
)
const HPAList = lazy(() => import('./pages/HPAList').then((m) => ({ default: m.HPAList })))
const PDBList = lazy(() => import('./pages/PDBList').then((m) => ({ default: m.PDBList })))

const PVCList = lazy(() => import('./pages/PVCList').then((m) => ({ default: m.PVCList })))
const PVList = lazy(() => import('./pages/PVList').then((m) => ({ default: m.PVList })))
const StorageClassList = lazy(() =>
  import('./pages/StorageClassList').then((m) => ({ default: m.StorageClassList }))
)

const ServiceAccountList = lazy(() =>
  import('./pages/ServiceAccountList').then((m) => ({ default: m.ServiceAccountList }))
)
const RBACList = lazy(() => import('./pages/RBACList').then((m) => ({ default: m.RBACList })))

const NodeList = lazy(() => import('./pages/NodeList').then((m) => ({ default: m.NodeList })))
const NamespaceList = lazy(() =>
  import('./pages/NamespaceList').then((m) => ({ default: m.NamespaceList }))
)
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })))
const CRDList = lazy(() => import('./pages/CRDList').then((m) => ({ default: m.CRDList })))
const PriorityClassList = lazy(() => import('./pages/PriorityClassList').then((m) => ({ default: m.PriorityClassList })))

const HelmReleaseList = lazy(() =>
  import('./pages/HelmReleaseList').then((m) => ({ default: m.HelmReleaseList }))
)
const HelmReleaseDetail = lazy(() =>
  import('./pages/HelmReleaseDetail').then((m) => ({ default: m.HelmReleaseDetail }))
)

const Topology = lazy(() => import('./pages/Topology').then((m) => ({ default: m.Topology })))
const Metrics = lazy(() => import('./pages/Metrics').then((m) => ({ default: m.Metrics })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

const TroubleshootingPanel = lazy(() => import('./pages/TroubleshootingPanel').then((m) => ({ default: m.TroubleshootingPanel })))
const DeploymentWizard = lazy(() => import('./pages/DeploymentWizard').then((m) => ({ default: m.DeploymentWizard })))
const ServiceWizard = lazy(() => import('./pages/ServiceWizard').then((m) => ({ default: m.ServiceWizard })))
const ConfigMapWizard = lazy(() => import('./pages/ConfigMapWizard').then((m) => ({ default: m.ConfigMapWizard })))
const SecretWizard = lazy(() => import('./pages/SecretWizard').then((m) => ({ default: m.SecretWizard })))
const TemplatesPage = lazy(() => import('./pages/Templates').then((m) => ({ default: m.Templates })))
const AlertsPage = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })))
const AuditLogPage = lazy(() => import('./pages/AuditLog').then((m) => ({ default: m.AuditLog })))
const BackupRestorePage = lazy(() => import('./pages/BackupRestore').then((m) => ({ default: m.BackupRestore })))
const GitOpsPage = lazy(() => import('./pages/GitOps').then((m) => ({ default: m.GitOps })))
const SecurityOverviewPage = lazy(() => import('./pages/SecurityOverview').then((m) => ({ default: m.SecurityOverview })))
const RBACGraphPage = lazy(() => import('./pages/RBACGraph').then((m) => ({ default: m.RBACGraph })))
const NetworkPolicyGraphPage = lazy(() => import('./pages/NetworkPolicyGraph').then((m) => ({ default: m.NetworkPolicyGraph })))

function RequireCluster({ children }: { children: React.ReactNode }) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  if (!activeCluster) {
    return <Navigate to="/welcome" replace />
  }
  return <>{children}</>
}

/** Restores the saved route from config on first render after cluster connection. */
function RouteRestorer() {
  const navigate = useNavigate()
  const location = useLocation()
  const restored = useRef(false)
  const activeCluster = useClusterStore((s) => s.activeCluster)

  useEffect(() => {
    if (restored.current || !activeCluster) return
    restored.current = true

    const savedRoute = getSavedRoute()
    if (savedRoute && savedRoute !== location.pathname && savedRoute !== '/welcome') {
      clearSavedRoute()
      navigate(savedRoute, { replace: true })
    }
  }, [activeCluster, navigate, location.pathname])

  return null
}

function LazyView({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ViewSkeleton />}>{children}</Suspense>
}

export default function App() {
  return (
    <SettingsProvider>
    <ThemeProvider>
      <HashRouter>
        <RoutePersist />
        <RouteRestorer />
        <Routes>
          {/* Welcome screen - no shell */}
          <Route path="/welcome" element={<Welcome />} />

          {/* App shell wraps all authenticated routes */}
          <Route
            path="/*"
            element={
              <RequireCluster>
                <AppShell />
              </RequireCluster>
            }
          >
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<ClusterOverview />} />

            {/* Workloads */}
            <Route path="workloads/pods" element={<LazyView><PodList /></LazyView>} />
            <Route path="workloads/pods/:namespace/:name" element={<LazyView><PodList /></LazyView>} />
            <Route path="workloads/deployments" element={<LazyView><DeploymentList /></LazyView>} />
            <Route path="workloads/deployments/:namespace/:name" element={<LazyView><DeploymentList /></LazyView>} />
            <Route path="workloads/statefulsets" element={<LazyView><StatefulSetList /></LazyView>} />
            <Route path="workloads/daemonsets" element={<LazyView><DaemonSetList /></LazyView>} />
            <Route path="workloads/replicasets" element={<LazyView><ReplicaSetList /></LazyView>} />
            <Route path="workloads/jobs" element={<LazyView><JobList /></LazyView>} />
            <Route path="workloads/cronjobs" element={<LazyView><CronJobList /></LazyView>} />

            {/* Networking */}
            <Route path="networking/services" element={<LazyView><ServiceList /></LazyView>} />
            <Route path="networking/services/:namespace/:name" element={<LazyView><ServiceList /></LazyView>} />
            <Route path="networking/ingresses" element={<LazyView><IngressList /></LazyView>} />
            <Route path="networking/endpoints" element={<LazyView><EndpointList /></LazyView>} />
            <Route path="networking/networkpolicies" element={<LazyView><NetworkPolicyList /></LazyView>} />

            {/* Config */}
            <Route path="config/configmaps" element={<LazyView><ConfigMapList /></LazyView>} />
            <Route path="config/secrets" element={<LazyView><SecretList /></LazyView>} />
            <Route path="config/secrets/:namespace/:name" element={<LazyView><SecretDetail /></LazyView>} />
            <Route path="config/resourcequotas" element={<LazyView><ResourceQuotaList /></LazyView>} />
            <Route path="config/limitranges" element={<LazyView><LimitRangeList /></LazyView>} />
            <Route path="config/hpas" element={<LazyView><HPAList /></LazyView>} />
            <Route path="config/pdbs" element={<LazyView><PDBList /></LazyView>} />

            {/* Storage */}
            <Route path="storage/pvcs" element={<LazyView><PVCList /></LazyView>} />
            <Route path="storage/pvs" element={<LazyView><PVList /></LazyView>} />
            <Route path="storage/storageclasses" element={<LazyView><StorageClassList /></LazyView>} />

            {/* RBAC */}
            <Route path="rbac/serviceaccounts" element={<LazyView><ServiceAccountList /></LazyView>} />
            <Route path="rbac/roles" element={<LazyView><RBACList /></LazyView>} />
            <Route path="rbac/clusterroles" element={<LazyView><RBACList /></LazyView>} />
            <Route path="rbac/rolebindings" element={<LazyView><RBACList /></LazyView>} />
            <Route path="rbac/clusterrolebindings" element={<LazyView><RBACList /></LazyView>} />

            {/* Cluster */}
            <Route path="cluster/nodes" element={<LazyView><NodeList /></LazyView>} />
            <Route path="cluster/nodes/:name" element={<LazyView><NodeList /></LazyView>} />
            <Route path="cluster/namespaces" element={<LazyView><NamespaceList /></LazyView>} />
            <Route path="cluster/events" element={<LazyView><Events /></LazyView>} />
            <Route path="cluster/priorityclasses" element={<LazyView><PriorityClassList /></LazyView>} />
            <Route path="cluster/crds" element={<LazyView><CRDList /></LazyView>} />

            {/* Helm */}
            <Route path="helm/releases" element={<LazyView><HelmReleaseList /></LazyView>} />
            <Route path="helm/releases/:namespace/:name" element={<LazyView><HelmReleaseDetail /></LazyView>} />

            {/* Custom Resources */}
            <Route path="custom/:group/:resource" element={<LazyView><CRDList /></LazyView>} />
            <Route path="custom/:group/:resource/:name" element={<LazyView><CRDList /></LazyView>} />

            {/* Views (legacy paths) */}
            <Route path="node-map" element={<Navigate to="/cluster/nodes" replace />} />
            <Route path="topology" element={<LazyView><Topology /></LazyView>} />
            <Route path="metrics" element={<LazyView><Metrics /></LazyView>} />

            {/* Troubleshooting */}
            <Route path="troubleshoot" element={<LazyView><TroubleshootingPanel /></LazyView>} />

            {/* Wizards */}
            <Route path="wizards/deployment" element={<LazyView><DeploymentWizard /></LazyView>} />
            <Route path="wizards/service" element={<LazyView><ServiceWizard /></LazyView>} />
            <Route path="wizards/configmap" element={<LazyView><ConfigMapWizard /></LazyView>} />
            <Route path="wizards/secret" element={<LazyView><SecretWizard /></LazyView>} />
            <Route path="wizards/templates" element={<LazyView><TemplatesPage /></LazyView>} />

            {/* Security */}
            <Route path="security/overview" element={<LazyView><SecurityOverviewPage /></LazyView>} />
            <Route path="security/rbac-graph" element={<LazyView><RBACGraphPage /></LazyView>} />

            {/* Operations */}
            <Route path="ops/alerts" element={<LazyView><AlertsPage /></LazyView>} />
            <Route path="ops/audit" element={<LazyView><AuditLogPage /></LazyView>} />
            <Route path="ops/backup" element={<LazyView><BackupRestorePage /></LazyView>} />
            <Route path="ops/gitops" element={<LazyView><GitOpsPage /></LazyView>} />
            <Route path="ops/netpol-graph" element={<LazyView><NetworkPolicyGraphPage /></LazyView>} />

            {/* Settings */}
            <Route path="settings/*" element={<LazyView><Settings /></LazyView>} />

            {/* Legacy route redirects */}
            <Route path="pods" element={<Navigate to="/workloads/pods" replace />} />
            <Route path="deployments" element={<Navigate to="/workloads/deployments" replace />} />
            <Route path="statefulsets" element={<Navigate to="/workloads/statefulsets" replace />} />
            <Route path="daemonsets" element={<Navigate to="/workloads/daemonsets" replace />} />
            <Route path="replicasets" element={<Navigate to="/workloads/replicasets" replace />} />
            <Route path="jobs" element={<Navigate to="/workloads/jobs" replace />} />
            <Route path="cronjobs" element={<Navigate to="/workloads/cronjobs" replace />} />
            <Route path="services" element={<Navigate to="/networking/services" replace />} />
            <Route path="ingresses" element={<Navigate to="/networking/ingresses" replace />} />
            <Route path="endpoints" element={<Navigate to="/networking/endpoints" replace />} />
            <Route path="network-policies" element={<Navigate to="/networking/networkpolicies" replace />} />
            <Route path="configmaps" element={<Navigate to="/config/configmaps" replace />} />
            <Route path="secrets" element={<Navigate to="/config/secrets" replace />} />
            <Route path="hpas" element={<Navigate to="/config/hpas" replace />} />
            <Route path="pvcs" element={<Navigate to="/storage/pvcs" replace />} />
            <Route path="pvs" element={<Navigate to="/storage/pvs" replace />} />
            <Route path="storage-classes" element={<Navigate to="/storage/storageclasses" replace />} />
            <Route path="nodes" element={<Navigate to="/cluster/nodes" replace />} />
            <Route path="events" element={<Navigate to="/cluster/events" replace />} />
            <Route path="namespaces" element={<Navigate to="/cluster/namespaces" replace />} />
            <Route path="helm" element={<Navigate to="/helm/releases" replace />} />
            <Route path="service-accounts" element={<Navigate to="/rbac/serviceaccounts" replace />} />
            <Route path="rbac" element={<Navigate to="/rbac/roles" replace />} />
            <Route path="resource-quotas" element={<Navigate to="/config/resourcequotas" replace />} />
            <Route path="limit-ranges" element={<Navigate to="/config/limitranges" replace />} />
            <Route path="crds" element={<Navigate to="/custom/all/crds" replace />} />
            <Route path="pdbs" element={<Navigate to="/config/pdbs" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
    </SettingsProvider>
  )
}
