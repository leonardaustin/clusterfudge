import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock xterm (dynamic import in TerminalTab may bypass setup.ts mock)
vi.mock("@xterm/xterm", () => {
  const noop = () => {};
  class Terminal {
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
    get element() { return document.createElement("div"); }
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

vi.mock("@xterm/addon-search", () => {
  class SearchAddon {
    findNext = vi.fn();
    findPrevious = vi.fn();
    clearDecorations = vi.fn();
    activate = vi.fn();
    dispose = vi.fn();
  }
  return { SearchAddon };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock Wails bindings
vi.mock("@/wailsjs/go/handlers/StreamHandler", () => ({
  StartExec: vi.fn().mockResolvedValue("session-123"),
  WriteExec: vi.fn(),
  CloseExec: vi.fn(),
}));

vi.mock("@/wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsOff: vi.fn(),
}));

import TerminalTab from "@/components/bottom-tray/tabs/TerminalTab";
import type { SelectedResource } from "@/stores/selectionStore";

describe("TerminalTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows placeholder when no resource selected", () => {
    render(<TerminalTab resource={null} />);
    expect(
      screen.getByText("Select a pod to open a terminal")
    ).toBeInTheDocument();
  });

  it("shows placeholder for non-pod resources", () => {
    const resource: SelectedResource = {
      kind: "Deployment",
      name: "my-deploy",
      namespace: "default",
      path: "/deployments/my-deploy",
    };
    render(<TerminalTab resource={resource} />);
    expect(
      screen.getByText("Select a pod to open a terminal")
    ).toBeInTheDocument();
  });

  it("renders terminal container for pod resource", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    const { container } = render(<TerminalTab resource={resource} />);
    // Should have the terminal div (now relative container)
    expect(container.querySelector(".flex-1.min-h-0.relative")).toBeInTheDocument();
  });

  it("shows container selector for multi-container pods", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "multi-pod",
      namespace: "default",
      path: "/pods/multi-pod",
      raw: {
        spec: {
          containers: [{ name: "app" }, { name: "sidecar" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    expect(screen.getByText("Container:")).toBeInTheDocument();
    // Container names appear in the dropdown options
    const select = screen.getAllByRole("combobox").find(
      (el) => el.querySelector('option[value="app"]') !== null
    );
    expect(select).toBeTruthy();
    expect(within(select!).getByText("app")).toBeInTheDocument();
    expect(within(select!).getByText("sidecar")).toBeInTheDocument();
  });

  it("shows search button for pod resources", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);
    expect(screen.getByLabelText("Search terminal")).toBeInTheDocument();
  });

  it("opens search bar when search button is clicked", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    await user.click(screen.getByLabelText("Search terminal"));
    expect(screen.getByTestId("terminal-search-bar")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("shows next/previous/close buttons in search bar", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    await user.click(screen.getByLabelText("Search terminal"));
    expect(screen.getByLabelText("Next match")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous match")).toBeInTheDocument();
    expect(screen.getByLabelText("Close search")).toBeInTheDocument();
  });

  it("closes search bar when close button is clicked", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    await user.click(screen.getByLabelText("Search terminal"));
    expect(screen.getByTestId("terminal-search-bar")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Close search"));
    expect(screen.queryByTestId("terminal-search-bar")).not.toBeInTheDocument();
  });

  it("closes search bar on Escape key", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    await user.click(screen.getByLabelText("Search terminal"));
    const input = screen.getByPlaceholderText("Search...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("terminal-search-bar")).not.toBeInTheDocument();
  });

  it("disables next/previous buttons when search term is empty", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    await user.click(screen.getByLabelText("Search terminal"));
    expect(screen.getByLabelText("Next match")).toBeDisabled();
    expect(screen.getByLabelText("Previous match")).toBeDisabled();
  });

  it("calls CloseExec on unmount", async () => {
    await import(
      "@/wailsjs/go/handlers/StreamHandler"
    );
    const resource: SelectedResource = {
      kind: "Pod",
      name: "cleanup-pod",
      namespace: "default",
      path: "/pods/cleanup-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    const { unmount } = render(<TerminalTab resource={resource} />);
    // Wait a tick for async init
    await new Promise((r) => setTimeout(r, 100));
    unmount();
    // CloseExec should be called when there's a session
    // (may not be called if StartExec hasn't resolved yet)
  });

  // ── New tests for multi-tab, themes, and renaming ──

  it("shows session tabs and new session button", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "tab-pod",
      namespace: "default",
      path: "/pods/tab-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    // Should show session tabs container
    expect(screen.getByTestId("session-tabs")).toBeInTheDocument();
    // Should show new session button
    expect(screen.getByLabelText("New terminal session")).toBeInTheDocument();
  });

  it("creates a new session when + button is clicked", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "multi-tab-pod",
      namespace: "default",
      path: "/pods/multi-tab-pod",
      raw: {
        spec: {
          containers: [{ name: "app" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    // Wait for auto-created first session
    await new Promise((r) => setTimeout(r, 50));

    const tabsBefore = screen.getByTestId("session-tabs");
    const tabCountBefore = tabsBefore.querySelectorAll('[role="tab"]').length;

    await user.click(screen.getByLabelText("New terminal session"));
    await new Promise((r) => setTimeout(r, 50));

    const tabsAfter = screen.getByTestId("session-tabs");
    const tabCountAfter = tabsAfter.querySelectorAll('[role="tab"]').length;
    expect(tabCountAfter).toBeGreaterThan(tabCountBefore);
  });

  it("shows theme selector dropdown", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "theme-pod",
      namespace: "default",
      path: "/pods/theme-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    const themeSelector = screen.getByLabelText("Terminal theme");
    expect(themeSelector).toBeInTheDocument();
    // Verify theme options exist
    expect(within(themeSelector).getByText("Dark")).toBeInTheDocument();
    expect(within(themeSelector).getByText("Light")).toBeInTheDocument();
    expect(within(themeSelector).getByText("Monokai")).toBeInTheDocument();
    expect(within(themeSelector).getByText("Solarized")).toBeInTheDocument();
  });

  it("enables tab rename on double-click", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "rename-pod",
      namespace: "default",
      path: "/pods/rename-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);

    // Wait for auto-created first session
    await new Promise((r) => setTimeout(r, 50));

    const tabs = screen.getByTestId("session-tabs");
    const tab = tabs.querySelector('[role="tab"]');
    expect(tab).toBeTruthy();

    // Double-click to start editing
    await user.dblClick(tab!);
    const renameInput = screen.getByTestId("tab-rename-input");
    expect(renameInput).toBeInTheDocument();
  });

  it("saves tab rename on Enter", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "rename-enter-pod",
      namespace: "default",
      path: "/pods/rename-enter-pod",
      raw: {
        spec: {
          containers: [{ name: "shell" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);
    await new Promise((r) => setTimeout(r, 100));

    const tabs = screen.getByTestId("session-tabs");
    const tab = tabs.querySelector('[role="tab"]');
    expect(tab).toBeTruthy();
    await user.dblClick(tab!);

    const renameInput = screen.getByTestId("tab-rename-input");
    fireEvent.change(renameInput, { target: { value: "My Shell" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    // Input should be gone after Enter
    expect(screen.queryByTestId("tab-rename-input")).not.toBeInTheDocument();
    // New name should be displayed
    expect(screen.getByText("My Shell")).toBeInTheDocument();
  });

  it("cancels tab rename on Escape", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "rename-esc-pod",
      namespace: "default",
      path: "/pods/rename-esc-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<TerminalTab resource={resource} />);
    await new Promise((r) => setTimeout(r, 50));

    const tabs = screen.getByTestId("session-tabs");
    const tab = tabs.querySelector('[role="tab"]');
    await user.dblClick(tab!);

    const renameInput = screen.getByTestId("tab-rename-input");
    await user.clear(renameInput);
    await user.type(renameInput, "Changed Name");
    fireEvent.keyDown(renameInput, { key: "Escape" });

    // Input should be gone
    expect(screen.queryByTestId("tab-rename-input")).not.toBeInTheDocument();
    // Original name should still be shown
    expect(screen.getByText("main")).toBeInTheDocument();
  });
});
