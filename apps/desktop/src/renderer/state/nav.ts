import { create } from 'zustand';

// The nine screens of TECHNICAL-DESIGN §6.1. Only four are real in P0; the rest render a
// bilingual "coming in P<N>" placeholder so the nav shape is the final one from day one.

export const SCREENS = [
  'library',
  'import',
  'settings',
  'egress',
  'map',
  'tree',
  'review',
  'ask',
  'sharing',
] as const;

export type Screen = (typeof SCREENS)[number];

/** Screens that exist in P0. Everything else is a placeholder with its landing phase. */
export const IMPLEMENTED: ReadonlySet<Screen> = new Set<Screen>([
  'library',
  'import',
  'settings',
  'egress',
]);

/** Phase each placeholder lands in (plans/SEQUENCING.md). */
export const SCREEN_PHASE: Record<Screen, number> = {
  library: 0,
  import: 0,
  settings: 0,
  egress: 0,
  map: 2,
  tree: 5,
  review: 5,
  ask: 4,
  sharing: 6,
};

interface NavState {
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

export const useNavStore = create<NavState>()((set) => ({
  screen: 'library',
  setScreen: (screen) => set({ screen }),
}));
