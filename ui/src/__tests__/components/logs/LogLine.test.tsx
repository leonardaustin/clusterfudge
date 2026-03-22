import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogLineRow } from "@/components/logs/LogLine";

describe("LogLineRow", () => {
  it("renders content text", () => {
    render(
      <LogLineRow
        content="Hello world"
        timestamp="2024-01-15T10:30:00.000Z"
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("shows timestamp in relative mode", () => {
    render(
      <LogLineRow
        content="Some log"
        timestamp="2024-01-15T10:30:00.000Z"
        searchTerm=""
        timestampMode="relative"
        wrapLines={false}
      />
    );
    // The relative time component should render something
    const container = document.querySelector(".text-text-tertiary");
    expect(container).toBeInTheDocument();
  });

  it("shows timestamp in absolute mode", () => {
    render(
      <LogLineRow
        content="Some log"
        timestamp="2024-01-15T10:30:00.000Z"
        searchTerm=""
        timestampMode="absolute"
        wrapLines={false}
      />
    );
    expect(screen.getByText("2024-01-15T10:30:00.000")).toBeInTheDocument();
  });

  it("hides timestamp when mode is hidden", () => {
    const { container } = render(
      <LogLineRow
        content="Some log"
        timestamp="2024-01-15T10:30:00.000Z"
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    expect(container.querySelector(".tabular-nums")).not.toBeInTheDocument();
  });

  it("applies error severity class", () => {
    render(
      <LogLineRow
        content="ERROR: something failed"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const errorSpan = screen.getByText("ERROR: something failed");
    expect(errorSpan.className).toContain("text-status-error");
  });

  it("applies warning severity class", () => {
    render(
      <LogLineRow
        content="WARNING: something suspicious"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const warnSpan = screen.getByText("WARNING: something suspicious");
    expect(warnSpan.className).toContain("text-status-pending");
  });

  it("applies info severity class", () => {
    render(
      <LogLineRow
        content="INFO: application started"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const infoSpan = screen.getByText("INFO: application started");
    expect(infoSpan.className).toContain("text-status-info");
  });

  it("applies debug severity class", () => {
    render(
      <LogLineRow
        content="DEBUG: variable value"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const debugSpan = screen.getByText("DEBUG: variable value");
    expect(debugSpan.className).toContain("text-text-tertiary");
  });

  it("highlights search terms", () => {
    render(
      <LogLineRow
        content="This has an error in it"
        timestamp=""
        searchTerm="error"
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const mark = document.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark?.textContent).toBe("error");
  });

  it("applies wrap class when wrapLines is true", () => {
    render(
      <LogLineRow
        content="Long line"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={true}
      />
    );
    const span = screen.getByText("Long line");
    expect(span.className).toContain("whitespace-pre-wrap");
  });

  it("applies truncate class when wrapLines is false", () => {
    render(
      <LogLineRow
        content="Long line"
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    const span = screen.getByText("Long line");
    expect(span.className).toContain("truncate");
  });

  it("shows container name when showContainer is true", () => {
    render(
      <LogLineRow
        content="Some log"
        timestamp=""
        container="my-container"
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
        showContainer
      />
    );
    expect(screen.getByText("my-container")).toBeInTheDocument();
  });

  it("hides container name by default", () => {
    render(
      <LogLineRow
        content="Some log"
        timestamp=""
        container="my-container"
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    expect(screen.queryByText("my-container")).not.toBeInTheDocument();
  });

  it("handles non-string content gracefully", () => {
    // Simulate backend sending unexpected data type
    render(
      <LogLineRow
        content={42 as unknown as string}
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("handles null content gracefully", () => {
    render(
      <LogLineRow
        content={null as unknown as string}
        timestamp=""
        searchTerm=""
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    // Should not throw — renders empty string
    expect(document.querySelector(".flex.gap-2")).toBeInTheDocument();
  });

  it("caps highlight fragments for pathological input", () => {
    // Create content with many matches to test the cap
    const content = "a".repeat(500);
    render(
      <LogLineRow
        content={content}
        timestamp=""
        searchTerm="a"
        timestampMode="hidden"
        wrapLines={false}
      />
    );
    // Should render without hanging — the mark count is capped
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeLessThanOrEqual(100);
  });
});
