import { create } from 'zustand';

export type ActiveSheet =
  | 'inspector'
  | 'agent'
  | 'candidates'
  | 'compare'
  | 'evidence'
  | 'edge'
  | 'research'
  | 'settings'
  | 'sessions'
  | null;

export type RailMode = 'home' | 'graph' | 'candidates' | 'add_material' | 'settings';
export type WorkspaceTab = 'neighbors' | 'structure' | 'spectra';
export type CommandMode = 'search' | 'ask' | 'screen';
export type DensityMode = 'comfortable' | 'compact';

export interface LayoutState {
  activeSheet: ActiveSheet;
  openSheet: (sheet: ActiveSheet) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: ActiveSheet) => void;

  searchMode: CommandMode;
  setSearchMode: (mode: CommandMode) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  graphControlsOpen: boolean;
  setGraphControlsOpen: (open: boolean) => void;

  candidateTrayExpanded: boolean;
  setCandidateTrayExpanded: (v: boolean) => void;

  railMode: RailMode;
  setRailMode: (mode: RailMode) => void;
  workspaceTab: WorkspaceTab;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  hopDepth: number;
  setHopDepth: (depth: number) => void;

  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  density: DensityMode;
  setDensity: (density: DensityMode) => void;
}

const readStored = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
};

const writeStored = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
};

const readStoredTheme = (): 'dark' | 'light' => {
  const stored = readStored('catalyst-theme');
  return stored === 'light' || stored === 'dark' ? stored : 'light';
};

const readStoredDensity = (): DensityMode => {
  const stored = readStored('catalyst-density');
  return stored === 'compact' || stored === 'comfortable' ? stored : 'comfortable';
};

const readStoredRailMode = (): RailMode => {
  const stored = readStored('catalyst-rail-mode');
  const valid: RailMode[] = ['home', 'graph', 'candidates', 'add_material', 'settings'];
  return valid.includes(stored as RailMode) ? (stored as RailMode) : 'home';
};

const readStoredSearchMode = (): CommandMode => {
  const stored = readStored('catalyst-command-mode');
  return stored === 'search' || stored === 'ask' || stored === 'screen' ? stored : 'search';
};

const readStoredHopDepth = (): number => {
  const raw = Number(readStored('catalyst-hop-depth') || '2');
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(5, Math.round(raw)));
};

export const useLayoutStore = create<LayoutState>((set) => ({
  activeSheet: null,
  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  toggleSheet: (sheet) => set((s) => ({ activeSheet: s.activeSheet === sheet ? null : sheet })),

  searchMode: readStoredSearchMode(),
  setSearchMode: (mode) => {
    writeStored('catalyst-command-mode', mode);
    set({ searchMode: mode });
  },
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  graphControlsOpen: false,
  setGraphControlsOpen: (open) => set({ graphControlsOpen: open }),

  candidateTrayExpanded: false,
  setCandidateTrayExpanded: (v) => set({ candidateTrayExpanded: v }),

  railMode: readStoredRailMode(),
  setRailMode: (mode) => {
    writeStored('catalyst-rail-mode', mode);
    set({ railMode: mode });
  },
  workspaceTab: 'neighbors',
  setWorkspaceTab: (tab) => set({ workspaceTab: tab }),
  hopDepth: readStoredHopDepth(),
  setHopDepth: (depth) => {
    const next = Math.max(1, Math.min(5, Math.round(depth)));
    writeStored('catalyst-hop-depth', String(next));
    set({ hopDepth: next });
  },

  theme: readStoredTheme(),
  setTheme: (theme) => {
    writeStored('catalyst-theme', theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      writeStored('catalyst-theme', next);
      return { theme: next };
    }),

  density: readStoredDensity(),
  setDensity: (density) => {
    writeStored('catalyst-density', density);
    set({ density });
  },
}));
