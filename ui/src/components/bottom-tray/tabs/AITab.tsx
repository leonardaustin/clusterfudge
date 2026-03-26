import { Bot, X, Plus } from "lucide-react";
import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TERMINAL_THEMES } from "@/lib/terminalThemes";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import {
  StartAISession,
  WriteAISession,
  ResizeAISession,
  CloseAISession,
} from "@/wailsjs/go/handlers/AIHandler";
import { EventsOn } from "@/wailsjs/runtime/runtime";

// ── Per-session instance data ────────────────────────────────────────────────

interface AISessionInstance {
  xterm: import("@xterm/xterm").Terminal | null;
  cleanup: Array<() => void>;
  backendSessionId: string;
  termDiv: HTMLDivElement | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AITab() {
  const aiSessions = useUIStore((s) => s.aiSessions);
  const activeAISessionId = useUIStore((s) => s.activeAISessionId);
  const removeAISession = useUIStore((s) => s.removeAISession);
  const setActiveAISession = useUIStore((s) => s.setActiveAISession);

  const termContainerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Record<string, AISessionInstance>>({});

  const termFontSize = useSettingsStore((s) => s.terminalFontSize);
  const termCursorStyle = useSettingsStore((s) => s.terminalCursorStyle);
  const termCursorBlink = useSettingsStore((s) => s.terminalCursorBlink);
  const termTheme = useSettingsStore(
    (s) => s.terminalTheme,
  ) as keyof typeof TERMINAL_THEMES;

  // Initialize xterm for new sessions
  useEffect(() => {
    for (const session of aiSessions) {
      if (instancesRef.current[session.id]) continue;
      if (!termContainerRef.current) continue;

      // Mark as being initialized (with null xterm) to prevent double-init
      const termDiv = document.createElement("div");
      termDiv.className = "absolute inset-0";
      termDiv.dataset.aiSessionId = session.id;
      termContainerRef.current.appendChild(termDiv);

      const instance: AISessionInstance = {
        xterm: null,
        cleanup: [],
        backendSessionId: "",
        termDiv,
      };
      instancesRef.current[session.id] = instance;

      // Async initialization
      (async () => {
        const { Terminal } = await import("@xterm/xterm");
        const { FitAddon } = await import("@xterm/addon-fit");
        await import("@xterm/xterm/css/xterm.css");

        // Check if still relevant (session may have been removed)
        if (!instancesRef.current[session.id]) {
          if (termDiv.parentNode) termDiv.parentNode.removeChild(termDiv);
          return;
        }

        const resolvedTheme =
          TERMINAL_THEMES[termTheme] ?? TERMINAL_THEMES.dark;

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
        term.open(termDiv);
        fitAddon.fit();

        const cleanup: Array<() => void> = [];

        term.write(`\x1b[90mStarting ${session.providerName || 'AI'} session...\x1b[0m\r\n`);

        // Start backend AI session
        let backendSessionId = "";
        try {
          backendSessionId = await StartAISession(
            session.namespace,
            session.name,
            session.providerID,
          );

          // Send initial resize
          if (term.cols && term.rows) {
            ResizeAISession(backendSessionId, term.rows, term.cols).catch(
              () => {},
            );
          }

          // Forward user input to backend
          const dataDisposable = term.onData((data) => {
            WriteAISession(backendSessionId, data).catch((err: unknown) => {
              console.error("[AITab] WriteAISession failed:", err);
            });
          });
          cleanup.push(() => dataDisposable.dispose());

          // Forward resize events
          const resizeDisposable = term.onResize(({ rows, cols }) => {
            if (backendSessionId) {
              ResizeAISession(backendSessionId, rows, cols).catch(() => {});
            }
          });
          cleanup.push(() => resizeDisposable.dispose());

          // Listen for backend output
          const stdoutCleanup = EventsOn(
            `ai:stdout:${backendSessionId}`,
            (data: unknown) => {
              term.write(data as string);
            },
          );
          cleanup.push(stdoutCleanup);

          // Listen for session exit
          const exitCleanup = EventsOn(
            `ai:exit:${backendSessionId}`,
            (msg: unknown) => {
              const message = msg as string;
              term.write(
                `\r\n\x1b[90m[AI session ended${message ? `: ${message}` : ""}]\x1b[0m\r\n`,
              );
            },
          );
          cleanup.push(exitCleanup);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          term.write(`\x1b[31m${msg}\x1b[0m\r\n`);
        }

        // Container resize observer
        const resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
        });
        resizeObserver.observe(termDiv);
        cleanup.push(() => resizeObserver.disconnect());

        // Update instance
        instance.xterm = term;
        instance.cleanup = cleanup;
        instance.backendSessionId = backendSessionId;
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSessions]);

  // Show/hide terminal divs based on active session
  useEffect(() => {
    for (const [id, instance] of Object.entries(instancesRef.current)) {
      if (instance.termDiv) {
        instance.termDiv.style.display = id === activeAISessionId ? "" : "none";
      }
    }
  }, [activeAISessionId, aiSessions]);

  // Cleanup removed sessions
  useEffect(() => {
    const currentIds = new Set(aiSessions.map((s) => s.id));
    for (const [id, instance] of Object.entries(instancesRef.current)) {
      if (!currentIds.has(id)) {
        cleanupInstance(instance);
        delete instancesRef.current[id];
      }
    }
  }, [aiSessions]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const instance of Object.values(instancesRef.current)) {
        cleanupInstance(instance);
      }
      instancesRef.current = {};
    };
  }, []);

  const handleClose = useCallback(
    (id: string) => {
      const instance = instancesRef.current[id];
      if (instance) {
        cleanupInstance(instance);
        delete instancesRef.current[id];
      }
      removeAISession(id);
    },
    [removeAISession],
  );

  if (aiSessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
        <Bot className="w-4 h-4" />
        <span>
          Click &quot;AI Diagnose&quot; on a pod to start an AI session
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-accent flex-shrink-0" />
        <div
          className="flex items-center gap-0.5 overflow-x-auto max-w-[60%]"
          data-testid="ai-session-tabs"
        >
          {aiSessions.map((session) => (
            <div
              key={session.id}
              role="tab"
              tabIndex={0}
              aria-selected={session.id === activeAISessionId}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors group min-w-0",
                session.id === activeAISessionId
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
              )}
              onClick={() => setActiveAISession(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveAISession(session.id);
                }
              }}
              data-testid={`ai-session-tab-${session.id}`}
            >
              <span
                className="truncate max-w-[160px]"
                title={`${session.providerName}: ${session.namespace}/${session.name}`}
              >
                {session.providerName ? `${session.providerName}: ` : ''}{session.namespace}/{session.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-bg-hover rounded"
                title="Close session"
                aria-label={`Close AI session ${session.namespace}/${session.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            disabled
            title="Use AI Diagnose on a pod to create new sessions"
            aria-label="New AI session (disabled)"
            className="p-0.5 text-text-tertiary rounded transition-colors flex-shrink-0 opacity-40 cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Terminal container - sessions are appended as child divs */}
      <div ref={termContainerRef} className="flex-1 min-h-0 relative" />
    </div>
  );
}

function cleanupInstance(instance: AISessionInstance) {
  for (const fn of instance.cleanup) {
    fn();
  }
  if (instance.backendSessionId) {
    CloseAISession(instance.backendSessionId);
  }
  if (instance.xterm) {
    instance.xterm.dispose();
  }
  if (instance.termDiv && instance.termDiv.parentNode) {
    instance.termDiv.parentNode.removeChild(instance.termDiv);
  }
}
