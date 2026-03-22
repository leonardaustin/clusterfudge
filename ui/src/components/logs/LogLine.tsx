import React from "react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/components/cells/RelativeTime";

const SEVERITY_PATTERNS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /\b(FATAL|CRITICAL|PANIC)\b/i, className: "text-status-error font-bold" },
  { pattern: /\b(ERROR|ERR|EXCEPTION)\b/i, className: "text-status-error" },
  { pattern: /\b(WARN|WARNING)\b/i, className: "text-status-pending" },
  { pattern: /\b(INFO|INFORMATION)\b/i, className: "text-status-info" },
  { pattern: /\b(DEBUG|TRACE|VERBOSE)\b/i, className: "text-text-tertiary" },
];

function detectSeverity(content: string): string {
  for (const { pattern, className } of SEVERITY_PATTERNS) {
    if (pattern.test(content)) return className;
  }
  return "text-text-primary";
}

const MAX_HIGHLIGHT_PARTS = 200;

function highlightSearch(content: string, searchTerm: string, isRegex?: boolean): React.ReactNode {
  if (!searchTerm) return content;
  if (typeof content !== "string") return String(content);
  let regex: RegExp;
  if (isRegex) {
    try {
      regex = new RegExp(`(${searchTerm})`, "gi");
    } catch {
      return content;
    }
  } else {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      regex = new RegExp(`(${escaped})`, "gi");
    } catch {
      return content;
    }
  }
  const parts = content.split(regex);
  // Cap the number of fragments to prevent performance issues with pathological input
  const capped = parts.length > MAX_HIGHLIGHT_PARTS ? parts.slice(0, MAX_HIGHLIGHT_PARTS) : parts;
  return capped.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-status-bg-pending text-status-pending rounded-sm">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export type TimestampMode = "hidden" | "relative" | "absolute";

interface LogLineProps {
  content: string;
  timestamp: string;
  container?: string;
  searchTerm: string;
  searchIsRegex?: boolean;
  timestampMode: TimestampMode;
  wrapLines: boolean;
  showContainer?: boolean;
}

export function LogLineRow({
  content,
  timestamp,
  container,
  searchTerm,
  searchIsRegex,
  timestampMode,
  wrapLines,
  showContainer,
}: LogLineProps) {
  // Ensure content is always a string — guard against non-string data from backend
  const safeContent = typeof content === "string" ? content : String(content ?? "");
  const severityClass = detectSeverity(safeContent);
  const displayTs =
    timestampMode === "hidden"
      ? null
      : timestampMode === "relative"
        ? formatRelative(timestamp)
        : timestamp?.slice(0, 23);

  const renderedContent = searchTerm ? highlightSearch(safeContent, searchTerm, searchIsRegex) : safeContent;

  return (
    <div className="flex gap-2 hover:bg-bg-hover px-1">
      {displayTs && (
        <span className={cn(
          "text-text-tertiary shrink-0 select-none tabular-nums text-2xs",
          timestampMode === "relative" ? "w-8" : "w-40"
        )}>
          {displayTs}
        </span>
      )}
      {showContainer && container && (
        <span className={cn("text-accent shrink-0 select-none w-24 truncate text-2xs")}>
          {container}
        </span>
      )}
      <span
        className={cn(
          severityClass,
          wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre truncate"
        )}
      >
        {renderedContent}
      </span>
    </div>
  );
}
