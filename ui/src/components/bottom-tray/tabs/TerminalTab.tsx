import type { SearchAddon as SearchAddonType } from "@xterm/addon-search";
import { Terminal as TerminalIcon, Search, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TERMINAL_THEMES, type TerminalThemeName } from "@/lib/terminalThemes";
import { useSelectionStore } from "@/stores/selectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import {
  StartExec,
  WriteExec,
  CloseExec,
  ResizeExec,
  StartLocalTerminal,
  WriteLocalTerminal,
  CloseLocalTerminal,
  ResizeLocalTerminal,
} from "@/wailsjs/go/handlers/StreamHandler";
import { EventsOn } from "@/wailsjs/runtime/runtime";
import { PodPicker, type PodPickerValue } from "../PodPicker";

// ── Session types ──────────────────────────────────────────────────────────

interface TerminalSession {
  id: string;
  name: string;
  podName: string;
  namespace: string;
  container: string;
  sessionId: string;
  isLocal: boolean;
  xterm: import("@xterm/xterm").Terminal | null;
  searchAddon: SearchAddonType | null;
  cleanup: Array<() => void>;
  termDiv: HTMLDivElement | null;
}

// ── Backend adapters for shared terminal init ─────────────────────────────

interface SessionBackend {
  start: () => Promise<string>;
  write: (sessionID: string, data: string) => Promise<void>;
  resize: (sessionID: string, rows: number, cols: number) => Promise<void>;
  stdoutEvent: (sessionID: string) => string;
  stderrEvent?: (sessionID: string) => string;
  exitEvent: (sessionID: string) => string;
  errorLabel: string;
}

// ── Shared terminal initializer ───────────────────────────────────────────

interface TermSettings {
  fontSize: number;
  cursorStyle: string;
  cursorBlink: boolean;
  copyOnSelect: boolean;
  theme: TerminalThemeName;
}

async function initTerminal(
  termDiv: HTMLDivElement,
  settings: TermSettings,
  backend: SessionBackend,
): Promise<{
  xterm: import("@xterm/xterm").Terminal;
  searchAddon: SearchAddonType;
  backendSessionId: string;
  cleanup: Array<() => void>;
}> {
  const { Terminal } = await import("@xterm/xterm");
  const { FitAddon } = await import("@xterm/addon-fit");
  const { SearchAddon } = await import("@xterm/addon-search");
  await import("@xterm/xterm/css/xterm.css");

  const resolvedTheme = TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.dark;

  const term = new Terminal({
    theme: resolvedTheme,
    fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
    fontSize: settings.fontSize,
    lineHeight: 1.4,
    cursorBlink: settings.cursorBlink,
    cursorStyle: settings.cursorStyle as "block" | "bar" | "underline",
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  term.loadAddon(searchAddon);

  term.open(termDiv);
  fitAddon.fit();

  const cleanup: Array<() => void> = [];

  // Copy on select
  if (settings.copyOnSelect) {
    const selDisposable = term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) {
        navigator.clipboard.writeText(sel).catch((err) => console.warn('[TerminalTab] clipboard:', err));
      }
    });
    cleanup.push(() => selDisposable.dispose());
  }

  // Start backend session
  let backendSessionId = "";
  try {
    backendSessionId = await backend.start();

    const dataDisposable = term.onData((data) => {
      backend.write(backendSessionId, data).catch((err: unknown) => {
        console.error(`[TerminalTab] write failed:`, err);
      });
    });
    cleanup.push(() => dataDisposable.dispose());

    const stdoutCleanup = EventsOn(backend.stdoutEvent(backendSessionId), (data: unknown) => {
      term.write(data as string);
    });
    cleanup.push(stdoutCleanup);

    if (backend.stderrEvent) {
      const stderrCleanup = EventsOn(backend.stderrEvent(backendSessionId), (data: unknown) => {
        term.write(data as string);
      });
      cleanup.push(stderrCleanup);
    }

    const exitCleanup = EventsOn(backend.exitEvent(backendSessionId), (msg: unknown) => {
      const message = msg as string;
      term.write(`\r\n\x1b[90m[Session ended${message ? `: ${message}` : ""}]\x1b[0m\r\n`);
    });
    cleanup.push(exitCleanup);

    fitAddon.fit();
    if (term.cols != null && term.rows != null) {
      backend.resize(backendSessionId, term.rows, term.cols).catch(() => {});
    }

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (backendSessionId) {
        backend.resize(backendSessionId, rows, cols).catch(() => {});
      }
    });
    cleanup.push(() => resizeDisposable.dispose());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    term.write(`\x1b[31m${backend.errorLabel}: ${msg}\x1b[0m\r\n`);
  }

  // Container resize observer
  const resizeObserver = new ResizeObserver(() => { fitAddon.fit(); });
  resizeObserver.observe(termDiv);
  cleanup.push(() => resizeObserver.disconnect());

  return { xterm: term, searchAddon, backendSessionId, cleanup };
}

// ── Component ──────────────────────────────────────────────────────────────

let nextSessionSeq = 1;

export default function TerminalTab() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termFontSize = useSettingsStore((s) => s.terminalFontSize);
  const termCursorStyle = useSettingsStore((s) => s.terminalCursorStyle);
  const termCursorBlink = useSettingsStore((s) => s.terminalCursorBlink);
  const termShell = useSettingsStore((s) => s.terminalShell);
  const termCopyOnSelect = useSettingsStore((s) => s.terminalCopyOnSelect);
  const termTheme = useSettingsStore((s) => s.terminalTheme) as TerminalThemeName;
  const updateSetting = useSettingsStore((s) => s.update);

  const termSettings: TermSettings = useMemo(() => ({
    fontSize: termFontSize,
    cursorStyle: termCursorStyle,
    cursorBlink: termCursorBlink,
    copyOnSelect: termCopyOnSelect,
    theme: termTheme,
  }), [termFontSize, termCursorStyle, termCursorBlink, termCopyOnSelect, termTheme]);

  // Pod picker state
  const [picked, setPicked] = useState<PodPickerValue | null>(null);

  // Subscribe to selectionStore - auto-populate when a Pod is selected
  const selectedResource = useSelectionStore((s) => s.selectedResource);
  useEffect(() => {
    if (selectedResource?.kind === "Pod" && selectedResource.namespace) {
      const rawContainers = (() => {
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
        containerName: rawContainers[0] || "",
        raw: selectedResource.raw,
      });
    }
  }, [selectedResource?.kind, selectedResource?.name, selectedResource?.namespace, selectedResource?.raw]);

  // Derived state from picked pod
  const namespace = picked?.namespace || "";
  const podName = picked?.podName || "";
  const isPod = !!podName && !!namespace;

  const containers = useMemo<string[]>(() => {
    const raw = picked?.raw;
    if (!raw?.spec || typeof raw.spec !== "object") return [];
    const spec = raw.spec as Record<string, unknown>;
    if (!Array.isArray(spec.containers)) return [];
    return (spec.containers as Array<{ name: string }>)?.map((c) => c.name) ?? [];
  }, [picked?.raw]);

  // Set initial container when containers list changes
  useEffect(() => {
    if (containers.length > 0 && !selectedContainer) {
      setSelectedContainer(containers[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers]);

  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Track previous pod to detect changes
  const prevPodRef = useRef<{ podName: string; namespace: string }>({ podName: "", namespace: "" });

  // Auto-create a session for the current pod if none exists for it
  useEffect(() => {
    if (!isPod || containers.length === 0) return;

    const podChanged =
      prevPodRef.current.podName !== podName ||
      prevPodRef.current.namespace !== namespace;
    prevPodRef.current = { podName, namespace };

    // Check if there's already a session for this pod
    const hasSessionForPod = sessions.some(
      (s) => s.podName === podName && s.namespace === namespace,
    );

    if (!hasSessionForPod) {
      createNewSession();
    } else if (podChanged) {
      // Switch to an existing session for the new pod
      const existingSession = sessions.find(
        (s) => s.podName === podName && s.namespace === namespace,
      );
      if (existingSession) {
        setActiveSessionId(existingSession.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPod, podName, namespace, containers.length]);

  // Clean up all sessions on unmount
  useEffect(() => {
    return () => {
      setSessions((prev) => {
        for (const session of prev) {
          cleanupSession(session);
        }
        return [];
      });
      setActiveSessionId("");
    };
  }, []);

  // Handle Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && activeSession?.xterm) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    const el = termContainerRef.current;
    if (el) {
      el.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (el) {
        el.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [activeSession]);

  // Focus the search input when the bar opens
  useEffect(() => {
    if (!searchOpen) return undefined;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  // Show/hide terminal divs based on active session
  useEffect(() => {
    for (const session of sessions) {
      if (session.termDiv) {
        session.termDiv.style.display = session.id === activeSessionId ? "" : "none";
      }
    }
  }, [activeSessionId, sessions]);

  const handleSearchNext = useCallback(() => {
    if (activeSession?.searchAddon && searchTerm) {
      activeSession.searchAddon.findNext(searchTerm);
    }
  }, [searchTerm, activeSession]);

  const handleSearchPrev = useCallback(() => {
    if (activeSession?.searchAddon && searchTerm) {
      activeSession.searchAddon.findPrevious(searchTerm);
    }
  }, [searchTerm, activeSession]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchTerm("");
    if (activeSession?.searchAddon) {
      activeSession.searchAddon.clearDecorations();
    }
    activeSession?.xterm?.focus();
  }, [activeSession]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseSearch();
      } else if (e.key === "Enter") {
        if (e.shiftKey) {
          handleSearchPrev();
        } else {
          handleSearchNext();
        }
      }
    },
    [handleCloseSearch, handleSearchNext, handleSearchPrev]
  );

  // Trigger search as user types
  useEffect(() => {
    if (activeSession?.searchAddon && searchTerm && searchOpen) {
      activeSession.searchAddon.findNext(searchTerm);
    }
  }, [searchTerm, searchOpen, activeSession]);

  function cleanupSession(session: TerminalSession) {
    for (const fn of session.cleanup) {
      fn();
    }
    if (session.sessionId) {
      if (session.isLocal) {
        CloseLocalTerminal(session.sessionId);
      } else {
        CloseExec(session.sessionId);
      }
    }
    if (session.xterm) {
      session.xterm.dispose();
    }
    if (session.termDiv && session.termDiv.parentNode) {
      session.termDiv.parentNode.removeChild(session.termDiv);
    }
  }

  // Shared logic: create a session record, init the terminal, and wire up the backend
  const startSession = useCallback(async (
    sessionName: string,
    isLocal: boolean,
    backend: SessionBackend,
    meta: { podName: string; namespace: string; container: string },
  ) => {
    if (!termContainerRef.current) return;

    const sessionLocalId = `session-${nextSessionSeq++}`;

    const termDiv = document.createElement("div");
    termDiv.className = "absolute inset-0";
    termContainerRef.current.appendChild(termDiv);

    const newSession: TerminalSession = {
      id: sessionLocalId,
      name: sessionName,
      ...meta,
      sessionId: "",
      isLocal,
      xterm: null,
      searchAddon: null,
      cleanup: [],
      termDiv,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(sessionLocalId);

    try {
      const result = await initTerminal(termDiv, termSettings, backend);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionLocalId
            ? { ...s, xterm: result.xterm, searchAddon: result.searchAddon, sessionId: result.backendSessionId, cleanup: result.cleanup }
            : s
        )
      );
    } catch (err) {
      console.error('[TerminalTab] Failed to initialize terminal:', err);
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to initialize terminal', description: err instanceof Error ? err.message : String(err) });
    }
  }, [termSettings]);

  const createNewSession = useCallback(() => {
    const container = selectedContainer || containers[0] || "";
    const sessionName = container || `Shell ${nextSessionSeq}`;
    const command = termShell ? termShell.split(/\s+/) : [];

    startSession(sessionName, false, {
      start: () => StartExec({ namespace, podName, containerName: container, command, tty: true }),
      write: WriteExec,
      resize: (sid, rows, cols) => ResizeExec(sid, cols, rows),
      stdoutEvent: (sid) => `exec:stdout:${sid}`,
      stderrEvent: (sid) => `exec:stderr:${sid}`,
      exitEvent: (sid) => `exec:exit:${sid}`,
      errorLabel: "Failed to start exec session",
    }, { podName, namespace, container });
  }, [namespace, podName, selectedContainer, containers, termShell, startSession]);

  const createLocalSession = useCallback(() => {
    startSession("Local", true, {
      start: StartLocalTerminal,
      write: WriteLocalTerminal,
      resize: ResizeLocalTerminal,
      stdoutEvent: (sid) => `localterm:stdout:${sid}`,
      exitEvent: (sid) => `localterm:exit:${sid}`,
      errorLabel: "Failed to start local terminal",
    }, { podName: "", namespace: "", container: "" });
  }, [startSession]);

  const closeSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const session = prev.find((s) => s.id === sessionId);
      if (session) {
        cleanupSession(session);
      }
      const remaining = prev.filter((s) => s.id !== sessionId);

      // If the closed session was active, switch to the last remaining or clear
      if (activeSessionId === sessionId) {
        const newActive = remaining.length > 0 ? remaining[remaining.length - 1].id : "";
        // Use setTimeout to avoid setState during render
        setTimeout(() => setActiveSessionId(newActive), 0);
      }
      return remaining;
    });
  }, [activeSessionId]);

  const handleTabDoubleClick = useCallback((sessionId: string, currentName: string) => {
    setEditingTabId(sessionId);
    setEditingTabName(currentName);
  }, []);

  const commitTabRename = useCallback(() => {
    if (editingTabId && editingTabName.trim()) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === editingTabId ? { ...s, name: editingTabName.trim() } : s
        )
      );
    }
    setEditingTabId(null);
    setEditingTabName("");
  }, [editingTabId, editingTabName]);

  const cancelTabRename = useCallback(() => {
    setEditingTabId(null);
    setEditingTabName("");
  }, []);

  const handleTabRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitTabRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelTabRename();
      }
    },
    [commitTabRename, cancelTabRename]
  );

  // Check if sessions span multiple pods for disambiguation in tab labels
  const hasMultiplePods = useMemo(() => {
    const podKeys = new Set(sessions.filter((s) => !s.isLocal).map((s) => `${s.namespace}/${s.podName}`));
    return podKeys.size > 1;
  }, [sessions]);

  const hasSessions = sessions.length > 0;

  // ── Empty state: no pod selected and no sessions ──
  if (!isPod && !hasSessions) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
          <PodPicker value={picked} onSelect={setPicked} />
          <div className="flex-1" />
          <button
            onClick={() => { createLocalSession(); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-tertiary, transparent)',
            }}
            title="Open a local terminal"
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            Local Terminal
          </button>
        </div>
        <div className="flex items-center justify-center flex-1 gap-2 text-text-tertiary text-sm">
          <TerminalIcon className="w-4 h-4" />
          <span>Select a pod or open a local terminal</span>
        </div>
      </div>
    );
  }

  // ── Main view: has sessions or a pod selected ──
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        <PodPicker value={picked} onSelect={setPicked} />

        {/* Session tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto max-w-[30%]" data-testid="session-tabs">
          {sessions.map((session) => (
            <div
              key={session.id}
              role="tab"
              tabIndex={0}
              aria-selected={session.id === activeSessionId}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors group min-w-0",
                session.id === activeSessionId
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              )}
              onClick={() => setActiveSessionId(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveSessionId(session.id);
                }
              }}
              onDoubleClick={() => handleTabDoubleClick(session.id, session.name)}
              data-testid={`session-tab-${session.id}`}
            >
              {editingTabId === session.id ? (
                <input
                  type="text"
                  value={editingTabName}
                  onChange={(e) => setEditingTabName(e.target.value)}
                  onKeyDown={handleTabRenameKeyDown}
                  onBlur={commitTabRename}
                  ref={(el) => { el?.focus(); }}
                  className="text-xs bg-transparent border-none outline-none w-20 text-inherit"
                  data-testid="tab-rename-input"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate max-w-[120px]" title={hasMultiplePods && !session.isLocal ? `${session.name} (${session.podName})` : session.name}>
                  {session.name}{hasMultiplePods && !session.isLocal ? ` (${session.podName})` : ""}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded"
                title="Close session"
                aria-label={`Close session ${session.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {isPod && (
            <button
              onClick={() => { createNewSession(); }}
              title="New terminal session"
              aria-label="New terminal session"
              className="p-0.5 text-text-secondary hover:text-text-primary rounded transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => { createLocalSession(); }}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors bg-bg-tertiary text-text-secondary hover:text-text-primary"
          title="Open a local terminal"
          aria-label="New local terminal"
        >
          <TerminalIcon className="w-3 h-3" />
          Local
        </button>

        <div className="flex-1" />

        {/* Container selector */}
        {isPod && containers.length > 1 && (
          <>
            <span className="text-xs text-text-tertiary">Container:</span>
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
            >
              {containers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Theme selector */}
        <select
          value={termTheme}
          onChange={(e) => updateSetting("terminalTheme", e.target.value)}
          className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
          title="Terminal theme"
          aria-label="Terminal theme"
        >
          {Object.keys(TERMINAL_THEMES).map((name) => (
            <option key={name} value={name}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>

        {/* Search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          title="Search (Ctrl+F)"
          aria-label="Search terminal"
          className="text-text-secondary hover:text-text-primary p-1 rounded transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0"
          style={{ background: 'var(--bg-secondary, #1a1a1e)' }}
          data-testid="terminal-search-bar"
        >
          <Search className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            aria-label="Search terminal"
            className="flex-1 text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none focus:border-accent"
          />
          <button
            onClick={handleSearchPrev}
            disabled={!searchTerm}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
            className="text-text-secondary hover:text-text-primary p-1 rounded transition-colors disabled:opacity-40"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSearchNext}
            disabled={!searchTerm}
            title="Next match (Enter)"
            aria-label="Next match"
            className="text-text-secondary hover:text-text-primary p-1 rounded transition-colors disabled:opacity-40"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCloseSearch}
            title="Close search (Escape)"
            aria-label="Close search"
            className="text-text-secondary hover:text-text-primary p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Terminal container - sessions are appended as child divs */}
      <div ref={termContainerRef} className="flex-1 min-h-0 relative" />
    </div>
  );
}
