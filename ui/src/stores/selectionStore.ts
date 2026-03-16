// src/stores/selectionStore.ts
import { create } from "zustand";

export interface SelectedResource {
  kind: string;
  name: string;
  namespace?: string;
  path: string;
  /** Raw resource object for context-aware actions */
  raw?: Record<string, unknown>;
}

interface SelectionState {
  selectedResource: SelectedResource | null;
  setSelectedResource: (r: SelectedResource | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedResource: null,
  setSelectedResource: (r) => set({ selectedResource: r }),
  clearSelection: () => set({ selectedResource: null }),
}));
