import { useEffect } from "react";
import { X } from "lucide-react";

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    items: [
      { keys: ["G", "O"], label: "Overview" },
      { keys: ["G", "P"], label: "Pods" },
      { keys: ["G", "D"], label: "Deployments" },
      { keys: ["G", "S"], label: "Services" },
      { keys: ["G", "N"], label: "Nodes" },
      { keys: ["G", "E"], label: "Events" },
      { keys: ["G", "H"], label: "Helm Releases" },
      { keys: ["G", "C"], label: "ConfigMaps" },
      { keys: ["G", "I"], label: "Ingresses" },
    ],
  },
  {
    title: "Interface",
    items: [
      { keys: ["\u2318", "K"],      label: "Command Palette" },
      { keys: ["["],                 label: "Toggle Sidebar" },
      { keys: ["\u2303", "`"],       label: "Toggle Bottom Tray" },
      { keys: ["?"],                 label: "Shortcut Help" },
      { keys: ["\u2318", "\u21E7", "N"], label: "Namespace Filter" },
      { keys: ["\u2318", "\u21E7", "C"], label: "Cluster Switcher" },
    ],
  },
  {
    title: "Table Actions",
    items: [
      { keys: ["\u2191", "\u2193"],  label: "Select row" },
      { keys: ["\u21B5"],            label: "Open detail" },
      { keys: ["L"],                 label: "View Logs" },
      { keys: ["X"],                 label: "Exec Shell" },
      { keys: ["E"],                 label: "Edit YAML" },
      { keys: ["\u2318", "\u232B"], label: "Delete resource" },
      { keys: ["Esc"],               label: "Close / dismiss" },
    ],
  },
];

interface ShortcutHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpOverlay({ open, onClose }: ShortcutHelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-bg-overlay backdrop-blur-sm flex items-center justify-center p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-text-primary font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid of groups */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-secondary">{item.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs text-text-tertiary bg-bg-tertiary border border-border rounded font-mono"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
