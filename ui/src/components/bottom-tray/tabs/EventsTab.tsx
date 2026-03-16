import { useEffect, useState, useCallback, useMemo } from "react";
import { AlertCircle, AlertTriangle, Info, RefreshCw, Filter, List, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/components/cells/RelativeTime";
import {
  ListEvents,
  type EventInfo,
} from "@/wailsjs/go/handlers/ResourceHandler";
import { useClusterStore } from "@/stores/clusterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useUIStore } from "@/stores/uiStore";

const REFRESH_INTERVAL = 10_000; // 10 seconds

type ViewMode = "list" | "grouped";

interface EventGroup {
  key: string;
  kind: string;
  name: string;
  namespace: string;
  warningCount: number;
  events: EventInfo[];
}

export default function EventsTab() {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const activeNamespace = useClusterStore((s) => s.selectedNamespace);
  const selectedResource = useSelectionStore((s) => s.selectedResource);
  const eventsResourceFilter = useUIStore((s) => s.eventsResourceFilter);
  const setEventsResourceFilter = useUIStore((s) => s.setEventsResourceFilter);

  // Filter state
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [reasonFilter, setReasonFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");

  // Clear resource filter when selected resource changes
  useEffect(() => {
    setEventsResourceFilter(null);
  }, [selectedResource?.name, selectedResource?.kind, setEventsResourceFilter]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await ListEvents(activeNamespace ?? "", 200);
      setEvents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeNamespace]);

  // Fetch on mount and on namespace change
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Compute unique reasons and kinds for filter options
  const { uniqueReasons, uniqueKinds } = useMemo(() => {
    const reasons = new Set<string>();
    const kinds = new Set<string>();
    for (const event of events) {
      if (event.reason) reasons.add(event.reason);
      if (event.objectKind) kinds.add(event.objectKind);
    }
    return {
      uniqueReasons: [...reasons].sort(),
      uniqueKinds: [...kinds].sort(),
    };
  }, [events]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    let result = events;
    if (warningsOnly) {
      result = result.filter((e) => e.type === "Warning");
    }
    if (reasonFilter) {
      result = result.filter((e) => e.reason === reasonFilter);
    }
    if (kindFilter) {
      result = result.filter((e) => e.objectKind === kindFilter);
    }
    if (eventsResourceFilter) {
      result = result.filter(
        (e) =>
          e.objectKind === eventsResourceFilter.kind &&
          e.objectName === eventsResourceFilter.name &&
          e.objectNamespace === eventsResourceFilter.namespace
      );
    }
    return result;
  }, [events, warningsOnly, reasonFilter, kindFilter, eventsResourceFilter]);

  // Group events by involvedObject for correlation view
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, EventGroup>();
    for (const event of filteredEvents) {
      const key = `${event.objectKind}/${event.objectName}/${event.objectNamespace}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          kind: event.objectKind,
          name: event.objectName,
          namespace: event.objectNamespace,
          warningCount: 0,
          events: [],
        };
        groups.set(key, group);
      }
      group.events.push(event);
      if (event.type === "Warning") {
        group.warningCount++;
      }
    }
    // Sort by warning count descending
    return Array.from(groups.values()).sort((a, b) => b.warningCount - a.warningCount);
  }, [filteredEvents]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (warningsOnly) count++;
    if (reasonFilter) count++;
    if (kindFilter) count++;
    if (eventsResourceFilter) count++;
    return count;
  }, [warningsOnly, reasonFilter, kindFilter, eventsResourceFilter]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-status-error text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (events.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>No events found</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        <span className="text-xs text-text-tertiary">
          {filteredEvents.length}{filteredEvents.length !== events.length ? `/${events.length}` : ""} events
          {activeNamespace ? ` in ${activeNamespace}` : " (all namespaces)"}
        </span>
        {activeFilterCount > 0 && (
          <span
            data-testid="active-filter-count"
            className="text-2xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full tabular-nums"
          >
            {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
          </span>
        )}
        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-bg-tertiary rounded p-0.5" role="radiogroup" aria-label="View mode">
          <button
            role="radio"
            aria-checked={viewMode === "list"}
            data-testid="view-mode-list"
            onClick={() => setViewMode("list")}
            className={cn(
              "p-1 rounded transition-colors",
              viewMode === "list"
                ? "bg-bg-active text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            )}
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            role="radio"
            aria-checked={viewMode === "grouped"}
            data-testid="view-mode-grouped"
            onClick={() => setViewMode("grouped")}
            className={cn(
              "p-1 rounded transition-colors",
              viewMode === "grouped"
                ? "bg-bg-active text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            )}
            title="Correlation view"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-colors"
          title="Refresh events"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0 bg-bg-secondary">
        <Filter className="w-3 h-3 text-text-tertiary shrink-0" />

        {/* Warnings only toggle */}
        <button
          onClick={() => setWarningsOnly((prev) => !prev)}
          data-testid="warnings-only-toggle"
          className={cn(
            "text-2xs px-2 py-0.5 rounded border transition-colors",
            warningsOnly
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
              : "bg-bg-tertiary text-text-tertiary border-border hover:text-text-secondary"
          )}
        >
          Warnings only
        </button>

        {/* Reason filter */}
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          data-testid="reason-filter"
          className="text-2xs px-1.5 py-0.5 rounded border border-border bg-bg-tertiary text-text-secondary"
        >
          <option value="">All reasons</option>
          {uniqueReasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>

        {/* Kind filter */}
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          data-testid="kind-filter"
          className="text-2xs px-1.5 py-0.5 rounded border border-border bg-bg-tertiary text-text-secondary"
        >
          <option value="">All kinds</option>
          {uniqueKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

        {/* Resource filter toggle */}
        {selectedResource && (
          <button
            onClick={() => {
              if (eventsResourceFilter) {
                setEventsResourceFilter(null);
              } else {
                setEventsResourceFilter({
                  kind: selectedResource.kind,
                  name: selectedResource.name,
                  namespace: selectedResource.namespace || "",
                });
              }
            }}
            data-testid="resource-filter-toggle"
            className={cn(
              "text-2xs px-2 py-0.5 rounded border transition-colors",
              eventsResourceFilter
                ? "bg-accent/20 text-accent border-accent/40"
                : "bg-bg-tertiary text-text-tertiary border-border hover:text-text-secondary"
            )}
          >
            Filter to {selectedResource.kind}/{selectedResource.name}
          </button>
        )}

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              setWarningsOnly(false);
              setReasonFilter("");
              setKindFilter("");
              setEventsResourceFilter(null);
            }}
            data-testid="clear-filters"
            className="text-2xs text-text-tertiary hover:text-text-secondary transition-colors ml-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Events display */}
      <div className="flex-1 overflow-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>No events match the current filters</span>
          </div>
        ) : viewMode === "list" ? (
          /* List view */
          filteredEvents.map((event, i) => (
            <div
              key={`${event.objectKind}-${event.objectName}-${event.reason}-${i}`}
              className="flex items-start gap-3 px-3 py-2 hover:bg-bg-hover border-b border-white/[0.03] text-xs"
            >
              {/* Type indicator */}
              <span
                className={cn(
                  "shrink-0 mt-0.5",
                  event.type === "Warning"
                    ? "text-yellow-400"
                    : "text-sky-400"
                )}
              >
                {event.type === "Warning" ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Info className="w-3.5 h-3.5" />
                )}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary font-medium">
                    {event.objectKind}/{event.objectName}
                  </span>
                  <span className="text-text-tertiary">{event.reason}</span>
                </div>
                <p className="text-text-primary mt-0.5 truncate">
                  {event.message}
                </p>
              </div>

              {/* Timestamp */}
              <span className="text-text-tertiary shrink-0 tabular-nums">
                {formatRelative(event.lastTimestamp)}
              </span>

              {/* Count badge */}
              {event.count > 1 && (
                <span className="text-2xs bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                  {event.count}x
                </span>
              )}
            </div>
          ))
        ) : (
          /* Grouped / Correlation view */
          <div data-testid="correlation-view">
            {groupedEvents.map((group) => (
              <div key={group.key} className="border-b border-border/15">
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary sticky top-0">
                  <span className="text-xs font-medium text-text-primary">
                    {group.kind}/{group.name}
                  </span>
                  {group.namespace && (
                    <span className="text-2xs text-text-tertiary">({group.namespace})</span>
                  )}
                  <div className="flex-1" />
                  {group.warningCount > 0 && (
                    <span
                      data-testid="group-warning-count"
                      className="text-2xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full tabular-nums"
                    >
                      {group.warningCount} warning{group.warningCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-2xs text-text-tertiary tabular-nums">
                    {group.events.length} event{group.events.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Group events */}
                {group.events.map((event, i) => (
                  <div
                    key={`${event.reason}-${i}`}
                    className="flex items-start gap-3 px-3 pl-6 py-1.5 hover:bg-bg-hover text-xs"
                  >
                    <span
                      className={cn(
                        "shrink-0 mt-0.5",
                        event.type === "Warning"
                          ? "text-yellow-400"
                          : "text-sky-400"
                      )}
                    >
                      {event.type === "Warning" ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <Info className="w-3 h-3" />
                      )}
                    </span>
                    <span className="text-text-tertiary shrink-0">{event.reason}</span>
                    <p className="flex-1 text-text-primary truncate min-w-0">{event.message}</p>
                    <span className="text-text-tertiary shrink-0 tabular-nums text-2xs">
                      {formatRelative(event.lastTimestamp)}
                    </span>
                    {event.count > 1 && (
                      <span className="text-2xs bg-bg-tertiary text-text-secondary px-1 py-0.5 rounded-full tabular-nums shrink-0">
                        {event.count}x
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
