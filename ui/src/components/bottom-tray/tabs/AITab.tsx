import type { ITheme } from "@xterm/xterm";
import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAISession } from "@/hooks/useAISession";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { EventsOn } from "@/wailsjs/runtime/runtime";

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

export default function AITab() {
  const aiTarget = useUIStore((s) => s.aiTarget);
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termDivRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);

  const termFontSize = useSettingsStore((s) => s.terminalFontSize);
  const termCursorStyle = useSettingsStore((s) => s.terminalCursorStyle);
  const termCursorBlink = useSettingsStore((s) => s.terminalCursorBlink);
  const termTheme = useSettingsStore(
    (s) => s.terminalTheme,
  ) as keyof typeof TERMINAL_THEMES;

  const namespace = aiTarget?.namespace ?? "";
  const name = aiTarget?.name ?? "";

  const { sessionId, status, error, write, resize } = useAISession(
    namespace,
    name,
    !!aiTarget,
  );

  // Initialize xterm.js
  useEffect(() => {
    if (!termContainerRef.current || !aiTarget) return;

    let disposed = false;
    const cleanup: Array<() => void> = [];

    // Create an absolute-positioned inner div for xterm (matches TerminalTab pattern)
    const termDiv = document.createElement("div");
    termDiv.className = "absolute inset-0";
    termContainerRef.current.appendChild(termDiv);
    termDivRef.current = termDiv;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");

      if (disposed) return;

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

      termRef.current = term;

      // Send resize info after fit
      const { rows, cols } = term;
      resize(rows, cols);

      // Handle user input — write is stable (uses ref internally)
      const dataDisposable = term.onData((data) => {
        write(data);
      });
      cleanup.push(() => dataDisposable.dispose());

      // Handle terminal resize
      const resizeDisposable = term.onResize(({ rows, cols }) => {
        resize(rows, cols);
      });
      cleanup.push(() => resizeDisposable.dispose());

      // Container resize observer
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(termDiv);
      cleanup.push(() => resizeObserver.disconnect());

      term.write("\x1b[90mStarting AI session...\x1b[0m\r\n");
    })();

    return () => {
      disposed = true;
      for (const fn of cleanup) fn();
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      if (termDivRef.current?.parentNode) {
        termDivRef.current.parentNode.removeChild(termDivRef.current);
        termDivRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTarget?.namespace, aiTarget?.name]);

  // Connect PTY output to xterm when session is ready
  useEffect(() => {
    if (!sessionId || !termRef.current) return;

    const term = termRef.current;

    const stdoutCleanup = EventsOn(
      `ai:stdout:${sessionId}`,
      (data: unknown) => {
        term.write(data as string);
      },
    );

    const exitCleanup = EventsOn(
      `ai:exit:${sessionId}`,
      (msg: unknown) => {
        const message = msg as string;
        term.write(
          `\r\n\x1b[90m[AI session ended${message ? `: ${message}` : ""}]\x1b[0m\r\n`,
        );
      },
    );

    return () => {
      stdoutCleanup();
      exitCleanup();
    };
  }, [sessionId]);

  // Show error in terminal
  useEffect(() => {
    if (status === "error" && error && termRef.current) {
      termRef.current.write(`\x1b[31m${error}\x1b[0m\r\n`);
    }
  }, [status, error]);

  if (!aiTarget) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
        <Bot className="w-4 h-4" />
        <span>Click &quot;AI Diagnose&quot; on a pod to start an AI session</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs text-text-secondary truncate">
          {namespace}/{name}
        </span>
        {status === "starting" && (
          <span className="text-xs text-text-tertiary animate-pulse">
            Starting...
          </span>
        )}
      </div>
      <div ref={termContainerRef} className="flex-1 min-h-0 relative" />
    </div>
  );
}
