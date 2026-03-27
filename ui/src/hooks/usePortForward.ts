import { useCallback } from "react";
import {
  StartPortForward,
  StartServicePortForward,
  type PortForwardOptions,
  type PortForwardResult,
} from "@/wailsjs/go/handlers/StreamHandler";
import { useToastStore } from "@/stores/toastStore";

/**
 * Detect whether an error message indicates a port conflict.
 */
function isPortConflict(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("address already in use") ||
    lower.includes("bind:") ||
    lower.includes("port is already allocated") ||
    lower.includes("port already in use")
  );
}

/**
 * Format a user-friendly error message for port forward failures.
 */
function formatPortForwardError(err: unknown, localPort: number): { title: string; description: string } {
  const message = err instanceof Error ? err.message : String(err);

  if (isPortConflict(message)) {
    return {
      title: `Port ${localPort} is already in use`,
      description: `Local port ${localPort} is occupied by another process or port forward. Try a different local port.`,
    };
  }

  return {
    title: "Port forward failed",
    description: message,
  };
}

/**
 * Hook providing port forward operations with toast-based error handling
 * and port conflict detection.
 */
export function usePortForward() {
  const addToast = useToastStore((s) => s.addToast);

  const startPortForward = useCallback(
    async (opts: PortForwardOptions): Promise<PortForwardResult | null> => {
      try {
        const result = await StartPortForward(opts);
        addToast({
          type: "success",
          title: "Port forward started",
          description: `${opts.podName}:${opts.podPort} -> localhost:${result.localPort}`,
        });
        return result;
      } catch (err) {
        const { title, description } = formatPortForwardError(err, opts.localPort);
        addToast({ type: "error", title, description });
        return null;
      }
    },
    [addToast]
  );

  const startServicePortForward = useCallback(
    async (
      namespace: string,
      serviceName: string,
      servicePort: number,
      localPort: number
    ): Promise<PortForwardResult | null> => {
      try {
        const result = await StartServicePortForward(
          namespace,
          serviceName,
          servicePort,
          localPort
        );
        addToast({
          type: "success",
          title: "Port forward started",
          description: `${serviceName}:${servicePort} (via ${result.podName}) -> localhost:${result.localPort}`,
        });
        return result;
      } catch (err) {
        const { title, description } = formatPortForwardError(err, localPort);
        addToast({ type: "error", title, description });
        return null;
      }
    },
    [addToast]
  );

  return { startPortForward, startServicePortForward };
}
