// src/stores/favoritesStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteItem {
  label: string;
  path: string;
  icon: string;  // lucide icon name
  addedAt: number;
}

export interface RecentItem {
  label: string;
  path: string;
  icon: string;
  timestamp: number;
}

interface FavoritesState {
  favorites: FavoriteItem[];
  recentItems: RecentItem[];
  recentNamespaces: string[];

  addFavorite: (item: FavoriteItem) => void;
  removeFavorite: (path: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  isFavorite: (path: string) => boolean;

  addRecentItem: (item: RecentItem) => void;
  clearRecent: () => void;

  addRecentNamespace: (ns: string) => void;

  // Cluster color overrides
  clusterColors: Record<string, string>;
  setClusterColor: (clusterName: string, color: string) => void;
}

const MAX_RECENT = 10;
const MAX_RECENT_NS = 5;

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentItems: [],
      recentNamespaces: [],
      clusterColors: {},

      addFavorite: (item) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.path === item.path)
            ? s.favorites
            : [...s.favorites, item],
        })),

      removeFavorite: (path) =>
        set((s) => ({ favorites: s.favorites.filter((f) => f.path !== path) })),

      reorderFavorites: (from, to) =>
        set((s) => {
          if (from < 0 || from >= s.favorites.length || to < 0 || to >= s.favorites.length) {
            return s;
          }
          const arr = [...s.favorites];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return { favorites: arr };
        }),

      isFavorite: (path) => get().favorites.some((f) => f.path === path),

      addRecentItem: (item) =>
        set((s) => {
          const filtered = s.recentItems.filter((r) => r.path !== item.path);
          return { recentItems: [item, ...filtered].slice(0, MAX_RECENT) };
        }),

      clearRecent: () => set({ recentItems: [] }),

      addRecentNamespace: (ns) =>
        set((s) => {
          if (!ns) return s;
          const filtered = s.recentNamespaces.filter((n) => n !== ns);
          return { recentNamespaces: [ns, ...filtered].slice(0, MAX_RECENT_NS) };
        }),

      setClusterColor: (name, color) =>
        set((s) => ({ clusterColors: { ...s.clusterColors, [name]: color } })),
    }),
    { name: "clusterfudge-favorites" }
  )
);
