// src/stores/uiStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
export type TrayTab = "logs" | "terminal" | "events" | "ai";

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarWidth: number;

  // Detail panel
  detailPanelWidth: number;

  // Bottom tray
  bottomTrayOpen: boolean;
  bottomTrayHeight: number;
  bottomTrayTab: TrayTab;

  // Theme
  theme: Theme;

  // Sidebar sections
  collapsedSections: Record<string, boolean>;

  // AI target for bottom tray AI tab
  aiTarget: { namespace: string; name: string } | null;

  // Shortcuts
  shortcutsEnabled: boolean;

  // Events resource filter
  eventsResourceFilter: { kind: string; name: string; namespace: string } | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (updater: number | ((prev: number) => number)) => void;

  setDetailPanelWidth: (updater: number | ((prev: number) => number)) => void;

  toggleBottomTray: () => void;
  setBottomTrayOpen: (v: boolean) => void;
  setBottomTrayHeight: (updater: number | ((prev: number) => number)) => void;
  setBottomTrayTab: (tab: TrayTab) => void;
  openOrToggleTrayTab: (tab: TrayTab) => void;

  setAITarget: (target: { namespace: string; name: string } | null) => void;

  setEventsResourceFilter: (filter: { kind: string; name: string; namespace: string } | null) => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setShortcutsEnabled: (v: boolean) => void;
  toggleSection: (id: string) => void;
  isSectionOpen: (id: string) => boolean;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      sidebarWidth: 220,
      detailPanelWidth: 480,
      bottomTrayOpen: false,
      bottomTrayHeight: 250,
      bottomTrayTab: "logs" as TrayTab,
      aiTarget: null,
      theme: "dark" as Theme,
      collapsedSections: {},
      shortcutsEnabled: true,
      eventsResourceFilter: null,

      toggleSidebar:    () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSidebarWidth: (updater) =>
        set((s) => ({
          sidebarWidth: typeof updater === "function" ? updater(s.sidebarWidth) : updater,
        })),

      setDetailPanelWidth: (updater) =>
        set((s) => ({
          detailPanelWidth: typeof updater === "function" ? updater(s.detailPanelWidth) : updater,
        })),

      toggleBottomTray:    () => set((s) => ({ bottomTrayOpen: !s.bottomTrayOpen })),
      setBottomTrayOpen:   (v) => set({ bottomTrayOpen: v }),
      setBottomTrayHeight: (updater) =>
        set((s) => ({
          bottomTrayHeight: typeof updater === "function" ? updater(s.bottomTrayHeight) : updater,
        })),
      setBottomTrayTab: (tab) => set({ bottomTrayTab: tab, bottomTrayOpen: true }),
      openOrToggleTrayTab: (tab) =>
        set((s) => {
          if (s.bottomTrayOpen && s.bottomTrayTab === tab) {
            return { bottomTrayOpen: false };
          }
          return { bottomTrayTab: tab, bottomTrayOpen: true };
        }),

      setAITarget: (target) => set({ aiTarget: target }),

      setEventsResourceFilter: (filter) => set({ eventsResourceFilter: filter }),

      setTheme:   (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setShortcutsEnabled: (v) => set({ shortcutsEnabled: v }),
      toggleSection: (id) =>
        set((s) => {
          const next = { ...s.collapsedSections };
          if (next[id]) {
            delete next[id];
          } else {
            next[id] = true;
          }
          return { collapsedSections: next };
        }),
      isSectionOpen: (id): boolean => !get().collapsedSections[id],
    }),
    {
      name: "kubeviewer-ui",
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { eventsResourceFilter, ...persisted } = state;
        return persisted;
      },
    }
  )
);
