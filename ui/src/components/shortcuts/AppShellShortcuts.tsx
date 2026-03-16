import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShortcuts } from "../../hooks/useShortcuts";
import { useUIStore } from "../../stores/uiStore";
import { useCommandPalette } from "../../hooks/useCommandPalette";
import { ShortcutHelpOverlay } from "./ShortcutHelpOverlay";

export function AppShellShortcuts() {
  const navigate = useNavigate();
  const { toggleSidebar, toggleBottomTray, openOrToggleTrayTab } = useUIStore();
  const { togglePalette } = useCommandPalette();
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcuts([
    // Navigation chords
    { key: "G O", handler: () => navigate("/overview"),              priority: 50 },
    { key: "G P", handler: () => navigate("/workloads/pods"),        priority: 50 },
    { key: "G D", handler: () => navigate("/workloads/deployments"), priority: 50 },
    { key: "G S", handler: () => navigate("/networking/services"),   priority: 50 },
    { key: "G N", handler: () => navigate("/cluster/nodes"),         priority: 50 },
    { key: "G E", handler: () => navigate("/cluster/events"),        priority: 50 },
    { key: "G H", handler: () => navigate("/helm/releases"),         priority: 50 },
    { key: "G C", handler: () => navigate("/config/configmaps"),     priority: 50 },
    { key: "G I", handler: () => navigate("/networking/ingresses"),  priority: 50 },
    // Global actions
    { key: "Cmd+K",       handler: togglePalette,                    priority: 100 },
    { key: "[",            handler: toggleSidebar,                    priority: 50 },
    { key: "Ctrl+`",      handler: toggleBottomTray,                  priority: 50 },
    { key: "?",            handler: () => setHelpOpen(true),          priority: 50 },
    { key: "/",            handler: togglePalette,                    priority: 50 },
    { key: "Cmd+Shift+N", handler: () => { /* open namespace dropdown */ }, priority: 50 },
    { key: "Cmd+Shift+C", handler: () => { /* open cluster dropdown */   }, priority: 50 },
    // Bottom tray tab shortcuts
    { key: "Cmd+1",       handler: () => openOrToggleTrayTab("logs"),     priority: 50 },
    { key: "Cmd+2",       handler: () => openOrToggleTrayTab("terminal"), priority: 50 },
    { key: "Cmd+3",       handler: () => openOrToggleTrayTab("events"),   priority: 50 },
    { key: "Cmd+4",       handler: () => openOrToggleTrayTab("ai"),       priority: 50 },
  ]);

  return <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />;
}
