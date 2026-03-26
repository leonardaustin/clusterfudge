import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useClusterStore } from "@/stores/clusterStore";
import { ListResources } from "@/wailsjs/go/handlers/ResourceHandler";
import type { ResourceItem } from "@/wailsjs/go/handlers/ResourceHandler";

export interface PodPickerValue {
  namespace: string;
  podName: string;
  containerName: string;
  raw?: Record<string, unknown>;
}

interface PodPickerProps {
  value: PodPickerValue | null;
  onSelect: (value: PodPickerValue) => void;
}

export function PodPicker({ value, onSelect }: PodPickerProps) {
  const namespaces = useClusterStore((s) => s.namespaces);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);

  const [pickerNs, setPickerNs] = useState(value?.namespace || selectedNamespace || "");
  const [pods, setPods] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerPod, setPickerPod] = useState(value?.podName || "");
  const [pickerContainer, setPickerContainer] = useState(value?.containerName || "");

  // Sync from external value when it changes
  useEffect(() => {
    if (value) {
      setPickerNs(value.namespace);
      setPickerPod(value.podName);
      setPickerContainer(value.containerName);
    }
  }, [value?.namespace, value?.podName, value?.containerName]);

  // Fetch pods when namespace changes
  useEffect(() => {
    if (!pickerNs) {
      setPods([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ListResources("", "v1", "pods", pickerNs)
      .then((items) => {
        if (!cancelled) {
          setPods(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPods([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [pickerNs]);

  // Extract containers from selected pod
  const { containers, selectedPodItem } = useMemo(() => {
    const podItem = pods.find((p) => p.name === pickerPod);
    if (!podItem?.raw) return { containers: [] as string[], selectedPodItem: undefined };
    const spec = (podItem.raw as Record<string, unknown>).spec;
    if (!spec || typeof spec !== "object") return { containers: [] as string[], selectedPodItem: podItem };
    const s = spec as Record<string, unknown>;
    if (!Array.isArray(s.containers)) return { containers: [] as string[], selectedPodItem: podItem };
    const names = (s.containers as Array<Record<string, unknown>>)
      .filter((c) => typeof c.name === "string")
      .map((c) => c.name as string);
    return { containers: names, selectedPodItem: podItem };
  }, [pods, pickerPod]);

  // Auto-select first container when containers change
  useEffect(() => {
    if (containers.length > 0 && !containers.includes(pickerContainer)) {
      setPickerContainer(containers[0]);
    }
  }, [containers, pickerContainer]);

  const handleNsChange = (ns: string) => {
    setPickerNs(ns);
    setPickerPod("");
    setPickerContainer("");
  };

  const handlePodChange = (pod: string) => {
    setPickerPod(pod);
    setPickerContainer("");
    // Emit immediately - container will be auto-selected via effect
    const podItem = pods.find((p) => p.name === pod);
    if (podItem?.raw) {
      const spec = (podItem.raw as Record<string, unknown>).spec;
      if (spec && typeof spec === "object") {
        const s = spec as Record<string, unknown>;
        if (Array.isArray(s.containers) && s.containers.length > 0) {
          const firstContainer = (s.containers[0] as Record<string, unknown>).name as string;
          onSelect({
            namespace: pickerNs,
            podName: pod,
            containerName: firstContainer,
            raw: podItem.raw as Record<string, unknown>,
          });
          return;
        }
      }
    }
  };

  const handleContainerChange = (container: string) => {
    setPickerContainer(container);
    if (pickerPod && pickerNs) {
      onSelect({
        namespace: pickerNs,
        podName: pickerPod,
        containerName: container,
        raw: selectedPodItem?.raw as Record<string, unknown> | undefined,
      });
    }
  };

  const selectClass = "text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary";

  return (
    <div className="flex items-center gap-2" data-testid="pod-picker">
      {/* Namespace dropdown */}
      <select
        value={pickerNs}
        onChange={(e) => handleNsChange(e.target.value)}
        className={selectClass}
        aria-label="Namespace"
      >
        <option value="">Select namespace...</option>
        {namespaces.map((ns) => (
          <option key={ns} value={ns}>{ns}</option>
        ))}
      </select>

      {/* Pod dropdown */}
      <select
        value={pickerPod}
        onChange={(e) => handlePodChange(e.target.value)}
        className={cn(selectClass, loading && "opacity-50")}
        disabled={!pickerNs || loading}
        aria-label="Pod"
      >
        <option value="">
          {loading ? "Loading..." : "Select pod..."}
        </option>
        {pods.map((p) => (
          <option key={`${p.namespace}/${p.name}`} value={p.name}>{p.name}</option>
        ))}
      </select>

      {/* Container dropdown */}
      {containers.length > 1 && (
        <select
          value={pickerContainer}
          onChange={(e) => handleContainerChange(e.target.value)}
          className={selectClass}
          aria-label="Container"
        >
          {containers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  );
}
