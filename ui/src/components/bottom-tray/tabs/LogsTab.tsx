import { useEffect, useRef, useState, useCallback } from "react";
import {
  ScrollText,
  Download,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  StreamLogs,
  StopLogStream,
  DownloadLogs,
  type LogLineEvent,
} from "@/wailsjs/go/handlers/StreamHandler";
import { SaveFileDialog } from "@/wailsjs/go/main/App";
import { EventsOn } from "@/wailsjs/runtime/runtime";
import { LogLineRow, type TimestampMode } from "@/components/logs/LogLine";
import { useToastStore } from "@/stores/toastStore";
import { PodPicker, type PodPickerValue } from "../PodPicker";

const MAX_LINES = 10_000;

export default function LogsTab() {
  const [lines, setLines] = useState<LogLineEvent[]>([]);
  const [isFollowing, setIsFollowing] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [regexMode, setRegexMode] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const [timestampMode, setTimestampMode] = useState<TimestampMode>("relative");
  const [showPrevious, setShowPrevious] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  // Pod picker state
  const [picked, setPicked] = useState<PodPickerValue | null>(null);

  // Subscribe to selectionStore - auto-populate when a Pod is selected
  const selectedResource = useSelectionStore((s) => s.selectedResource);
  useEffect(() => {
    if (selectedResource?.kind === "Pod" && selectedResource.namespace) {
      const containers = (() => {
        const spec = selectedResource.raw?.spec;
        if (!spec || typeof spec !== "object") return [];
        const s = spec as Record<string, unknown>;
        if (!Array.isArray(s.containers)) return [];
        return (s.containers as Array<Record<string, unknown>>)
          .filter((c) => typeof c.name === "string")
          .map((c) => c.name as string);
      })();
      setPicked({
        namespace: selectedResource.namespace,
        podName: selectedResource.name,
        containerName: containers[0] || "",
        raw: selectedResource.raw,
      });
    }
  }, [selectedResource?.kind, selectedResource?.name, selectedResource?.namespace, selectedResource?.raw]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Derived state from picked pod
  const namespace = picked?.namespace || "";
  const podName = picked?.podName || "";
  const containerName = picked?.containerName || "";
  const isPod = !!podName && !!namespace;

  // Extract containers from picked raw for the inline container selector
  const containers: string[] = (() => {
    const spec = picked?.raw?.spec;
    if (!spec || typeof spec !== "object") return [];
    const s = spec as Record<string, unknown>;
    if (!Array.isArray(s.containers)) return [];
    return s.containers
      .filter((c): c is { name: string } => c != null && typeof c === "object" && typeof (c as Record<string, unknown>).name === "string")
      .map((c) => c.name);
  })();

  // Start streaming when picked pod changes
  useEffect(() => {
    if (!isPod) return;

    let active = true;
    const container = containerName || containers[0] || "";
    Promise.resolve().then(() => { if (active) setLines([]); });

    StreamLogs({
      namespace,
      podName,
      containerName: container,
      follow: true,
      tailLines: 500,
      timestamps: true,
      previous: showPrevious,
    }).catch((err: unknown) => {
      if (active && mountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to stream logs', description: msg });
      }
    });

    const eventName = `logs:${namespace}/${podName}`;
    const cleanupEvents = EventsOn(eventName, (line: unknown) => {
      if (!active || !mountedRef.current) return;
      const logLine = line as LogLineEvent;
      setLines((prev) => {
        const updated = [...prev, logLine];
        if (updated.length > MAX_LINES) {
          return updated.slice(-MAX_LINES);
        }
        return updated;
      });
    });

    return () => {
      active = false;
      cleanupEvents();
      StopLogStream(namespace, podName);
    };
  }, [podName, namespace, containerName, showPrevious, isPod]);

  // Auto-scroll when following
  useEffect(() => {
    if (isFollowing && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, isFollowing]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      if (!atBottom && isFollowing) setIsFollowing(false);
      if (atBottom && !isFollowing) setIsFollowing(true);
    },
    [isFollowing]
  );

  const handleDownload = useCallback(async () => {
    if (!isPod) return;
    const container = containerName || containers[0] || "";
    try {
      const content = await DownloadLogs({
        namespace,
        podName,
        containerName: container,
        follow: false,
        tailLines: 100_000,
        timestamps: true,
        previous: false,
      });
      const filename = `${podName}-${container}.log`;
      const path = await SaveFileDialog(filename, content);
      if (path) {
        useToastStore.getState().addToast({ type: 'success', title: 'Logs saved', description: path });
      }
    } catch (err) {
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to download logs', description: err instanceof Error ? err.message : String(err) });
    }
  }, [isPod, namespace, podName, containerName, containers]);

  const handleContainerChange = (container: string) => {
    if (picked) {
      setPicked({ ...picked, containerName: container });
    }
  };

  // Validate regex when in regex mode
  const searchRegex = (() => {
    if (!regexMode || !searchTerm) return null;
    try {
      return new RegExp(searchTerm, "i");
    } catch {
      return null;
    }
  })();
  const regexInvalid = regexMode && searchTerm.length > 0 && searchRegex === null;

  // Filter lines by search
  const filteredLines = searchTerm
    ? regexInvalid
      ? lines // Don't filter when regex is invalid
      : regexMode && searchRegex
        ? lines.filter((l) => searchRegex.test(l.content))
        : lines.filter((l) =>
            l.content.toLowerCase().includes(searchTerm.toLowerCase())
          )
    : lines;

  if (!isPod) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
          <PodPicker value={picked} onSelect={setPicked} />
        </div>
        <div className="flex items-center justify-center flex-1 gap-2 text-text-tertiary text-sm">
          <ScrollText className="w-4 h-4" />
          <span>Select a pod to stream logs</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        {/* Pod picker */}
        <PodPicker value={picked} onSelect={setPicked} />

        {/* Container selector (when multi-container and picked via PodPicker) */}
        {containers.length > 1 && (
          <select
            value={containerName}
            onChange={(e) => handleContainerChange(e.target.value)}
            className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
          >
            {containers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {/* Search */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={regexMode ? "Search regex..." : "Search logs..."}
          className={cn(
            "flex-1 text-xs bg-bg-tertiary border rounded px-2 py-1 text-text-primary placeholder:text-text-tertiary min-w-0",
            regexInvalid ? "border-red-500" : "border-border"
          )}
        />

        {/* Regex toggle */}
        <button
          onClick={() => setRegexMode((r) => !r)}
          title={regexMode ? "Switch to plain text search" : "Switch to regex search"}
          aria-label={regexMode ? "Regex mode active" : "Plain text mode active"}
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors font-mono",
            regexMode
              ? "bg-accent text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
        >
          .*
        </button>

        {/* Follow toggle */}
        <button
          onClick={() => setIsFollowing(!isFollowing)}
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors",
            isFollowing
              ? "bg-accent text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>

        {/* Wrap toggle */}
        <button
          onClick={() => setWrapLines((w) => !w)}
          title="Toggle line wrap"
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors",
            wrapLines
              ? "bg-accent text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
        >
          Wrap
        </button>

        {/* Timestamp mode */}
        <select
          value={timestampMode}
          onChange={(e) => setTimestampMode(e.target.value as TimestampMode)}
          className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
        >
          <option value="hidden">No timestamps</option>
          <option value="relative">Relative</option>
          <option value="absolute">Absolute</option>
        </select>

        {/* Previous toggle */}
        <button
          onClick={() => setShowPrevious((p) => !p)}
          title="Show logs from previous container instance"
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors",
            showPrevious
              ? "bg-accent text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
        >
          Previous
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          title="Download logs"
          className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Clear */}
        <button
          onClick={() => setLines([])}
          title="Clear log buffer"
          className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-xs p-2 leading-5"
        onScroll={handleScroll}
      >
        {filteredLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            {lines.length === 0 ? "Waiting for logs..." : "No matching lines"}
          </div>
        ) : (
          filteredLines.map((line, i) => (
            <LogLineRow
              key={`${line.timestamp}-${i}`}
              content={line.content}
              timestamp={line.timestamp}
              container={line.container}
              searchTerm={regexInvalid ? "" : searchTerm}
              searchIsRegex={regexMode && !regexInvalid}
              timestampMode={timestampMode}
              wrapLines={wrapLines}
            />
          ))
        )}
      </div>
    </div>
  );
}
