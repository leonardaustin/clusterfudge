import { useEffect } from "react";
import { EventsOn } from "@/wailsjs/runtime/runtime";
import { useClusterStore } from "@/stores/clusterStore";
import { useToastStore } from "@/stores/toastStore";

interface HealthEvent {
  clusterId: string;
  status: "green" | "yellow" | "red";
  latencyMs: number;
  error?: string;
}

/**
 * Subscribes to backend cluster:health events and reflects them in the UI.
 * - Red: marks cluster as error, shows toast with the error message.
 * - Yellow: shows a warning toast for high latency.
 * - Green: ensures cluster is marked connected (recovery from red/yellow).
 */
export function useClusterHealth() {
  const updateClusterStatus = useClusterStore((s) => s.updateClusterStatus);
  const setConnectionError = useClusterStore((s) => s.setConnectionError);
  const activeCluster = useClusterStore((s) => s.activeCluster);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const cleanup = EventsOn("cluster:health", (...args: unknown[]) => {
      const event = args[0] as HealthEvent;
      if (!event?.clusterId) return;

      if (event.status === "red") {
        updateClusterStatus(event.clusterId, "error");
        const message = event.error || "Lost connection to cluster";
        if (event.clusterId === activeCluster) {
          setConnectionError(message);
        }
        addToast({
          type: "error",
          title: `${event.clusterId}: ${message}`,
        });
      } else if (event.status === "yellow") {
        addToast({
          type: "info",
          title: `${event.clusterId}: High latency (${event.latencyMs}ms)`,
        });
      } else if (event.status === "green") {
        // Recover from error/disconnected state.
        updateClusterStatus(event.clusterId, "connected");
      }
    });

    return cleanup;
  }, [activeCluster, updateClusterStatus, setConnectionError, addToast]);
}
