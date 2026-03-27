import { useEffect, useLayoutEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ShortcutHandler = () => void;

interface ShortcutDef {
  /** e.g. "Cmd+K", "G P", "[", "?" */
  key: string;
  handler: ShortcutHandler;
  /** Higher priority runs first. Command palette = 100, view = 10, global = 50 */
  priority?: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

/** Normalize event → shortcut string, e.g. "Cmd+K", "[", "G" */
function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  const key = e.key;
  // Don't add modifier-only keys
  if (!["Meta", "Control", "Shift", "Alt"].includes(key)) {
    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
    // Uppercase alpha keys when modifiers are held so "Cmd+k" matches registered "Cmd+K"
    const normalized = hasModifier && key.length === 1 && /^[a-zA-Z]$/.test(key) ? key.toUpperCase() : key;
    parts.push(normalized === " " ? "Space" : normalized);
  }
  return parts.join("+");
}

/** Chord indicator shown in bottom-right when waiting for 2nd key */
let chordIndicatorEl: HTMLElement | null = null;

function showChordIndicator(prefix: string) {
  if (!chordIndicatorEl) {
    chordIndicatorEl = document.createElement("div");
    chordIndicatorEl.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 9999;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      font-size: 12px; font-family: monospace;
      padding: 4px 10px; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
    `;
    document.body.appendChild(chordIndicatorEl);
  }
  chordIndicatorEl.textContent = `${prefix}…`;
  chordIndicatorEl.style.display = "block";
}

function hideChordIndicator() {
  if (chordIndicatorEl) chordIndicatorEl.style.display = "none";
}

// ─── Global shortcut registry ─────────────────────────────────────────────────
//
// Module-level state is intentional here. Keyboard shortcuts are a singleton
// concern — one global keydown listener dispatches to the highest-priority
// handler. React Context would force every shortcut consumer to sit under a
// single provider and would not meaningfully improve testability since the
// browser event system is inherently global. This design mirrors how popular
// shortcut libraries (hotkeys-js, tinykeys) work.

const registry = new Map<string, ShortcutDef[]>();

function registerShortcut(def: ShortcutDef) {
  const existing = registry.get(def.key) ?? [];
  registry.set(
    def.key,
    [...existing, def].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  );
}

function unregisterShortcut(def: ShortcutDef) {
  const existing = registry.get(def.key) ?? [];
  registry.set(
    def.key,
    existing.filter((d) => d !== def),
  );
}

// ─── Global keyboard listener (singleton) ────────────────────────────────────

const CHORD_TIMEOUT = 500; // ms
let chordBuffer = "";
let chordTimer: ReturnType<typeof setTimeout> | null = null;

function clearChord() {
  chordBuffer = "";
  if (chordTimer) clearTimeout(chordTimer);
  chordTimer = null;
  hideChordIndicator();
}

function globalKeyHandler(e: KeyboardEvent) {
  if (isInputFocused()) return;

  const key = eventToKey(e);

  // Check chord completion FIRST when a chord is in progress
  if (chordBuffer) {
    const chord = `${chordBuffer} ${key.toUpperCase()}`;
    const chordHandlers = registry.get(chord);
    if (chordHandlers?.length) {
      e.preventDefault();
      chordHandlers[0].handler();
    }
    clearChord();
    return;
  }

  // Check for direct match in registry
  const directHandlers = registry.get(key);
  if (directHandlers?.length) {
    e.preventDefault();
    directHandlers[0].handler(); // highest priority
    clearChord();
    return;
  }

  // Start new chord — only single alpha keys without modifiers
  if (
    key.length === 1 &&
    /^[A-Za-z]$/.test(key) &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    // Check if any chord starts with this key
    const upper = key.toUpperCase();
    const anyChord = [...registry.keys()].some((k) => k.startsWith(upper + " "));
    if (anyChord) {
      chordBuffer = upper;
      showChordIndicator(upper);
      chordTimer = setTimeout(clearChord, CHORD_TIMEOUT);
    }
  }
}

// Mount the global listener once (guarded for HMR)
let listenerAttached = false;
if (typeof window !== "undefined" && !listenerAttached) {
  window.addEventListener("keydown", globalKeyHandler);
  listenerAttached = true; // eslint-disable-line no-useless-assignment -- HMR guard
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Register keyboard shortcuts. Automatically cleans up on unmount.
 *
 * @example
 * useShortcuts([
 *   { key: "Cmd+K", handler: openPalette, priority: 100 },
 *   { key: "G P",   handler: () => navigate("/workloads/pods") },
 *   { key: "[",      handler: toggleSidebar },
 * ]);
 */
export function useShortcuts(shortcuts: ShortcutDef[]) {
  const defsRef = useRef(shortcuts);

  useLayoutEffect(() => {
    defsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    // Ref-wrapper pattern: each wrapper delegates through defsRef so the latest
    // closure is always called, even though the effect runs only once (empty deps).
    // This avoids re-registering shortcuts on every render while preventing stale
    // closures — the ref is updated synchronously in the useLayoutEffect above.
    const wrappers: ShortcutDef[] = defsRef.current.map((def) => ({
      ...def,
      handler: () => {
        const current = defsRef.current.find((d) => d.key === def.key);
        current?.handler();
      },
    }));
    wrappers.forEach(registerShortcut);
    return () => wrappers.forEach(unregisterShortcut);
  }, []); // intentionally empty — stable via ref + wrapper delegation
}
