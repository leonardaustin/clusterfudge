import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  StreamAllContainerLogs,
  StopAllContainerLogs,
  type LogLineEvent,
} from "@/wailsjs/go/handlers/StreamHandler";
import { EventsOn } from "@/wailsjs/runtime/runtime";
import { LogLineRow, type TimestampMode } from "./LogLine";

interface MultiContainerLogViewerProps {
  namespace: string;
  podName: string;
  containers: string[];
}

type ContainerLines = Record<string, LogLineEvent[]>;

const MAX_LINES_PER_CONTAINER = 5_000;

export function MultiContainerLogViewer({
  namespace,
  podName,
  containers,
}: MultiContainerLogViewerProps) {
  const [allLines, setAllLines] = useState<ContainerLines>(() =>
    Object.fromEntries(containers.map((c) => [c, []]))
  );
  const [mode, setMode] = useState<"split" | "merged">("split");
  const [timestampMode, setTimestampMode] = useState<TimestampMode>("relative");
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const eventName = `logs:all:${namespace}/${podName}`;

  useEffect(() => {
    // Reset lines asynchronously to avoid synchronous setState in effect body.
    Promise.resolve().then(() =>
      setAllLines(Object.fromEntries(containers.map((c) => [c, []])))
    );
    StreamAllContainerLogs(namespace, podName, containers, 200);

    const off = EventsOn(eventName, (line: unknown) => {
      const logLine = line as LogLineEvent;
      setAllLines((prev) => {
        const prevC = prev[logLine.container] ?? [];
        const nextC = [...prevC, logLine];
        return {
          ...prev,
          [logLine.container]:
            nextC.length > MAX_LINES_PER_CONTAINER
              ? nextC.slice(-MAX_LINES_PER_CONTAINER)
              : nextC,
        };
      });
    });

    return () => {
      off();
      StopAllContainerLogs(namespace, podName);
    };
  }, [namespace, podName, containers.join(","), eventName]);

  // Merged view: interleave all lines sorted by timestamp
  const mergedLines = Object.entries(allLines)
    .flatMap(([container, lines]) =>
      lines.map((l) => ({ ...l, container }))
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        <span className="text-xs text-text-tertiary">View:</span>
        {(["split", "merged"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "text-xs px-2 py-0.5 rounded capitalize transition-colors",
              mode === m
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            )}
          >
            {m}
          </button>
        ))}

        <div className="flex-1" />

        <select
          value={timestampMode}
          onChange={(e) => setTimestampMode(e.target.value as TimestampMode)}
          className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
        >
          <option value="hidden">No timestamps</option>
          <option value="relative">Relative</option>
          <option value="absolute">Absolute</option>
        </select>
      </div>

      {mode === "split" ? (
        <div className="flex flex-1 overflow-hidden divide-x divide-border">
          {containers.map((c) => (
            <div key={c} className="flex flex-col flex-1 min-w-0">
              <div className="text-2xs font-semibold text-text-tertiary uppercase px-2 py-1 bg-bg-tertiary border-b border-border flex-shrink-0">
                {c}
              </div>
              <div
                ref={(el) => {
                  scrollRefs.current[c] = el;
                }}
                className="flex-1 overflow-auto font-mono text-xs p-2 leading-5"
              >
                {(allLines[c] ?? []).map((line, i) => (
                  <LogLineRow
                    key={i}
                    content={line.content}
                    timestamp={line.timestamp}
                    searchTerm=""
                    timestampMode={timestampMode}
                    wrapLines={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-auto font-mono text-xs p-2 leading-5">
          {mergedLines.map((line, i) => (
            <LogLineRow
              key={i}
              content={line.content}
              timestamp={line.timestamp}
              container={line.container}
              searchTerm=""
              timestampMode={timestampMode}
              wrapLines={false}
              showContainer
            />
          ))}
        </div>
      )}
    </div>
  );
}
