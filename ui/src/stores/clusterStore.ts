// src/stores/clusterStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSettingsStore } from "./settingsStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClusterStatus = "connected" | "connecting" | "disconnected" | "error";

export interface ClusterInfo {
  name: string;
  server: string;
  status: ClusterStatus;
  color: string;       // hex color for identification
  contextName: string; // kubeconfig context name
  authProvider?: string; // "eks", "gke", "aks", "minikube", etc.
}

export interface CustomResourceDef {
  label: string;
  group: string;
  resource: string;
  path: string;         // e.g. /custom/cert-manager.io/certificates
}

interface ClusterState {
  // Data
  activeCluster: string | null;
  clusters: ClusterInfo[];
  namespaces: string[];
  selectedNamespace: string;
  k8sVersion: string | null;
  customResources: CustomResourceDef[];
  connectionError: string | null;

  // Actions
  setActiveCluster: (name: string | null) => void;
  setClusters: (clusters: ClusterInfo[]) => void;
  updateClusterStatus: (name: string, status: ClusterStatus) => void;
  connectCluster: (name: string) => void;
  disconnectCluster: () => void;
  setNamespaces: (ns: string[]) => void;
  setNamespace: (ns: string) => void;
  setK8sVersion: (v: string) => void;
  setCustomResources: (crds: CustomResourceDef[]) => void;
  setConnectionError: (err: string | null) => void;
}

// Assign a deterministic color from a palette based on cluster name
const CLUSTER_COLORS = [
  "#7C5CFC", "#4ADE80", "#F59E0B", "#F87171",
  "#60A5FA", "#A78BFA", "#34D399", "#FB923C",
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length]!;
}

export const useClusterStore = create<ClusterState>()(
  persist(
    (set, _get) => ({
      activeCluster: null,
      clusters: [],
      namespaces: [],
      selectedNamespace: "",
      k8sVersion: null,
      customResources: [],
      connectionError: null,

      setActiveCluster: (name) => set({ activeCluster: name }),

      setClusters: (clusters) => set({ clusters }),

      updateClusterStatus: (name, status) =>
        set((s) => ({
          clusters: s.clusters.map((c) =>
            c.name === name ? { ...c, status } : c
          ),
        })),

      connectCluster: async (name) => {
        // Optimistic update: mark as connecting
        set((s) => ({
          activeCluster: name,
          clusters: s.clusters.map((c) =>
            c.name === name ? { ...c, status: "connecting" } : c
          ),
          connectionError: null,
        }));

        try {
          // Call Wails Go backend
          const { ConnectCluster } = await import("../wailsjs/go/main/App");
          await ConnectCluster(name);

          set((s) => ({
            clusters: s.clusters.map((c) =>
              c.name === name ? { ...c, status: "connected" } : c
            ),
          }));

          // Fetch namespaces after successful connection
          try {
            const { ListNamespaces } = await import("../wailsjs/go/handlers/ClusterHandler");
            const ns = await ListNamespaces();
            set({ namespaces: ns ?? [] });

            // Apply default namespace from settings if it exists in the cluster
            const defaultNs = useSettingsStore.getState().defaultNamespace;
            if (defaultNs && ns?.includes(defaultNs)) {
              set({ selectedNamespace: defaultNs });
            }
          } catch (nsErr) {
            console.warn("[ClusterStore] Failed to fetch namespaces:", nsErr);
          }
        } catch (err) {
          console.error("[ClusterStore] Connection failed:", err);
          set((s) => ({
            activeCluster: null,
            clusters: s.clusters.map((c) =>
              c.name === name ? { ...c, status: "error" } : c
            ),
            connectionError: err instanceof Error ? err.message : String(err),
          }));
        }
      },

      disconnectCluster: () =>
        set((s) => ({
          activeCluster: null,
          clusters: s.clusters.map((c) =>
            c.name === s.activeCluster ? { ...c, status: "disconnected" } : c
          ),
          namespaces: [],
          selectedNamespace: "",
          k8sVersion: null,
          customResources: [],
        })),

      setNamespaces: (ns) => set({ namespaces: ns }),
      setNamespace:  (ns) => set({ selectedNamespace: ns }),
      setK8sVersion: (v)  => set({ k8sVersion: v }),
      setCustomResources: (crds) => set({ customResources: crds }),
      setConnectionError: (err)  => set({ connectionError: err }),
    }),
    {
      name: "kubeviewer-cluster",
      // Persist cluster list, selection, and last active cluster name (not live status)
      partialize: (s) => ({
        activeCluster: s.activeCluster,
        clusters: s.clusters.map((c) => ({ ...c, status: "disconnected" as ClusterStatus })),
        selectedNamespace: s.selectedNamespace,
      }),
    }
  )
);
