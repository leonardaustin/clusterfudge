import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Cable, X, ExternalLink, Play, RefreshCw, Box } from "lucide-react";
import {
  ListPortForwards,
  StopPortForward,
  DiscoverPortForwards,
  StartServicePortForward,
  type PortForwardInfo,
  type DiscoveredForward,
} from "@/wailsjs/go/handlers/StreamHandler";
import { EventsOn, BrowserOpenURL } from "@/wailsjs/runtime/runtime";
import { useToastStore } from "@/stores/toastStore";
import { useClusterStore } from "@/stores/clusterStore";

const POLL_INTERVAL = 5_000;

function openInBrowser(localPort: number) {
  BrowserOpenURL(`http://localhost:${localPort}`);
}

export function PortForwardIndicator() {
  const [forwards, setForwards] = useState<PortForwardInfo[]>([]);
  const [presets, setPresets] = useState<DiscoveredForward[]>([]);
  const [expanded, setExpanded] = useState(false);
  const activeCluster = useClusterStore((s) => s.activeCluster);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const result = await ListPortForwards();
      setForwards(result);
    } catch (err) {
      console.error("[PortForwardIndicator] ListPortForwards failed:", err);
    }
  }, []);

  // Discover presets when cluster connects
  useEffect(() => {
    if (!activeCluster) {
      setPresets([]);
      return;
    }
    DiscoverPortForwards("")
      .then((result) => setPresets(result || []))
      .catch(() => setPresets([]));
  }, [activeCluster]);

  // Auto-start presets with autoStart=true
  useEffect(() => {
    if (presets.length === 0) return;
    const autoStartPresets = presets.filter((p) => p.autoStart);
    for (const preset of autoStartPresets) {
      // Only auto-start if not already forwarded
      const alreadyActive = forwards.some(
        (f) => f.localPort === preset.localPort && f.namespace === preset.namespace
      );
      if (!alreadyActive) {
        StartServicePortForward(preset.namespace, preset.serviceName, preset.servicePort, preset.localPort)
          .then(() => refresh())
          .catch((err) => {
            console.error("[PortForwardIndicator] auto-start failed:", preset.serviceName, err);
          });
      }
    }
  }, [presets, forwards, refresh]);

  useEffect(() => {
    let active = true;
    ListPortForwards()
      .then((result) => { if (active) setForwards(result); })
      .catch((err) => { console.error("[PortForwardIndicator] ListPortForwards failed:", err); });
    const interval = setInterval(() => {
      ListPortForwards()
        .then((result) => { if (active) setForwards(result); })
        .catch((err) => { console.error("[PortForwardIndicator] ListPortForwards failed:", err); });
    }, POLL_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Listen for reconnecting/reconnected/stopped events and refresh the list.
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    for (const f of forwards) {
      const reconnectingUnsub = EventsOn(
        `portforward:reconnecting:${f.localPort}`,
        () => { refresh(); }
      );
      cleanups.push(reconnectingUnsub);

      const reconnectedUnsub = EventsOn(
        `portforward:reconnected:${f.localPort}`,
        () => {
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Port forward reconnected',
            description: `localhost:${f.localPort} -> ${f.podName}:${f.podPort}`,
          });
          refresh();
        }
      );
      cleanups.push(reconnectedUnsub);

      const stoppedUnsub = EventsOn(
        `portforward:stopped:${f.localPort}`,
        (...args: unknown[]) => {
          const data = (args[0] || {}) as Record<string, unknown>;
          const reason = (data.reason as string) || 'unknown';
          useToastStore.getState().addToast({
            type: 'info',
            title: 'Port forward stopped',
            description: `${f.podName}:${f.podPort} -> localhost:${f.localPort} (${reason})`,
          });
          refresh();
        }
      );
      cleanups.push(stoppedUnsub);
    }

    return () => {
      for (const unsub of cleanups) {
        unsub();
      }
    };
  }, [forwards, refresh]);

  // Listen for system wake events to force immediate refresh.
  useEffect(() => {
    const unsub = EventsOn('system:wake', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Reconnecting port forwards after sleep...',
      });
      refresh();
    });
    return unsub;
  }, [refresh]);

  const handleStop = useCallback(
    async (localPort: number) => {
      try {
        await StopPortForward(localPort);
      } catch (err) {
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to stop port forward', description: err instanceof Error ? err.message : String(err) });
      }
      refresh();
    },
    [refresh]
  );

  const handleStartPreset = useCallback(
    async (preset: DiscoveredForward) => {
      try {
        await StartServicePortForward(
          preset.namespace,
          preset.serviceName,
          preset.servicePort,
          preset.localPort
        );
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Failed to start port forward',
          description: err instanceof Error ? err.message : String(err),
        });
      }
      refresh();
    },
    [refresh]
  );

  // Filter presets to only show those not already active
  const availablePresets = presets.filter(
    (p) => !forwards.some(
      (f) => f.localPort === p.localPort && f.namespace === p.namespace
    )
  );

  const hasContent = forwards.length > 0 || availablePresets.length > 0;

  if (!hasContent) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors px-2 py-0.5 rounded"
      >
        <Cable className="w-3 h-3" />
        <span>
          {forwards.length > 0
            ? `${forwards.length} forward${forwards.length !== 1 ? "s" : ""}`
            : `${availablePresets.length} preset${availablePresets.length !== 1 ? "s" : ""}`}
        </span>
      </button>

      {expanded && (
        <div className="absolute bottom-full right-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg min-w-56 z-50">
          {availablePresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b border-border text-xs text-text-tertiary">
                Suggested Forwards
              </div>
              {availablePresets.map((p) => (
                <div
                  key={`${p.namespace}/${p.serviceName}:${p.servicePort}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-xs"
                >
                  <span className="text-text-primary flex-1">
                    {p.label}
                    <span className="ml-1 text-text-tertiary">
                      :{p.servicePort} &rarr; :{p.localPort}
                    </span>
                  </span>
                  <button
                    onClick={() => handleStartPreset(p)}
                    className="p-0.5 text-text-tertiary hover:text-accent rounded transition-colors"
                    title="Start"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}

          {forwards.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b border-border text-xs text-text-tertiary">
                Active Port Forwards
              </div>
              {forwards.map((f) => (
                <div
                  key={f.localPort}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-xs"
                >
                  <span className="text-text-primary flex-1">
                    {f.podName}:{f.podPort} &rarr; localhost:{f.localPort}
                    {f.status === "reconnecting" && (
                      <span className="ml-1 text-status-warning inline-flex items-center gap-0.5">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        Reconnecting ({f.reconnectNum}/5)...
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      navigate(`/workloads/pods/${f.namespace}/${f.podName}`);
                      setExpanded(false);
                    }}
                    className="p-0.5 text-text-tertiary hover:text-accent rounded transition-colors"
                    title="Go to pod"
                  >
                    <Box className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => openInBrowser(f.localPort)}
                    className="p-0.5 text-text-tertiary hover:text-accent rounded transition-colors"
                    title="Open in browser"
                    disabled={f.status === "reconnecting"}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleStop(f.localPort)}
                    className="p-0.5 text-text-tertiary hover:text-status-error rounded transition-colors"
                    title="Stop"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
