import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// Mock Wails bindings - data must be inline since vi.mock is hoisted
vi.mock("@/wailsjs/go/handlers/ResourceHandler", () => ({
  ListEvents: vi.fn().mockResolvedValue([
    {
      type: "Warning",
      reason: "BackOff",
      message: "Back-off restarting failed container",
      objectKind: "Pod",
      objectName: "failing-pod",
      objectNamespace: "default",
      count: 5,
      firstTimestamp: "2024-01-15T10:00:00Z",
      lastTimestamp: "2024-01-15T10:30:00Z",
    },
    {
      type: "Normal",
      reason: "Pulled",
      message: "Successfully pulled image",
      objectKind: "Pod",
      objectName: "healthy-pod",
      objectNamespace: "default",
      count: 1,
      firstTimestamp: "2024-01-15T10:25:00Z",
      lastTimestamp: "2024-01-15T10:25:00Z",
    },
    {
      type: "Warning",
      reason: "FailedScheduling",
      message: "Insufficient cpu",
      objectKind: "Deployment",
      objectName: "my-deploy",
      objectNamespace: "default",
      count: 3,
      firstTimestamp: "2024-01-15T10:20:00Z",
      lastTimestamp: "2024-01-15T10:35:00Z",
    },
  ]),
}));

vi.mock("@/wailsjs/runtime/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsOff: vi.fn(),
}));

import EventsTab from "@/components/bottom-tray/tabs/EventsTab";

describe("EventsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders events list", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText(/3 events/)).toBeInTheDocument();
    });
  });

  it("shows event types with correct indicators", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
      // "BackOff" appears in both the event list and the reason filter dropdown
      expect(screen.getAllByText("BackOff").length).toBeGreaterThan(0);
      expect(
        screen.getByText("Back-off restarting failed container")
      ).toBeInTheDocument();
    });
  });

  it("shows count badges for repeated events", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("5x")).toBeInTheDocument();
    });
  });

  it("shows normal events", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/healthy-pod")).toBeInTheDocument();
      // "Pulled" appears in both the event list and the reason filter dropdown
      expect(screen.getAllByText("Pulled").length).toBeGreaterThan(0);
    });
  });

  it("shows refresh button", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTitle("Refresh events")).toBeInTheDocument();
    });
  });

  // Filter tests

  it("shows filter bar with warnings-only toggle", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("warnings-only-toggle")).toBeInTheDocument();
      expect(screen.getByText("Warnings only")).toBeInTheDocument();
    });
  });

  it("shows reason and kind filter dropdowns", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("reason-filter")).toBeInTheDocument();
      expect(screen.getByTestId("kind-filter")).toBeInTheDocument();
    });
  });

  it("filters to warnings only when toggle is clicked", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/healthy-pod")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("warnings-only-toggle"));
    });

    // Normal event should be gone
    expect(screen.queryByText("Pod/healthy-pod")).not.toBeInTheDocument();
    // Warning events remain
    expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    expect(screen.getByText("Deployment/my-deploy")).toBeInTheDocument();
    // Count should reflect filtered
    expect(screen.getByText(/2\/3 events/)).toBeInTheDocument();
  });

  it("filters by reason", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    const reasonFilter = screen.getByTestId("reason-filter");
    await act(async () => {
      fireEvent.change(reasonFilter, { target: { value: "BackOff" } });
    });

    // Only BackOff events should remain
    expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    expect(screen.queryByText("Pod/healthy-pod")).not.toBeInTheDocument();
    expect(screen.queryByText("Deployment/my-deploy")).not.toBeInTheDocument();
    expect(screen.getByText(/1\/3 events/)).toBeInTheDocument();
  });

  it("filters by kind", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    const kindFilter = screen.getByTestId("kind-filter");
    await act(async () => {
      fireEvent.change(kindFilter, { target: { value: "Deployment" } });
    });

    // Only Deployment events should remain
    expect(screen.getByText("Deployment/my-deploy")).toBeInTheDocument();
    expect(screen.queryByText("Pod/failing-pod")).not.toBeInTheDocument();
    expect(screen.queryByText("Pod/healthy-pod")).not.toBeInTheDocument();
  });

  it("shows active filter count", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // No active filters initially
    expect(screen.queryByTestId("active-filter-count")).not.toBeInTheDocument();

    // Activate warnings-only
    await act(async () => {
      fireEvent.click(screen.getByTestId("warnings-only-toggle"));
    });

    expect(screen.getByTestId("active-filter-count")).toHaveTextContent("1 filter");

    // Add reason filter
    await act(async () => {
      fireEvent.change(screen.getByTestId("reason-filter"), { target: { value: "BackOff" } });
    });

    expect(screen.getByTestId("active-filter-count")).toHaveTextContent("2 filters");
  });

  it("clears all filters when Clear is clicked", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // Activate warnings-only
    await act(async () => {
      fireEvent.click(screen.getByTestId("warnings-only-toggle"));
    });

    expect(screen.queryByText("Pod/healthy-pod")).not.toBeInTheDocument();
    expect(screen.getByTestId("clear-filters")).toBeInTheDocument();

    // Clear all filters
    await act(async () => {
      fireEvent.click(screen.getByTestId("clear-filters"));
    });

    // All events should be visible again
    expect(screen.getByText("Pod/healthy-pod")).toBeInTheDocument();
    expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    expect(screen.getByText("Deployment/my-deploy")).toBeInTheDocument();
  });

  it("shows empty state when all events are filtered out", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // Filter to a non-existent combination
    await act(async () => {
      fireEvent.click(screen.getByTestId("warnings-only-toggle"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("reason-filter"), { target: { value: "Pulled" } });
    });

    // No Warning events with reason "Pulled", should show empty state
    expect(screen.getByText("No events match the current filters")).toBeInTheDocument();
  });

  it("populates reason dropdown with unique reasons from events", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("reason-filter")).toBeInTheDocument();
    });

    const reasonFilter = screen.getByTestId("reason-filter") as HTMLSelectElement;
    const options = Array.from(reasonFilter.options).map((o) => o.value);
    expect(options).toContain("");
    expect(options).toContain("BackOff");
    expect(options).toContain("Pulled");
    expect(options).toContain("FailedScheduling");
  });

  it("populates kind dropdown with unique kinds from events", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("kind-filter")).toBeInTheDocument();
    });

    const kindFilter = screen.getByTestId("kind-filter") as HTMLSelectElement;
    const options = Array.from(kindFilter.options).map((o) => o.value);
    expect(options).toContain("");
    expect(options).toContain("Pod");
    expect(options).toContain("Deployment");
  });

  // Correlation view tests

  it("shows view mode toggle buttons", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("view-mode-list")).toBeInTheDocument();
      expect(screen.getByTestId("view-mode-grouped")).toBeInTheDocument();
    });
  });

  it("defaults to list view", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("view-mode-list")).toHaveAttribute("aria-checked", "true");
      expect(screen.getByTestId("view-mode-grouped")).toHaveAttribute("aria-checked", "false");
    });
  });

  it("switches to correlation/grouped view when toggle is clicked", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // Switch to grouped view
    await act(async () => {
      fireEvent.click(screen.getByTestId("view-mode-grouped"));
    });

    expect(screen.getByTestId("correlation-view")).toBeInTheDocument();
    // Group headers should appear
    expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    expect(screen.getByText("Pod/healthy-pod")).toBeInTheDocument();
    expect(screen.getByText("Deployment/my-deploy")).toBeInTheDocument();
  });

  it("shows warning count badges on groups in correlation view", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // Switch to grouped view
    await act(async () => {
      fireEvent.click(screen.getByTestId("view-mode-grouped"));
    });

    // Groups with warnings should show warning counts
    const warningBadges = screen.getAllByTestId("group-warning-count");
    expect(warningBadges.length).toBeGreaterThan(0);
    // failing-pod and my-deploy have warnings
    expect(warningBadges.some((b) => b.textContent?.includes("1 warning"))).toBe(true);
  });

  it("sorts groups by warning count descending in correlation view", async () => {
    render(<EventsTab />);

    await waitFor(() => {
      expect(screen.getByText("Pod/failing-pod")).toBeInTheDocument();
    });

    // Switch to grouped view
    await act(async () => {
      fireEvent.click(screen.getByTestId("view-mode-grouped"));
    });

    const correlationView = screen.getByTestId("correlation-view");
    const groupHeaders = correlationView.querySelectorAll("[class*=sticky]");
    // Groups with warnings should come first
    expect(groupHeaders.length).toBe(3);
  });
});
