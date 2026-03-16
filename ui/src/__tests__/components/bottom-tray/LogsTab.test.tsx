import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Wails bindings
vi.mock("@/wailsjs/go/handlers/StreamHandler", () => ({
  StreamLogs: vi.fn().mockResolvedValue(undefined),
  StopLogStream: vi.fn(),
  DownloadLogs: vi.fn().mockResolvedValue("log content"),
}));

vi.mock("@/wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsOff: vi.fn(),
}));

import LogsTab from "@/components/bottom-tray/tabs/LogsTab";
import type { SelectedResource } from "@/stores/selectionStore";

describe("LogsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows placeholder when no resource selected", () => {
    render(<LogsTab resource={null} />);
    expect(screen.getByText("Select a pod to stream logs")).toBeInTheDocument();
  });

  it("shows placeholder for non-pod resources", () => {
    const resource: SelectedResource = {
      kind: "Service",
      name: "my-service",
      namespace: "default",
      path: "/services/my-service",
    };
    render(<LogsTab resource={resource} />);
    expect(screen.getByText("Select a pod to stream logs")).toBeInTheDocument();
  });

  it("renders toolbar and log area for pod resource", () => {
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
    render(<LogsTab resource={resource} />);

    // Should show the search input
    expect(screen.getByPlaceholderText("Search logs...")).toBeInTheDocument();
    // Should show Follow button
    expect(screen.getByText("Following")).toBeInTheDocument();
    // Should show Wrap button
    expect(screen.getByText("Wrap")).toBeInTheDocument();
    // Should show Previous button
    expect(screen.getByText("Previous")).toBeInTheDocument();
    // Should show waiting message since no lines yet
    expect(screen.getByText("Waiting for logs...")).toBeInTheDocument();
  });

  it("shows container selector for multi-container pods", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "my-pod",
      namespace: "default",
      path: "/pods/my-pod",
      raw: {
        spec: {
          containers: [{ name: "app" }, { name: "sidecar" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    const selects = screen.getAllByRole("combobox");
    // First combobox is container selector, second is timestamp mode
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.getByText("sidecar")).toBeInTheDocument();
  });

  it("calls StreamLogs on mount with pod resource", async () => {
    const { StreamLogs } = await import(
      "@/wailsjs/go/handlers/StreamHandler"
    );
    const resource: SelectedResource = {
      kind: "Pod",
      name: "test-pod",
      namespace: "test-ns",
      path: "/pods/test-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    expect(StreamLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "test-ns",
        podName: "test-pod",
        containerName: "main",
        follow: true,
      })
    );
  });

  it("calls StopLogStream on unmount", async () => {
    const { StopLogStream } = await import(
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
    const { unmount } = render(<LogsTab resource={resource} />);
    unmount();

    expect(StopLogStream).toHaveBeenCalledWith("default", "cleanup-pod");
  });

  it("toggles follow mode", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "toggle-pod",
      namespace: "default",
      path: "/pods/toggle-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    const followBtn = screen.getByText("Following");
    await user.click(followBtn);
    expect(screen.getByText("Follow")).toBeInTheDocument();
  });

  it("search input filters display text", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "search-pod",
      namespace: "default",
      path: "/pods/search-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    const searchInput = screen.getByPlaceholderText("Search logs...");
    await user.type(searchInput, "error");
    expect(searchInput).toHaveValue("error");
  });

  // ── Regex mode toggle tests ──

  it("shows regex toggle button", () => {
    const resource: SelectedResource = {
      kind: "Pod",
      name: "regex-pod",
      namespace: "default",
      path: "/pods/regex-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    expect(screen.getByLabelText("Plain text mode active")).toBeInTheDocument();
    expect(screen.getByText(".*")).toBeInTheDocument();
  });

  it("toggles regex mode on click", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "regex-toggle-pod",
      namespace: "default",
      path: "/pods/regex-toggle-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    const regexBtn = screen.getByText(".*");
    expect(screen.getByLabelText("Plain text mode active")).toBeInTheDocument();

    await user.click(regexBtn);
    expect(screen.getByLabelText("Regex mode active")).toBeInTheDocument();

    // Placeholder should change to indicate regex mode
    expect(screen.getByPlaceholderText("Search regex...")).toBeInTheDocument();
  });

  it("shows red border on invalid regex", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "invalid-regex-pod",
      namespace: "default",
      path: "/pods/invalid-regex-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    // Enable regex mode
    await user.click(screen.getByText(".*"));

    // Type an invalid regex (unclosed character class)
    const searchInput = screen.getByPlaceholderText("Search regex...");
    // Use fireEvent to set value directly to avoid character-by-character issues
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: "[invalid" } });

    // The input should have the red border class
    expect(searchInput.className).toContain("border-red-500");
  });

  it("does not show red border for valid regex", async () => {
    const user = userEvent.setup();
    const resource: SelectedResource = {
      kind: "Pod",
      name: "valid-regex-pod",
      namespace: "default",
      path: "/pods/valid-regex-pod",
      raw: {
        spec: {
          containers: [{ name: "main" }],
        },
      },
    };
    render(<LogsTab resource={resource} />);

    // Enable regex mode
    await user.click(screen.getByText(".*"));

    // Type a valid regex
    const searchInput = screen.getByPlaceholderText("Search regex...");
    await user.type(searchInput, "error|warn");

    // Should not have red border
    expect(searchInput.className).not.toContain("border-red-500");
    expect(searchInput.className).toContain("border-border");
  });
});
