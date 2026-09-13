import { create } from 'zustand';

// The ONE selection shared by Map ⟷ Library ⟷ Ask (TECHNICAL-DESIGN §6.2). A lasso on the map
// and select-all in the table write the same Set, so "ask this selection" never needs to know
// which screen produced it.

export type SelectionSource = 'table' | 'lasso' | 'theme' | 'search';

interface SelectionState {
  ids: Set<string>;
  source: SelectionSource;
  toggle: (id: string) => void;
  replace: (ids: Iterable<string>, source: SelectionSource) => void;
  add: (ids: Iterable<string>, source: SelectionSource) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  ids: new Set<string>(),
  source: 'table',

  toggle: (id) =>
    set((s) => {
      const ids = new Set(s.ids);
      if (!ids.delete(id)) ids.add(id);
      return { ids, source: 'table' };
    }),

  replace: (ids, source) => set({ ids: new Set(ids), source }),

  add: (ids, source) =>
    set((s) => {
      const next = new Set(s.ids);
      for (const id of ids) next.add(id);
      return { ids: next, source };
    }),

  clear: () => set({ ids: new Set<string>() }),

  has: (id) => get().ids.has(id),
}));
