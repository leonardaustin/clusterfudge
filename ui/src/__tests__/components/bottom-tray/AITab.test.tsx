import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock xterm
vi.mock("@xterm/xterm", () => {
  const noop = () => {};
  class Terminal {
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: noop }));
    onResize = vi.fn(() => ({ dispose: noop }));
    onSelectionChange = vi.fn(() => ({ dispose: noop }));
    getSelection = vi.fn(() => "");
    clear = vi.fn();
    focus = vi.fn();
    get element() {
      return document.createElement("div");
    }
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddon {
    fit = vi.fn();
    activate = vi.fn();
    dispose = vi.fn();
  }
  return { FitAddon };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock Wails AI handler
vi.mock("@/wailsjs/go/handlers/AIHandler", () => ({
  StartAISession: vi.fn().mockResolvedValue("ai-session-456"),
  WriteAISession: vi.fn(),
  ResizeAISession: vi.fn().mockResolvedValue(undefined),
  CloseAISession: vi.fn(),
}));

vi.mock("@/wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsOff: vi.fn(),
}));

import AITab from "@/components/bottom-tray/tabs/AITab";
import { useUIStore } from "@/stores/uiStore";

const initialState = useUIStore.getState();

function resetStore() {
  useUIStore.setState(initialState, true);
}

describe("AITab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows empty state when no AI sessions exist", () => {
    render(<AITab />);
    expect(
      screen.getByText(
        'Click "AI Diagnose" on a pod to start an AI session'
      )
    ).toBeInTheDocument();
  });

  it("shows session tabs when sessions exist", async () => {
    useUIStore.getState().addAISession("default", "nginx-pod", "claude", "Claude Code");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(screen.getByTestId("ai-session-tabs")).toBeInTheDocument();
    expect(screen.getByText("Claude Code: default/nginx-pod")).toBeInTheDocument();
    unmount();
  });

  it("shows multiple session tabs", async () => {
    useUIStore.getState().addAISession("default", "pod-a", "claude", "Claude Code");
    useUIStore.getState().addAISession("kube-system", "pod-b", "gemini", "Gemini CLI");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(screen.getByText("Claude Code: default/pod-a")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI: kube-system/pod-b")).toBeInTheDocument();
    unmount();
  });

  it("shows close button on each session tab", async () => {
    useUIStore.getState().addAISession("default", "nginx-pod", "claude", "Claude Code");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(
      screen.getByLabelText("Close AI session default/nginx-pod")
    ).toBeInTheDocument();
    unmount();
  });

  it("removes session when close button is clicked", async () => {
    const user = userEvent.setup();
    useUIStore.getState().addAISession("default", "pod-a", "claude", "Claude Code");
    useUIStore.getState().addAISession("default", "pod-b", "claude", "Claude Code");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Close the first session
    await user.click(
      screen.getByLabelText("Close AI session default/pod-a")
    );

    expect(screen.queryByText("Claude Code: default/pod-a")).not.toBeInTheDocument();
    expect(screen.getByText("Claude Code: default/pod-b")).toBeInTheDocument();
    unmount();
  });

  it("shows empty state after closing all sessions", async () => {
    const user = userEvent.setup();
    useUIStore.getState().addAISession("default", "only-pod", "claude", "Claude Code");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    await user.click(
      screen.getByLabelText("Close AI session default/only-pod")
    );

    // After closing, store should be empty
    expect(useUIStore.getState().aiSessions).toHaveLength(0);
    expect(screen.queryByText("Claude Code: default/only-pod")).not.toBeInTheDocument();
    unmount();
  });

  it("shows disabled + button with tooltip", async () => {
    useUIStore.getState().addAISession("default", "pod-a", "claude", "Claude Code");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const plusBtn = screen.getByLabelText("New AI session (disabled)");
    expect(plusBtn).toBeInTheDocument();
    expect(plusBtn).toBeDisabled();
    unmount();
  });

  it("highlights the active session tab", async () => {
    const id1 = useUIStore.getState().addAISession("default", "pod-a", "claude", "Claude Code");
    const id2 = useUIStore.getState().addAISession("default", "pod-b", "gemini", "Gemini CLI");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const tab2 = screen.getByTestId(`ai-session-tab-${id2}`);
    expect(tab2.getAttribute("aria-selected")).toBe("true");

    const tab1 = screen.getByTestId(`ai-session-tab-${id1}`);
    expect(tab1.getAttribute("aria-selected")).toBe("false");
    unmount();
  });

  it("switches active session when tab is clicked", async () => {
    const user = userEvent.setup();
    const id1 = useUIStore.getState().addAISession("default", "pod-a", "claude", "Claude Code");
    useUIStore.getState().addAISession("default", "pod-b", "gemini", "Gemini CLI");
    const { unmount } = render(<AITab />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    await user.click(screen.getByTestId(`ai-session-tab-${id1}`));
    expect(useUIStore.getState().activeAISessionId).toBe(id1);
    unmount();
  });
});
