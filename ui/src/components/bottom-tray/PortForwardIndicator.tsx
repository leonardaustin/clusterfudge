import { useEffect, useState, useCallback } from "react";
import { Cable, X, ExternalLink, RefreshCw } from "lucide-react";
import {
  ListPortForwards,
  StopPortForward,
  type PortForwardInfo,
} from "@/wailsjs/go/handlers/StreamHandler";
import { EventsOn, BrowserOpenURL } from "@/wailsjs/runtime/runtime";
import { useToastStore } from "@/stores/toastStore";

const POLL_INTERVAL = 5_000;

function openInBrowser(localPort: number) {
  BrowserOpenURL(`http://localhost:${localPort}`);
}

export function PortForwardIndicator() {
  const [forwards, setForwards] = useState<PortForwardInfo[]>([]);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await ListPortForwards();
      setForwards(result);
    } catch (err) {
      console.error("[PortForwardIndicator] ListPortForwards failed:", err);
    }
  }, []);

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

  // Listen for reconnecting/reconnected events and refresh the list.
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
    }

    return () => {
      for (const unsub of cleanups) {
        unsub();
      }
    };
  }, [forwards, refresh]);

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

  if (forwards.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors px-2 py-0.5 rounded"
      >
        <Cable className="w-3 h-3" />
        <span>{forwards.length} forward{forwards.length !== 1 ? "s" : ""}</span>
      </button>

      {expanded && (
        <div className="absolute bottom-full right-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg min-w-48 z-50">
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
        </div>
      )}
    </div>
  );
}
