import type { SearchAddon as SearchAddonType } from "@xterm/addon-search";
import type { ITheme } from "@xterm/xterm";
import { Terminal as TerminalIcon, Search, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SelectedResource } from "@/stores/selectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import {
  StartExec,
  WriteExec,
  CloseExec,
} from "@/wailsjs/go/handlers/StreamHandler";
import { EventsOn } from "@/wailsjs/runtime/runtime";

// ── Theme definitions ──────────────────────────────────────────────────────

const TERMINAL_THEMES: Record<string, ITheme> = {
  dark: {
    background: "#0A0A0B",
    foreground: "#EDEDEF",
    cursor: "#7C5CFC",
    selectionBackground: "#7C5CFC33",
    black: "#1A1A1E",
    red: "#F87171",
    green: "#4ADE80",
    yellow: "#FBBF24",
    blue: "#60A5FA",
    magenta: "#C084FC",
    cyan: "#22D3EE",
    white: "#EDEDEF",
  },
  light: {
    background: "#FFFFFF",
    foreground: "#1A1A1E",
    cursor: "#5B8DEF",
    selectionBackground: "#5B8DEF33",
    black: "#E5E5E5",
    red: "#DC2626",
    green: "#16A34A",
    yellow: "#CA8A04",
    blue: "#2563EB",
    magenta: "#9333EA",
    cyan: "#0891B2",
    white: "#1A1A1E",
  },
  monokai: {
    background: "#272822",
    foreground: "#F8F8F2",
    cursor: "#F92672",
    selectionBackground: "#F9267233",
    black: "#272822",
    red: "#F92672",
    green: "#A6E22E",
    yellow: "#E6DB74",
    blue: "#66D9EF",
    magenta: "#AE81FF",
    cyan: "#A1EFE4",
    white: "#F8F8F2",
  },
  solarized: {
    background: "#002B36",
    foreground: "#839496",
    cursor: "#CB4B16",
    selectionBackground: "#CB4B1633",
    black: "#073642",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#D33682",
    cyan: "#2AA198",
    white: "#EEE8D5",
  },
};

type TerminalThemeName = keyof typeof TERMINAL_THEMES;

// ── Session types ──────────────────────────────────────────────────────────

interface TerminalSession {
  id: string;
  name: string;
  container: string;
  sessionId: string;
  xterm: import("@xterm/xterm").Terminal | null;
  searchAddon: SearchAddonType | null;
  cleanup: Array<() => void>;
  termDiv: HTMLDivElement | null;
}

// ── Component ──────────────────────────────────────────────────────────────

interface TerminalTabProps {
  resource: SelectedResource | null;
}

let nextSessionSeq = 1;

export default function TerminalTab({ resource }: TerminalTabProps) {
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

  const containers = useMemo<string[]>(() => {
    if (
      resource?.raw?.spec &&
      typeof resource.raw.spec === "object" &&
      "containers" in (resource.raw.spec as Record<string, unknown>)
    ) {
      return (
        ((resource.raw.spec as Record<string, unknown>).containers as Array<{ name: string }>)?.map(
          (c) => c.name
        ) ?? []
      );
    }
    return [];
  }, [resource?.raw?.spec]);

  const isPod = resource?.kind === "Pod";

  // Set initial container when containers list changes
  useEffect(() => {
    if (containers.length > 0 && !selectedContainer) {
      setSelectedContainer(containers[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers]);

  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Clean up all sessions when resource changes or unmounts
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
  }, [resource?.name, resource?.namespace]);

  // Auto-create first session when pod is selected and there are no sessions
  useEffect(() => {
    if (isPod && resource?.namespace && sessions.length === 0 && containers.length > 0) {
      createNewSession();
    }
    // createNewSession is defined below (useCallback) but is available when this effect runs
    // since effects execute after all hooks are evaluated during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPod, resource?.name, resource?.namespace, containers.length, sessions.length]);

  // Handle Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && isPod && activeSession?.xterm) {
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
  }, [isPod, activeSession]);

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
      CloseExec(session.sessionId);
    }
    if (session.xterm) {
      session.xterm.dispose();
    }
    if (session.termDiv && session.termDiv.parentNode) {
      session.termDiv.parentNode.removeChild(session.termDiv);
    }
  }

  const createNewSession = useCallback(async () => {
    if (!resource || !isPod || !resource.namespace || !termContainerRef.current) return;

    const container = selectedContainer || containers[0] || "";
    const sessionLocalId = `session-${nextSessionSeq++}`;
    const sessionName = container || `Shell ${nextSessionSeq - 1}`;

    // Create a div for the terminal
    const termDiv = document.createElement("div");
    termDiv.className = "absolute inset-0";
    termContainerRef.current.appendChild(termDiv);

    const newSession: TerminalSession = {
      id: sessionLocalId,
      name: sessionName,
      container,
      sessionId: "",
      xterm: null,
      searchAddon: null,
      cleanup: [],
      termDiv,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(sessionLocalId);

    try {
      // Dynamic imports
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { SearchAddon } = await import("@xterm/addon-search");
      await import("@xterm/xterm/css/xterm.css");

      const resolvedTheme = TERMINAL_THEMES[termTheme] ?? TERMINAL_THEMES.dark;

      const term = new Terminal({
        theme: resolvedTheme,
        fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
        fontSize: termFontSize,
        lineHeight: 1.4,
        cursorBlink: termCursorBlink,
        cursorStyle: termCursorStyle as "block" | "bar" | "underline",
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);

      term.open(termDiv);
      fitAddon.fit();

      const cleanup: Array<() => void> = [];

      // Copy on select
      if (termCopyOnSelect) {
        const selDisposable = term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel).catch((err) => console.warn('[TerminalTab] Failed to copy to clipboard:', err));
          }
        });
        cleanup.push(() => selDisposable.dispose());
      }

      let backendSessionId = "";
      try {
        const command = termShell
          ? termShell.split(/\s+/)
          : ["/bin/sh", "-c", "bash || sh"];

        backendSessionId = await StartExec({
          namespace: resource.namespace,
          podName: resource.name,
          containerName: container,
          command,
          tty: true,
        });

        const dataDisposable = term.onData((data) => {
          WriteExec(backendSessionId, data).catch((err: unknown) => {
            console.error("[TerminalTab] WriteExec failed:", err);
          });
        });
        cleanup.push(() => dataDisposable.dispose());

        const stdoutCleanup = EventsOn(
          `exec:stdout:${backendSessionId}`,
          (data: unknown) => {
            term.write(data as string);
          }
        );
        cleanup.push(stdoutCleanup);

        const stderrCleanup = EventsOn(
          `exec:stderr:${backendSessionId}`,
          (data: unknown) => {
            term.write(data as string);
          }
        );
        cleanup.push(stderrCleanup);

        const exitCleanup = EventsOn(
          `exec:exit:${backendSessionId}`,
          (msg: unknown) => {
            const message = msg as string;
            term.write(
              `\r\n\x1b[90m[Session ended${message ? `: ${message}` : ""}]\x1b[0m\r\n`
            );
          }
        );
        cleanup.push(exitCleanup);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        term.write(`\x1b[31mFailed to start exec session: ${msg}\x1b[0m\r\n`);
      }

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(termDiv);
      cleanup.push(() => resizeObserver.disconnect());

      // Update session with xterm instance
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionLocalId
            ? { ...s, xterm: term, searchAddon, sessionId: backendSessionId, cleanup }
            : s
        )
      );
    } catch (err) {
      console.error('[TerminalTab] Failed to initialize terminal:', err);
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to initialize terminal', description: err instanceof Error ? err.message : String(err) });
    }
  }, [resource, isPod, selectedContainer, containers, termFontSize, termCursorStyle, termCursorBlink, termShell, termCopyOnSelect, termTheme]);

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

  if (!resource || !isPod) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
        <TerminalIcon className="w-4 h-4" />
        <span>Select a pod to open a terminal</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: session tabs + container selector + theme selector + search */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        {/* Session tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto max-w-[50%]" data-testid="session-tabs">
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
                <span className="truncate max-w-[100px]" title={session.name}>
                  {session.name}
                </span>
              )}
              {sessions.length > 1 && (
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
              )}
            </div>
          ))}
          <button
            onClick={() => { createNewSession(); }}
            title="New terminal session"
            aria-label="New terminal session"
            className="p-0.5 text-text-secondary hover:text-text-primary rounded transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1" />

        {/* Container selector */}
        {containers.length > 1 && (
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
