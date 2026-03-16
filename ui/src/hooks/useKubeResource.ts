import { useState, useEffect } from "react";
import { ListResources, WatchResources, StopWatch } from "../wailsjs/go/handlers/ResourceHandler";
import type { ResourceItem } from "../wailsjs/go/handlers/ResourceHandler";
import { EventsOn } from "../wailsjs/runtime/runtime";

export interface UseKubeResourcesOptions {
  group: string;
  version: string;
  resource: string;
  namespace: string;
}

export interface WatchEvent {
  type: "ADDED" | "MODIFIED" | "DELETED";
  resource: ResourceItem;
}

export function useKubeResources(opts: UseKubeResourcesOptions) {
  const [data, setData] = useState<ResourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndWatch() {
      setIsLoading(true);
      setError(null);
      setData([]);

      // Fetch initial data
      try {
        const items = await ListResources(
          opts.group,
          opts.version,
          opts.resource,
          opts.namespace,
        );

        if (!cancelled) {
          setData(items ?? []);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
        return; // Don't start watch if list failed
      }

      // Start watch separately so a watch failure doesn't overwrite loaded data
      try {
        await WatchResources(
          opts.group,
          opts.version,
          opts.resource,
          opts.namespace,
        );
      } catch {
        // Watch failed but data is already loaded — degrade gracefully
        console.warn(`[useKubeResources] Real-time updates unavailable for ${opts.resource}`);
      }
    }

    fetchAndWatch();

    // Listen for watch events
    const eventName = `resource-watch:${opts.resource}`;
    const cleanup = EventsOn(eventName, (...args: unknown[]) => {
      if (cancelled) return;
      const event = args[0] as WatchEvent;
      if (!event || !event.type || !event.resource) return;

      // Ignore events from other namespaces (old watches may still be
      // emitting briefly after a namespace change).
      if (opts.namespace && event.resource.namespace && event.resource.namespace !== opts.namespace) {
        return;
      }

      setData((prev) => {
        switch (event.type) {
          case "ADDED":
            if (prev.find((r) => r.name === event.resource.name && r.namespace === event.resource.namespace)) {
              return prev;
            }
            return [...prev, event.resource];
          case "MODIFIED":
            return prev.map((r) =>
              r.name === event.resource.name && r.namespace === event.resource.namespace
                ? event.resource
                : r
            );
          case "DELETED":
            return prev.filter(
              (r) => !(r.name === event.resource.name && r.namespace === event.resource.namespace)
            );
          default:
            return prev;
        }
      });
    });

    return () => {
      cancelled = true;
      cleanup();
      // Stop the backend watch to avoid leaking goroutines
      StopWatch(opts.group, opts.version, opts.resource, opts.namespace).catch(() => {});
    };
  }, [opts.group, opts.version, opts.resource, opts.namespace]);

  return { data, isLoading, error };
}
