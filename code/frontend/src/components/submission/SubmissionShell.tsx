import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Circle,
  ClipboardList,
  FilePlus2,
  Filter,
  Home,
  Info,
  Maximize2,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sprout,
  Sun,
} from 'lucide-react';
import { useAppStore } from '@/catalyst/ui-state/appStore';
import {
  useCatalystAgent,
  useCatalystCandidates,
  useCatalystGraph,
  useCatalystLayout,
  useCatalystMaterialData,
  useCatalystResearch,
  useCatalystSearch,
  useCatalystSettings,
  useCatalystStatus,
  useCatalystWorkspace,
} from '@/catalyst/bridge/hooks';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphControls } from '@/components/graph/GraphControls';
import { CrystalStructurePanel } from '@/components/structure/CrystalStructurePanel';
import { AgentSheet } from '@/components/agent/AgentSheet';
import { EdgeSheet } from '@/components/evidence/EdgeSheet';
import type { CandidateRowVM, CompareVM, GraphEdgeVM, GraphNodeVM, PropertyGroupVM, PropertyMetricVM, WorkspaceVM } from '@/catalyst/bridge/viewModels';

const PROPERTY_SECTIONS = [
  'thermo',
  'electronic_structure',
  'magnetism',
  'elasticity',
  'dielectric',
  'piezoelectric',
  'absorption',
  'bonds',
  'surfaces',
  'phonons',
  'eos',
  'substrates',
  'spectra',
  'tasks',
  'auxiliary',
];
const SPECTRA_SECTIONS = ['spectra'];
const EVIDENCE_SECTIONS = ['tasks', 'auxiliary', 'bonds', 'surfaces', 'thermo', 'electronic_structure', 'spectra', 'dielectric', 'elasticity'];
const ABOUT_TABS = [
  { id: 'thermodynamic', label: 'Thermo' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'magnetic', label: 'Magnetic' },
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'dielectric', label: 'Dielectric' },
  { id: 'surface', label: 'Surface' },
  { id: 'bonds', label: 'Bonds' },
  { id: 'spectra', label: 'Spectra' },
  { id: 'evidence', label: 'Evidence' },
] as const;
const COMPARE_TABS = [
  { id: 'key', label: 'Key' },
  ...ABOUT_TABS,
] as const;
const EMPTY_FILTERS: SearchFilters = {
  stable: 'any',
  metal: 'any',
  magnetic: 'any',
  band_gap_min: '',
  band_gap_max: '',
  density_min: '',
  density_max: '',
  elements: '',
  evidence: '',
};

type HomeTab = 'neighbors' | 'structure' | 'spectra';
type RailMode = 'home' | 'graph' | 'candidates' | 'add_material' | 'settings';
type CommandMode = 'search' | 'ask' | 'screen';
type SearchFilters = {
  stable: 'any' | 'stable';
  metal: 'any' | 'metal' | 'non_metal';
  magnetic: 'any' | 'magnetic' | 'non_magnetic';
  band_gap_min: string;
  band_gap_max: string;
  density_min: string;
  density_max: string;
  elements: string;
  evidence: string;
};

function detailCacheKey(materialId: string, sections: string[], limit = 25, downsample = true): string {
  return `${materialId}::${sections.join(',')}::${limit}::${String(downsample)}`;
}

function edgeEndpoint(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: string }).id);
  return String(value);
}

export function SubmissionShell() {
  const initialize = useAppStore((s) => s.initialize);
  const { status, backendUrl, isOffline, startupError, retry } = useCatalystStatus();
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useCatalystWorkspace();
  const {
    railMode,
    setRailMode,
    workspaceTab,
    setWorkspaceTab,
    hopDepth,
    setHopDepth,
    searchMode,
    setSearchMode,
    openSheet,
    theme,
    setTheme,
    toggleTheme,
    density,
    setDensity,
  } = useCatalystLayout();
  const { runSearch, isLoading: searchLoading, results, runScreen, screenLoading, screenResults } = useCatalystSearch();
  const { sendMessage, isRunning: agentLoading } = useCatalystAgent();
  const { runResearch } = useCatalystResearch();
  const {
    nodes: graphNodes,
    edges: graphEdges,
    selectNode,
    expandNeighborhood,
  } = useCatalystGraph();
  const {
    candidates,
    canCompare,
    canExport,
    runCompare,
    compareData,
    compareLoading,
    addCandidate,
    removeCandidate,
    exportCandidates,
    exportSubgraph,
  } = useCatalystCandidates();
  const { rawSettings } = useCatalystSettings();
  const {
    structureById,
    detailsById,
    structureLoadingById,
    detailsLoadingById,
    structureErrorById,
    detailsErrorById,
    loadMaterialStructure,
    loadMaterialDetails,
  } = useCatalystMaterialData();

  const [commandText, setCommandText] = useState('');
  const [resultsOpen, setResultsOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [researchPrompt, setResearchPrompt] = useState('');
  const [researchMode, setResearchMode] = useState<'chat' | 'task' | 'research'>('research');
  const [researchQueueing, setResearchQueueing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeMaterialId = workspace?.resolvedMaterialId || null;
  const activeTab = (workspaceTab === 'neighbors' || workspaceTab === 'structure' || workspaceTab === 'spectra' ? workspaceTab : 'neighbors') as HomeTab;
  const selectedCandidateIds = useMemo(() => new Set(candidates.map((candidate) => candidate.material_id)), [candidates]);

  const propertyKey = activeMaterialId ? detailCacheKey(activeMaterialId, PROPERTY_SECTIONS, 8, true) : '';
  const spectraKey = activeMaterialId ? detailCacheKey(activeMaterialId, SPECTRA_SECTIONS, 4, true) : '';
  const evidenceKey = activeMaterialId ? detailCacheKey(activeMaterialId, EVIDENCE_SECTIONS, 16, true) : '';
  const propertyDetails = propertyKey ? detailsById[propertyKey] || null : null;
  const spectraDetails = spectraKey ? detailsById[spectraKey] || null : null;
  const evidenceDetails = evidenceKey ? detailsById[evidenceKey] || null : null;
  const structurePayload = activeMaterialId ? structureById[activeMaterialId] || null : null;
  const structureLoading = !!(activeMaterialId && structureLoadingById[activeMaterialId]);
  const structureError = activeMaterialId ? structureErrorById[activeMaterialId] : null;
  const propertyError = detailsErrorById[propertyKey] || null;
  const propertyLoading = Boolean(activeMaterialId && !propertyDetails && !propertyError) || Boolean(detailsLoadingById[propertyKey]);
  const spectraLoading = Boolean(detailsLoadingById[spectraKey]);
  const spectraError = detailsErrorById[spectraKey] || null;

  const visibleResults = searchMode === 'screen' && screenResults.length ? screenResults : results.length ? results : screenResults;
  const showResultsPanel = railMode === 'home' && resultsOpen && visibleResults.length > 0;

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!activeMaterialId) return;
    void loadMaterialDetails(activeMaterialId, { sections: PROPERTY_SECTIONS, limit: 8, downsample: true });
    void loadMaterialDetails(activeMaterialId, { sections: EVIDENCE_SECTIONS, limit: 16, downsample: true });
    if (activeTab === 'structure') void loadMaterialStructure(activeMaterialId);
    if (activeTab === 'spectra') void loadMaterialDetails(activeMaterialId, { sections: SPECTRA_SECTIONS, limit: 4, downsample: true });
    if (activeTab === 'neighbors') void expandNeighborhood(activeMaterialId, { depth: hopDepth, limit_nodes: 80 });
  }, [activeMaterialId, activeTab, hopDepth, expandNeighborhood, loadMaterialDetails, loadMaterialStructure]);

  async function handleCommandSubmit() {
    const text = commandText.trim();
    if (!text) return;
    if (searchMode === 'ask') {
      await sendMessage(text);
      openSheet('agent');
      return;
    }
    if (searchMode === 'screen') {
      await runScreen(text);
      setResultsOpen(true);
      setRailMode('home');
      return;
    }
    const matches = await runSearch(text, compactSearchFilters(filters));
    setResultsOpen(true);
    setRailMode('home');
    if (matches.length > 0) await selectNode(matches[0].material_id);
  }

  function cycleCommandMode() {
    setSearchMode(searchMode === 'search' ? 'ask' : searchMode === 'ask' ? 'screen' : 'search');
  }

  function setHomeTab(tab: HomeTab) {
    setWorkspaceTab(tab);
  }

  const commandBusy = searchLoading || screenLoading || agentLoading;

  return (
    <div className="flex h-dvh w-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text-1)' }}>
      <Rail mode={railMode as RailMode} setMode={setRailMode as (mode: RailMode) => void} />

      {railMode === 'graph' ? (
        <GraphMode openAgent={() => openSheet('agent')} />
      ) : railMode === 'add_material' ? (
        <AddMode
          prompt={researchPrompt}
          setPrompt={setResearchPrompt}
          mode={researchMode}
          setMode={setResearchMode}
          loading={researchQueueing}
          onQueue={async () => {
            setResearchQueueing(true);
            try {
              await runResearch(researchPrompt || 'Research and normalize a candidate material');
            } finally {
              setResearchQueueing(false);
            }
          }}
          onAsk={() => {
            if (!researchPrompt.trim()) return;
            void sendMessage(researchPrompt.trim());
            openSheet('agent');
          }}
        />
      ) : railMode === 'settings' ? (
        <SettingsMode
          status={status}
          backendUrl={backendUrl}
          isOffline={isOffline}
          theme={theme}
          setTheme={setTheme}
          density={density}
          setDensity={setDensity}
          hopDepth={hopDepth}
          setHopDepth={setHopDepth}
          rawSettings={rawSettings}
        />
      ) : railMode === 'candidates' ? (
        <CandidatesMode
          candidates={candidates}
          canCompare={canCompare}
          canExport={canExport}
          compareData={compareData}
          compareLoading={compareLoading}
          onCompare={() => void runCompare()}
          onRemove={removeCandidate}
          onExportJson={() => void exportCandidates('json')}
          onExportCsv={() => void exportCandidates('csv')}
          onExportSubgraph={() => void exportSubgraph(candidates.map((c) => c.material_id))}
        />
      ) : (
        <HomeMode
          workspace={workspace}
          workspaceLoading={workspaceLoading}
          workspaceError={workspaceError}
          startupError={startupError}
          isOffline={isOffline}
          retry={retry}
          commandText={commandText}
          setCommandText={setCommandText}
          inputRef={inputRef}
          commandMode={searchMode}
          cycleCommandMode={cycleCommandMode}
          commandBusy={commandBusy}
          onSubmit={() => void handleCommandSubmit()}
          filters={filters}
          setFilters={setFilters}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          activeFilterCount={countActiveFilters(filters)}
          applyFilters={async () => {
            const matches = await runSearch(commandText.trim(), compactSearchFilters(filters));
            setResultsOpen(true);
            setFiltersOpen(false);
            if (matches.length > 0) await selectNode(matches[0].material_id);
          }}
          clearFilters={() => {
            setFilters(EMPTY_FILTERS);
            void runSearch(commandText.trim(), {});
            setResultsOpen(true);
          }}
          showResultsPanel={showResultsPanel}
          resultsOpen={resultsOpen}
          resultsAvailable={visibleResults.length > 0}
          onToggleResults={() => setResultsOpen((open) => !open)}
          results={visibleResults}
          onCloseResults={() => setResultsOpen(false)}
          onOpenMaterial={(id) => void selectNode(id)}
          activeTab={activeTab}
          setActiveTab={setHomeTab}
          hopDepth={hopDepth}
          setHopDepth={setHopDepth}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          seedCandidates={visibleResults}
          structure={structurePayload}
          structureLoading={structureLoading}
          structureError={structureError}
          spectraDetails={spectraDetails}
          detailsLoading={spectraLoading}
          detailsError={spectraError}
          propertyDetails={propertyDetails}
          propertyLoading={propertyLoading}
          propertyError={propertyError}
          evidenceDetails={evidenceDetails}
          selectedCandidateIds={selectedCandidateIds}
          addCandidate={addCandidate}
          removeCandidate={removeCandidate}
          isOfflineStatus={isOffline}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}

      {railMode !== 'add_material' && railMode !== 'graph' ? (
        <button
          onClick={() => openSheet('agent')}
          className={`absolute z-20 inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-sm ${railMode === 'home' ? 'bottom-[94px] right-[408px]' : 'bottom-6 right-6'}`}
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--accent)' }}
          title="Agent"
        >
          <Bot className="h-5 w-5" />
        </button>
      ) : null}

      <AgentSheet />
      <EdgeSheet />
    </div>
  );
}

function Rail({ mode, setMode }: { mode: RailMode; setMode: (mode: RailMode) => void }) {
  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'graph', label: 'Graph', icon: Network },
    { id: 'candidates', label: 'Candidates', icon: ClipboardList },
    { id: 'add_material', label: 'Add', icon: FilePlus2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="flex w-[96px] shrink-0 flex-col items-center border-r px-3 py-7" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-9 flex h-12 w-12 items-center justify-center rounded-2xl" title="Catalyst">
        <Sprout className="h-8 w-8" style={{ color: 'var(--accent)' }} />
      </div>
      <div className="flex w-full flex-col gap-4">
        {items.map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              className="flex h-[58px] flex-col items-center justify-center rounded-2xl text-xs transition"
              style={{
                background: active ? 'var(--accent-muted)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-2)',
              }}
              title={item.label}
            >
              <item.icon className="mb-1 h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomeMode({
  workspace,
  workspaceLoading,
  workspaceError,
  startupError,
  isOffline,
  retry,
  commandText,
  setCommandText,
  inputRef,
  commandMode,
  cycleCommandMode,
  commandBusy,
  onSubmit,
  filters,
  setFilters,
  filtersOpen,
  setFiltersOpen,
  activeFilterCount,
  applyFilters,
  clearFilters,
  showResultsPanel,
  resultsOpen,
  resultsAvailable,
  onToggleResults,
  results,
  onCloseResults,
  onOpenMaterial,
  activeTab,
  setActiveTab,
  hopDepth,
  setHopDepth,
  graphNodes,
  graphEdges,
  seedCandidates,
  structure,
  structureLoading,
  structureError,
  spectraDetails,
  detailsLoading,
  detailsError,
  propertyDetails,
  propertyLoading,
  propertyError,
  evidenceDetails,
  selectedCandidateIds,
  addCandidate,
  removeCandidate,
  isOfflineStatus,
  theme,
  toggleTheme,
}: {
  workspace: WorkspaceVM | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  startupError: string | null;
  isOffline: boolean;
  retry: () => void;
  commandText: string;
  setCommandText: (text: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  commandMode: CommandMode;
  cycleCommandMode: () => void;
  commandBusy: boolean;
  onSubmit: () => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  activeFilterCount: number;
  applyFilters: () => Promise<void>;
  clearFilters: () => void;
  showResultsPanel: boolean;
  resultsOpen: boolean;
  resultsAvailable: boolean;
  onToggleResults: () => void;
  results: CandidateRowVM[];
  onCloseResults: () => void;
  onOpenMaterial: (id: string) => void;
  activeTab: HomeTab;
  setActiveTab: (tab: HomeTab) => void;
  hopDepth: number;
  setHopDepth: (depth: number) => void;
  graphNodes: GraphNodeVM[];
  graphEdges: GraphEdgeVM[];
  seedCandidates: CandidateRowVM[];
  structure: any;
  structureLoading: boolean;
  structureError: string | null;
  spectraDetails: any;
  detailsLoading: boolean;
  detailsError: string | null;
  propertyDetails: any;
  propertyLoading: boolean;
  propertyError: string | null;
  evidenceDetails: any;
  selectedCandidateIds: Set<string>;
  addCandidate: (workspace: WorkspaceVM) => void;
  removeCandidate: (materialId: string) => void;
  isOfflineStatus: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col px-5 py-5">
      {isOffline ? (
        <OfflinePanel startupError={startupError} onRetry={retry} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `${showResultsPanel ? '320px ' : ''}minmax(0,1fr) 380px` }}>
          {showResultsPanel ? <ResultsPanel results={results} onOpenMaterial={onOpenMaterial} onClose={onCloseResults} selectedId={workspace?.resolvedMaterialId || null} /> : null}
          <MaterialWorkspace
            workspace={workspace}
            workspaceLoading={workspaceLoading}
            workspaceError={workspaceError}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            hopDepth={hopDepth}
            setHopDepth={setHopDepth}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            seedCandidates={seedCandidates}
            structure={structure}
            structureLoading={structureLoading}
            structureError={structureError}
            spectraDetails={spectraDetails}
            detailsLoading={detailsLoading}
            detailsError={detailsError}
            selectedCandidateIds={selectedCandidateIds}
            addCandidate={addCandidate}
            removeCandidate={removeCandidate}
            resultsOpen={resultsOpen}
            resultsAvailable={resultsAvailable}
            onToggleResults={onToggleResults}
          />
          <AboutInspector workspace={workspace} propertyDetails={propertyDetails} propertyLoading={propertyLoading} propertyError={propertyError} evidenceDetails={evidenceDetails} spectraDetails={spectraDetails} />
        </div>
      )}

      <div className="mt-4 flex h-[58px] items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center rounded-[20px] border px-5 shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <Search className="mr-4 h-6 w-6 shrink-0" style={{ color: 'var(--text-1)' }} />
          <button
            onClick={cycleCommandMode}
            className="mr-2 rounded-xl px-3 py-1.5 text-sm capitalize"
            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
            title="Click to cycle Search, Ask, Screen"
          >
            {commandMode}
          </button>
          <CommandModeHelp />
          <input
            ref={inputRef}
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') onSubmit();
            }}
            className="h-[56px] min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[var(--text-4)]"
            style={{ color: 'var(--text-1)' }}
            placeholder="Find stable oxide semiconductors with band gap above 2 eV."
          />
          <button onClick={onSubmit} disabled={commandBusy} className="ml-3 inline-flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-50" style={{ color: 'var(--accent)' }} title="Run">
            {commandBusy ? <Circle className="h-5 w-5 animate-pulse fill-current" /> : <ArrowRight className="h-7 w-7" />}
          </button>
        </div>
        <div className="relative hidden md:block">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="inline-flex h-[58px] items-center gap-3 rounded-[20px] border px-6 text-base"
            style={{ borderColor: filtersOpen ? 'var(--accent)' : 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }}
          >
            <Filter className="h-5 w-5" />
            Filters
            {activeFilterCount ? <Badge tone="good">{activeFilterCount}</Badge> : null}
          </button>
          {filtersOpen ? (
            <FiltersPopover
              filters={filters}
              setFilters={setFilters}
              onApply={() => void applyFilters()}
              onClear={clearFilters}
            />
          ) : null}
        </div>
        <button onClick={toggleTheme} className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-[20px] border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }} title="Toggle theme">
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        <span title={isOfflineStatus ? 'System offline' : 'System online'} className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-[20px] border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <Circle className="h-3 w-3 fill-current" style={{ color: isOfflineStatus ? 'var(--danger)' : 'var(--accent)' }} />
        </span>
      </div>
    </section>
  );
}

function CommandModeHelp() {
  return (
    <span className="group relative mr-3 inline-flex">
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}
        title="Search finds local materials. Ask sends context to the agent. Screen ranks materials against a requirement."
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        className="pointer-events-none absolute bottom-9 left-0 z-40 hidden w-80 rounded-2xl border p-3 text-xs leading-5 shadow-sm group-hover:block"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-2)' }}
      >
        <b style={{ color: 'var(--text-1)' }}>Search</b>: direct local lookup by formula, id, elements, or properties.<br />
        <b style={{ color: 'var(--text-1)' }}>Ask</b>: sends a question to the agent with workspace context.<br />
        <b style={{ color: 'var(--text-1)' }}>Screen</b>: ranks materials against a requirement.
      </span>
    </span>
  );
}

function FiltersPopover({
  filters,
  setFilters,
  onApply,
  onClear,
}: {
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const patch = (next: Partial<SearchFilters>) => setFilters({ ...filters, ...next });
  return (
    <div
      className="absolute bottom-[68px] right-0 z-40 w-[360px] rounded-[22px] border p-4 shadow-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-semibold">Search filters</div>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{countActiveFilters(filters)} active</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FilterSelect label="Stability" value={filters.stable} onChange={(stable) => patch({ stable: stable as SearchFilters['stable'] })} options={[['any', 'Any'], ['stable', 'Stable only']]} />
        <FilterSelect label="Metallicity" value={filters.metal} onChange={(metal) => patch({ metal: metal as SearchFilters['metal'] })} options={[['any', 'Any'], ['metal', 'Metal'], ['non_metal', 'Non-metal']]} />
        <FilterSelect label="Magnetism" value={filters.magnetic} onChange={(magnetic) => patch({ magnetic: magnetic as SearchFilters['magnetic'] })} options={[['any', 'Any'], ['magnetic', 'Magnetic'], ['non_magnetic', 'Non-magnetic']]} />
        <FilterSelect label="Evidence" value={filters.evidence} onChange={(evidence) => patch({ evidence })} options={[['', 'Any'], ['thermo', 'Thermo'], ['electronic_structure', 'Electronic'], ['magnetism', 'Magnetic'], ['elasticity', 'Mechanical'], ['dielectric', 'Dielectric'], ['surfaces', 'Surface'], ['bonds', 'Bonds'], ['spectra', 'Spectra']]} />
        <FilterInput label="Band gap min" value={filters.band_gap_min} onChange={(band_gap_min) => patch({ band_gap_min })} placeholder="eV" />
        <FilterInput label="Band gap max" value={filters.band_gap_max} onChange={(band_gap_max) => patch({ band_gap_max })} placeholder="eV" />
        <FilterInput label="Density min" value={filters.density_min} onChange={(density_min) => patch({ density_min })} placeholder="g/cm3" />
        <FilterInput label="Density max" value={filters.density_max} onChange={(density_max) => patch({ density_max })} placeholder="g/cm3" />
      </div>
      <div className="mt-3">
        <FilterInput label="Elements" value={filters.elements} onChange={(elements) => patch({ elements })} placeholder="O, Mn, Ti" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button onClick={onClear} className="rounded-xl border px-4 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Clear</button>
        <button onClick={onApply} className="rounded-xl px-4 py-2 text-sm" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Apply filters</button>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs" style={{ color: 'var(--text-3)' }}>
      <span className="mb-1 block">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl border px-3 pr-8 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
        >
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
      </span>
    </label>
  );
}

function FilterInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block text-xs" style={{ color: 'var(--text-3)' }}>
      <span className="mb-1 block">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border px-3 text-sm outline-none placeholder:text-[var(--text-4)]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
      />
    </label>
  );
}

function ResultsPanel({
  results,
  onOpenMaterial,
  onClose,
  selectedId,
}: {
  results: CandidateRowVM[];
  onOpenMaterial: (id: string) => void;
  onClose: () => void;
  selectedId: string | null;
}) {
  return (
    <aside className="min-h-0 rounded-[28px] border p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">Results</h2>
          <span className="rounded-full px-3 py-1 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{results.length}</span>
        </div>
        <button title="Close results" onClick={onClose} style={{ color: 'var(--text-3)' }}>
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-4 text-sm" style={{ color: 'var(--text-3)' }}>Ranked by relevance</div>
      <div className="no-scrollbar max-h-[calc(100vh-240px)] overflow-auto pr-1">
        {results.slice(0, 18).map((row, index) => {
          const selected = row.material_id === selectedId;
          return (
            <button
              key={row.material_id}
              onClick={() => onOpenMaterial(row.material_id)}
              className="mb-2 grid min-h-[108px] w-full grid-cols-[30px_1fr_24px] items-center rounded-2xl border px-4 text-left transition"
              style={{
                borderColor: selected ? 'var(--accent)' : 'var(--border-subtle)',
                borderLeftWidth: selected ? 3 : 1,
                background: selected ? 'var(--accent-subtle)' : 'var(--surface-1)',
                color: 'var(--text-1)',
              }}
            >
              <span className="text-base" style={{ color: selected ? 'var(--accent)' : 'var(--text-1)' }}>{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-xl font-semibold">{row.formula_pretty || row.material_id}</span>
                <span className="mt-1 block font-mono text-xs" style={{ color: 'var(--text-3)' }}>{row.material_id}</span>
                <span className="mt-2 block text-sm" style={{ color: 'var(--text-2)' }}>Band gap {formatValue(row.band_gap, 'eV')}</span>
                <span className="mt-1 block text-sm" style={{ color: 'var(--text-2)' }}>
                  Stability <Badge tone={row.is_stable ? 'good' : 'warn'}>{row.is_stable ? 'High' : 'Medium'}</Badge>
                </span>
              </span>
              <ArrowRight className="h-6 w-6" style={{ color: selected ? 'var(--accent)' : 'var(--text-1)' }} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function MaterialWorkspace({
  workspace,
  workspaceLoading,
  workspaceError,
  activeTab,
  setActiveTab,
  hopDepth,
  setHopDepth,
  graphNodes,
  graphEdges,
  seedCandidates,
  structure,
  structureLoading,
  structureError,
  spectraDetails,
  detailsLoading,
  detailsError,
  selectedCandidateIds,
  addCandidate,
  removeCandidate,
  resultsOpen,
  resultsAvailable,
  onToggleResults,
}: {
  workspace: WorkspaceVM | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  activeTab: HomeTab;
  setActiveTab: (tab: HomeTab) => void;
  hopDepth: number;
  setHopDepth: (depth: number) => void;
  graphNodes: GraphNodeVM[];
  graphEdges: GraphEdgeVM[];
  seedCandidates: CandidateRowVM[];
  structure: any;
  structureLoading: boolean;
  structureError: string | null;
  spectraDetails: any;
  detailsLoading: boolean;
  detailsError: string | null;
  selectedCandidateIds: Set<string>;
  addCandidate: (workspace: WorkspaceVM) => void;
  removeCandidate: (materialId: string) => void;
  resultsOpen: boolean;
  resultsAvailable: boolean;
  onToggleResults: () => void;
}) {
  const tabs: Array<{ id: HomeTab; label: string }> = [
    { id: 'neighbors', label: 'Neighbors' },
    { id: 'structure', label: 'Structure' },
    { id: 'spectra', label: 'Spectra' },
  ];
  const isSelected = workspace ? selectedCandidateIds.has(workspace.resolvedMaterialId) : false;

  return (
    <main className="min-h-0 rounded-[28px] border p-7" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      {workspaceLoading ? (
        <StatePanel title="Loading material" />
      ) : workspaceError ? (
        <StatePanel title={workspaceError} danger />
      ) : workspace ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[180px]">
              <div className="flex items-center gap-4">
                <h1 className="text-[32px] font-semibold leading-none">{workspace.title}</h1>
                <Badge tone="good">Selected</Badge>
              </div>
              <div className="mt-2 font-mono text-sm" style={{ color: 'var(--text-3)' }}>{workspace.resolvedMaterialId}</div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => (isSelected ? removeCandidate(workspace.resolvedMaterialId) : addCandidate(workspace))}
                className="h-10 rounded-xl border px-3 text-sm"
                style={{
                  borderColor: isSelected ? 'transparent' : 'var(--border)',
                  background: isSelected ? 'var(--accent-muted)' : 'var(--surface-1)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-2)',
                }}
                title={isSelected ? 'Remove from selected candidates' : 'Select material as candidate'}
              >
                {isSelected ? 'Selected' : 'Select'}
              </button>
              <select
                className="h-10 rounded-xl border px-4 text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }}
                value={hopDepth}
                onChange={(event) => setHopDepth(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((depth) => <option key={depth} value={depth}>Expand {depth} hops</option>)}
              </select>
              {(() => {
                const canHide = resultsOpen && resultsAvailable;
                return (
              <button
                disabled={!resultsAvailable}
                onClick={onToggleResults}
                className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                title={canHide ? 'Hide results' : 'Show results'}
              >
                {canHide ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                {canHide ? 'Hide results' : 'Show results'}
              </button>
                );
              })()}
              <button className="h-10 rounded-xl border px-3 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mb-4 flex gap-10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="border-b-2 pb-2 text-base"
                style={{
                  borderColor: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--text-1)' : 'var(--text-2)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTab === 'neighbors' ? (
              <LocalNeighborsGraph workspace={workspace} nodes={graphNodes} edges={graphEdges} hopDepth={hopDepth} seedCandidates={seedCandidates} />
            ) : activeTab === 'structure' ? (
              <CrystalStructurePanel structure={structure} isLoading={structureLoading} error={structureError} />
            ) : (
              <SpectraPanel details={spectraDetails} loading={detailsLoading} error={detailsError} />
            )}
          </div>
        </div>
      ) : (
        <StatePanel title="Select a material" text="Search or screen to open a local material workspace." />
      )}
    </main>
  );
}

function LocalNeighborsGraph({
  workspace,
  nodes,
  edges,
  hopDepth,
  seedCandidates,
}: {
  workspace: WorkspaceVM;
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
  hopDepth: number;
  seedCandidates: CandidateRowVM[];
}) {
  const { localNodes, localEdges } = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      const a = edgeEndpoint(edge.source);
      const b = edgeEndpoint(edge.target);
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)?.add(b);
      adjacency.get(b)?.add(a);
    }
    const root = workspace.resolvedMaterialId;
    const visited = new Set([root]);
    let frontier = [root];
    for (let depth = 0; depth < Math.min(5, hopDepth); depth += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) || []) {
          if (visited.size >= 42) break;
          const node = nodeMap.get(neighbor);
          if (!node || visited.has(neighbor)) continue;
          if (node.type !== 'material' && node.type !== 'element') continue;
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
      frontier = next;
    }
    let chosen = Array.from(visited).map((id) => nodeMap.get(id) || ({ id, name: workspace.title, type: 'material', val: 6, color: 'var(--accent)' } as GraphNodeVM));
    const chosenSet = new Set(chosen.map((node) => node.id));
    let localEdges = edges.filter((edge) => chosenSet.has(edgeEndpoint(edge.source)) && chosenSet.has(edgeEndpoint(edge.target))).slice(0, 80);
    if (chosen.length <= 1 && seedCandidates.length > 1) {
      const fallbackNodes: GraphNodeVM[] = seedCandidates
        .filter((candidate) => candidate.material_id !== workspace.resolvedMaterialId)
        .slice(0, 18)
        .map((candidate, index) => ({
          id: candidate.material_id,
          name: candidate.formula_pretty || candidate.material_id,
          formula_pretty: candidate.formula_pretty,
          chemsys: candidate.chemsys,
          band_gap: candidate.band_gap,
          is_stable: candidate.is_stable,
          type: 'material',
          val: 4 + (index % 4),
          color: 'var(--cat-chart-blue)',
        }));
      chosen = [...chosen, ...fallbackNodes];
      localEdges = fallbackNodes.map((node, index) => ({
        id: `local-${workspace.resolvedMaterialId}-${node.id}-${index}`,
        source: workspace.resolvedMaterialId,
        target: node.id,
        type: 'search_neighbor',
        value: 0.6,
      }));
    }
    return {
      localNodes: chosen,
      localEdges,
    };
  }, [edges, hopDepth, nodes, seedCandidates, workspace]);

  return (
    <div className="flex h-full min-h-[430px] flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg)' }}>
        <GraphCanvas graphOverride={{ nodes: localNodes, edges: localEdges, selectedNodeId: workspace.resolvedMaterialId }} />
      </div>
      <div className="no-scrollbar flex items-center justify-center gap-8 overflow-x-auto py-3 text-sm" style={{ color: 'var(--text-2)' }}>
        <LegendDot color="var(--cat-chart-green)" label="Similar composition" />
        <LegendDot color="var(--cat-chart-blue)" label="Same family" />
        <LegendDot color="var(--cat-chart-violet)" label="Related compounds" />
        <LegendDot color="var(--text-4)" label="Other" />
      </div>
    </div>
  );
}

function AboutInspector({
  workspace,
  propertyDetails,
  propertyLoading,
  propertyError,
  evidenceDetails,
  spectraDetails,
}: {
  workspace: WorkspaceVM | null;
  propertyDetails: any;
  propertyLoading: boolean;
  propertyError: string | null;
  evidenceDetails: any;
  spectraDetails: any;
}) {
  const [activeAboutTab, setActiveAboutTab] = useState<(typeof ABOUT_TABS)[number]['id']>('thermodynamic');
  const keyGroup = findPropertyGroup(propertyDetails, 'key');
  const spectraCount = Number(spectraDetails?.details?.spectra?.count || propertyDetails?.details?.spectra?.count || 0);

  if (!workspace) {
    return (
      <aside className="rounded-[28px] border p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <h2 className="text-2xl font-semibold">About material</h2>
        <p className="mt-4 text-base" style={{ color: 'var(--text-3)' }}>Open a material to see key properties and local evidence.</p>
      </aside>
    );
  }

  const evidenceSections = Object.keys(evidenceDetails?.details || {}).length || workspace.evidence.totalSections || 0;
  const evidenceRecords = Object.values(evidenceDetails?.details || {}).reduce((sum: number, section: any) => sum + Number(section?.count || 0), 0) || workspace.evidence.totalRecords || 0;
  const activeGroup = activeAboutTab === 'evidence' ? null : findPropertyGroup(propertyDetails, activeAboutTab);

  return (
    <aside className="min-h-0 rounded-[28px] border p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">About {workspace.title}</h2>
          <Badge tone="good">Selected</Badge>
        </div>
        <KeyPropertyBlock group={keyGroup} workspace={workspace} evidenceSections={evidenceSections} evidenceRecords={evidenceRecords} />
        <div className="no-scrollbar mt-5 flex shrink-0 gap-1 overflow-x-auto rounded-2xl border p-1" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}>
          {ABOUT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveAboutTab(tab.id)}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium"
              style={{
                background: activeAboutTab === tab.id ? 'var(--accent-muted)' : 'transparent',
                color: activeAboutTab === tab.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}>
          <div className="no-scrollbar h-full overflow-auto p-4">
            {activeAboutTab === 'evidence' ? (
              <EvidenceCards workspace={workspace} evidenceDetails={evidenceDetails} spectraCount={spectraCount} />
            ) : propertyLoading || propertyError || !propertyDetails ? (
              <EmptyGroupState label={propertyLoading ? 'Loading local property groups' : 'Property groups unavailable'} compactText={propertyLoading ? 'Loading local property groups from the backend.' : propertyError || 'The backend did not return property groups for this material.'} />
            ) : activeAboutTab === 'spectra' && spectraCount === 0 ? (
              <EmptyGroupState label="spectra" />
            ) : (
              <PropertyGroupTab group={activeGroup} label={ABOUT_TABS.find((tab) => tab.id === activeAboutTab)?.label || activeAboutTab} />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function EvidenceCards({ workspace, evidenceDetails, spectraCount }: { workspace: WorkspaceVM; evidenceDetails: any; spectraCount: number }) {
  const sections = Object.entries(evidenceDetails?.details || {});
  const cards = [
    { title: 'Materials Project', subtitle: workspace.resolvedMaterialId, badge: 'MP', count: 1 },
    { title: 'Thermo records', subtitle: `${evidenceDetails?.details?.thermo?.count || 0} rows`, badge: 'local', count: evidenceDetails?.details?.thermo?.count || 0 },
    { title: 'Spectra curves', subtitle: spectraCount ? `${spectraCount} curves` : 'not in snapshot', badge: 'local', count: spectraCount },
    ...sections.slice(0, 6).map(([name, payload]: any) => ({ title: `${labelize(name)} records`, subtitle: `${payload.count || 0} rows`, badge: payload.source || 'local', count: payload.count || 0 })),
  ];
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div key={`${card.title}-${card.subtitle}`} className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
          <div>
            <div className="text-base">{card.title}</div>
            <div className="text-sm" style={{ color: 'var(--text-3)' }}>{card.subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="muted">{card.badge}</Badge>
            <span className="font-mono text-sm" style={{ color: card.count ? 'var(--accent)' : 'var(--text-4)' }}>{card.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function KeyPropertyBlock({
  group,
  workspace,
  evidenceSections,
  evidenceRecords,
}: {
  group?: PropertyGroupVM | null;
  workspace: WorkspaceVM;
  evidenceSections: number;
  evidenceRecords: number;
}) {
  const rows = (group?.items || [])
    .filter((item) => item.available !== false && item.value !== null && item.value !== undefined && item.value !== '')
    .slice(0, 8);
  const fallbackRows: PropertyMetricVM[] = workspace.metrics.slice(0, 7).map((metric) => ({
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    available: metric.value !== null && metric.value !== undefined,
  }));
  const items = rows.length ? rows : fallbackRows;
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Key properties</div>
        <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>{evidenceSections} sections / {evidenceRecords} rows</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{item.label}</div>
            <div className="truncate font-mono text-sm" style={{ color: 'var(--text-1)' }}>{renderMetric(item)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertyGroupTab({ group, label }: { group?: PropertyGroupVM | null; label: string }) {
  if (!group || Number(group.available_count || 0) === 0) return <EmptyGroupState label={label} />;
  const numericMax = Math.max(0, ...group.items.map((item) => Math.abs(metricNumber(item))).filter((value) => Number.isFinite(value)));
  const availableCount = Number(group.available_count || 0);
  const totalCount = Number(group.total_count || group.items.length || 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{group.label || label}</div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>Local snapshot fields</div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 font-mono text-xs" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
          {availableCount}/{totalCount}
        </span>
      </div>
      <div className="space-y-2">
        {group.items.map((item) => (
          <MetricValueRow key={item.label} item={item} max={numericMax} />
        ))}
      </div>
    </div>
  );
}

function MetricValueRow({ item, max }: { item: PropertyMetricVM; max: number }) {
  const available = item.available !== false && item.value !== null && item.value !== undefined && item.value !== '';
  const numeric = metricNumber(item);
  const hasBar = available && Number.isFinite(numeric) && max > 0;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm" style={{ color: available ? 'var(--text-1)' : 'var(--text-3)' }}>{item.label}</div>
          <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-4)' }}>{item.source || 'local snapshot'}</div>
        </div>
        <div className="max-w-[46%] truncate text-right font-mono text-sm" style={{ color: available ? 'var(--text-1)' : 'var(--text-4)' }}>
          {available ? renderMetric(item) : '-'}
        </div>
      </div>
      {hasBar ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(6, Math.min(100, (Math.abs(numeric) / max) * 100))}%`, background: numeric < 0 ? 'var(--cat-chart-violet)' : 'var(--accent)' }} />
        </div>
      ) : null}
    </div>
  );
}

function EmptyGroupState({ label, compactText }: { label: string; compactText?: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center text-center">
      <div className="max-w-xs">
        <div className="text-base font-semibold">{compactText ? label : `No ${label.toLowerCase()} record in local snapshot for this material.`}</div>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{compactText || 'This is a data availability issue, not a UI loading failure.'}</p>
      </div>
    </div>
  );
}

function SpectraPanel({ details, loading, error }: { details: any; loading: boolean; error: string | null }) {
  if (loading) return <StatePanel title="Loading spectra" />;
  if (error) return <StatePanel title={error} danger />;
  const records = details?.details?.spectra?.records || [];
  if (!records.length) {
    return (
      <div className="flex h-full min-h-[430px] items-center justify-center rounded-2xl border text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="max-w-sm">
          <SlidersHorizontal className="mx-auto mb-4 h-10 w-10" style={{ color: 'var(--accent)' }} />
          <div className="text-xl font-semibold">No spectra curves in local snapshot for this material</div>
          <p className="mt-2 text-base" style={{ color: 'var(--text-3)' }}>This is a data availability issue, not a UI loading failure. Try a material with spectra evidence or add external evidence later.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="no-scrollbar h-full space-y-4 overflow-auto pr-1">
      {records.slice(0, 3).map((record: any, index: number) => (
        <div key={`${record.material_id}-${index}`} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <div className="mb-3 text-sm" style={{ color: 'var(--text-3)' }}>{record.absorbing_element || 'Element'} {record.edge || ''} spectra</div>
          <SimpleLineChart x={record.spectrum?.x || []} y={record.spectrum?.y || []} />
        </div>
      ))}
    </div>
  );
}

function GraphMode({ openAgent }: { openAgent: () => void }) {
  return (
    <section className="relative min-w-0 flex-1" style={{ background: 'var(--bg)' }}>
      <GraphCanvas />
      <GraphControls />
      <button onClick={openAgent} className="absolute bottom-6 right-6 inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--accent)' }} title="Agent">
        <Bot className="h-5 w-5" />
      </button>
    </section>
  );
}

function CandidatesMode({
  candidates,
  canCompare,
  canExport,
  compareData,
  compareLoading,
  onCompare,
  onRemove,
  onExportJson,
  onExportCsv,
  onExportSubgraph,
}: {
  candidates: CandidateRowVM[];
  canCompare: boolean;
  canExport: boolean;
  compareData: any;
  compareLoading: boolean;
  onCompare: () => void;
  onRemove: (materialId: string) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportSubgraph: () => void;
}) {
  const [activeCompareTab, setActiveCompareTab] = useState<(typeof COMPARE_TABS)[number]['id']>('key');
  return (
    <section className="no-scrollbar min-w-0 flex-1 overflow-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto max-w-7xl rounded-[22px] border p-8" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Candidates</h1>
            <p className="mt-1" style={{ color: 'var(--text-3)' }}>Compare selected materials and export local evidence.</p>
          </div>
          <div className="flex gap-2">
            <button disabled={!canCompare || compareLoading} onClick={onCompare} className="rounded-xl px-4 py-2 text-sm disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{compareLoading ? 'Comparing' : 'Compare'}</button>
            <button disabled={!canExport} onClick={onExportJson} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Export JSON</button>
            <button disabled={!canExport} onClick={onExportCsv} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Export CSV</button>
            <button disabled={!canExport} onClick={onExportSubgraph} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Export subgraph</button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {candidates.length ? candidates.map((candidate) => (
            <div key={candidate.material_id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-semibold">{candidate.formula_pretty}</div>
                  <div className="font-mono text-sm" style={{ color: 'var(--text-3)' }}>{candidate.material_id}</div>
                </div>
                <button onClick={() => onRemove(candidate.material_id)} style={{ color: 'var(--text-3)' }}>remove</button>
              </div>
              <MetricList compact rows={[
                ['Band gap', formatValue(candidate.band_gap, 'eV')],
                ['Hull energy', formatValue(candidate.energy_above_hull, 'eV/atom')],
                ['Formation', formatValue(candidate.formation_energy_per_atom, 'eV/atom')],
                ['Density', formatValue(candidate.density, 'g/cm3')],
                ['Evidence', `${candidate.evidence_sections || 0} sections`],
              ]} />
            </div>
          )) : <StatePanel title="No candidates selected" text="Add candidates from Home to compare and export." />}
        </div>
        {compareData?.materials?.length ? (
          <CompareTabs
            compareData={compareData}
            activeTab={activeCompareTab}
            setActiveTab={setActiveCompareTab}
          />
        ) : null}
      </div>
    </section>
  );
}

function CompareTabs({
  compareData,
  activeTab,
  setActiveTab,
}: {
  compareData: CompareVM;
  activeTab: (typeof COMPARE_TABS)[number]['id'];
  setActiveTab: (tab: (typeof COMPARE_TABS)[number]['id']) => void;
}) {
  const materials = (compareData.materials || []) as Array<Record<string, any>>;
  return (
    <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border p-1" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
        {COMPARE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              background: activeTab === tab.id ? 'var(--accent-muted)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <CompareTable materials={materials} groupKey={activeTab} />
    </div>
  );
}

function CompareTable({ materials, groupKey }: { materials: Array<Record<string, any>>; groupKey: string }) {
  const rows = getCompareRows(materials, groupKey);
  if (!rows.length) return <EmptyGroupState label={COMPARE_TABS.find((tab) => tab.id === groupKey)?.label || groupKey} />;
  return (
    <div className="no-scrollbar overflow-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b px-3 py-3 text-left font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)' }}>Metric</th>
            {materials.map((material) => (
              <th key={String(material.material_id)} className="border-b px-3 py-3 text-left font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
                <div>{material.formula_pretty || material.material_id}</div>
                <div className="font-mono text-xs font-normal" style={{ color: 'var(--text-3)' }}>{material.material_id}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="sticky left-0 z-10 border-b px-3 py-3 font-medium" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-1)' }}>{row.label}</td>
              {materials.map((material) => {
                const cell = row.values[String(material.material_id)];
                const numeric = metricNumber(cell || {});
                const hasBar = cell && Number.isFinite(numeric) && row.max > 0;
                return (
                  <td key={`${row.label}-${material.material_id}`} className="border-b px-3 py-3 align-top" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="font-mono" style={{ color: cell?.available === false || !cell ? 'var(--text-4)' : 'var(--text-1)' }}>{cell ? renderMetric(cell) : '-'}</div>
                    {hasBar ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(6, Math.min(100, (Math.abs(numeric) / row.max) * 100))}%`, background: numeric < 0 ? 'var(--cat-chart-violet)' : 'var(--accent)' }} />
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddMode({
  prompt,
  setPrompt,
  mode,
  setMode,
  loading,
  onQueue,
  onAsk,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  mode: 'chat' | 'task' | 'research';
  setMode: (mode: 'chat' | 'task' | 'research') => void;
  loading: boolean;
  onQueue: () => void | Promise<void>;
  onAsk: () => void;
}) {
  return (
    <section className="no-scrollbar min-w-0 flex-1 overflow-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[22px] border p-8" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <h1 className="text-3xl font-semibold">Add material evidence</h1>
          <p className="mt-2 text-base" style={{ color: 'var(--text-3)' }}>Queue research, attach local files, or ask the agent to normalize a candidate material.</p>
          <div className="mt-6 flex gap-2">
            {(['chat', 'task', 'research'] as const).map((item) => (
              <button key={item} onClick={() => setMode(item)} className="rounded-xl px-4 py-2 text-sm" style={{ background: mode === item ? 'var(--accent-muted)' : 'var(--surface-2)', color: mode === item ? 'var(--accent)' : 'var(--text-2)' }}>{item}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-5 min-h-[320px] w-full resize-none rounded-2xl border p-5 text-base outline-none" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }} placeholder="Describe the material, paste a source URL, or summarize the evidence to ingest." />
          <div className="mt-4 flex items-center justify-between">
            <button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm" style={{ borderColor: 'var(--border)' }}><Paperclip className="h-4 w-4" /> Attach files</button>
            <div className="flex gap-2">
              <button onClick={onAsk} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm" style={{ borderColor: 'var(--border)' }}><Send className="h-4 w-4" /> Chat</button>
              <button onClick={onQueue} disabled={loading} className="rounded-xl px-5 py-2 text-sm disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{loading ? 'Queueing' : 'Queue research'}</button>
            </div>
          </div>
        </div>
        <div className="rounded-[22px] border p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <h2 className="text-xl font-semibold">Research run</h2>
          <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
            Pending runs and extracted material JSON appear here when available.
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsMode({
  status,
  backendUrl,
  isOffline,
  theme,
  setTheme,
  density,
  setDensity,
  hopDepth,
  setHopDepth,
  rawSettings,
}: {
  status: any;
  backendUrl: string;
  isOffline: boolean;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  density: 'comfortable' | 'compact';
  setDensity: (density: 'comfortable' | 'compact') => void;
  hopDepth: number;
  setHopDepth: (depth: number) => void;
  rawSettings: Record<string, any>;
}) {
  const providerName = status.provider?.activeProvider || rawSettings?.llm?.provider || 'not configured';
  const researchSources = status.provider?.researchSources || {};
  return (
    <section className="no-scrollbar min-w-0 flex-1 overflow-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto max-w-7xl rounded-[28px] border p-8" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Settings</h1>
            <p className="mt-1" style={{ color: 'var(--text-3)' }}>Local workspace appearance, backend, provider, research, dataset, and defaults.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm" style={{ background: isOffline ? 'rgba(220,38,38,0.12)' : 'var(--accent-muted)', color: isOffline ? 'var(--danger)' : 'var(--accent)' }}>
            <Circle className="h-2.5 w-2.5 fill-current" />
            {isOffline ? 'Offline' : 'Online'}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SettingsBlock title="Appearance">
            <ToggleGroup value={theme} values={['light', 'dark']} onChange={(value) => setTheme(value as 'light' | 'dark')} />
            <div className="mt-3"><ToggleGroup value={density} values={['comfortable', 'compact']} onChange={(value) => setDensity(value as 'comfortable' | 'compact')} /></div>
          </SettingsBlock>
          <SettingsBlock title="Backend API">
            <MetricList compact rows={[
              ['Status', isOffline ? 'offline' : 'online'],
              ['URL', backendUrl],
              ['Version', status.version || '-'],
              ['Backend', status.backendLabel || 'local files'],
            ]} />
          </SettingsBlock>
          <SettingsBlock title="API placeholders">
            <SettingsInput label="OpenAI API key" placeholder="Stored outside UI for now" />
            <SettingsInput label="Materials Project key" placeholder="Optional external evidence key" />
          </SettingsBlock>
          <SettingsBlock title="Dataset">
            <MetricList compact rows={[
              ['Materials', status.catalog?.materials?.toLocaleString() || '0'],
              ['Evidence rows', status.catalog?.evidenceRows?.toLocaleString() || '0'],
              ['Clusters', status.catalog?.clusters?.toLocaleString() || '0'],
              ['Release', status.catalog?.sourceRelease || '-'],
            ]} />
          </SettingsBlock>
          <SettingsBlock title="Agent provider">
            <MetricList compact rows={[
              ['Provider', providerName],
              ['LLM configured', status.provider?.llmConfigured ? 'yes' : 'no'],
              ['Gemini', researchSources.gemini || researchSources.google || '-'],
              ['OpenAI', researchSources.openai || '-'],
            ]} />
            <div className="mt-3 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
              API key fields are UI placeholders until backend persistence is wired. No fake save is performed here.
            </div>
          </SettingsBlock>
          <SettingsBlock title="Research sources">
            <MetricList compact rows={[
              ['Deep research', researchSources.deep_research || 'not configured'],
              ['Materials Project', researchSources.materials_project || 'local snapshot'],
              ['Semantic Scholar', researchSources.semantic_scholar || '-'],
              ['Crossref', researchSources.crossref || '-'],
              ['arXiv', researchSources.arxiv || '-'],
              ['PDF ingest', status.capabilities?.pdfIngest ? 'enabled' : 'disabled'],
            ]} />
          </SettingsBlock>
          <SettingsBlock title="Defaults">
            <MetricList compact rows={[
              ['Default hops', String(hopDepth)],
              ['Home max hops', '5'],
              ['Graph mode', 'full canvas'],
              ['Home graph', 'local neighborhood'],
            ]} />
            <input type="range" min={1} max={5} value={hopDepth} onChange={(event) => setHopDepth(Number(event.target.value))} className="mt-4 h-1 w-full accent-[var(--accent)]" />
          </SettingsBlock>
          <SettingsBlock title="Export defaults">
            <MetricList compact rows={[
              ['Candidate export', 'JSON / CSV'],
              ['Subgraph evidence', 'included'],
              ['Edge details', 'on demand'],
              ['Compare view', 'tabbed groups'],
            ]} />
          </SettingsBlock>
        </div>
      </div>
    </section>
  );
}

function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function SettingsInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="mb-3 block text-sm last:mb-0" style={{ color: 'var(--text-2)' }}>
      <span className="mb-1 block">{label}</span>
      <input
        disabled
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border px-3 text-sm outline-none disabled:opacity-80"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
      />
    </label>
  );
}

function ToggleGroup({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex rounded-xl border p-1" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      {values.map((item) => (
        <button key={item} onClick={() => onChange(item)} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: value === item ? 'var(--accent-muted)' : 'transparent', color: value === item ? 'var(--accent)' : 'var(--text-2)' }}>{item}</button>
      ))}
    </div>
  );
}

function MetricList({ rows, compact = false }: { rows: Array<[string, string]>; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between border-b pb-2 last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <span style={{ color: 'var(--text-2)' }}>{label}</span>
          <span className="ml-4 text-right font-mono" style={{ color: 'var(--text-1)' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'good' | 'warn' | 'muted' }) {
  const color = tone === 'good' ? 'var(--accent)' : tone === 'warn' ? 'var(--warning)' : 'var(--text-3)';
  const background = tone === 'good' ? 'var(--accent-muted)' : tone === 'warn' ? 'rgba(240,195,106,0.18)' : 'var(--surface-2)';
  return <span className="inline-flex rounded-xl px-3 py-1 text-sm" style={{ background, color }}>{children}</span>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: color }} />{label}</span>;
}

function StatePanel({ title, text, danger = false }: { title: string; text?: string; danger?: boolean }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: danger ? 'var(--danger)' : 'var(--text-2)' }}>
      <div>
        <div className="text-xl font-semibold">{title}</div>
        {text ? <p className="mt-2 text-base" style={{ color: 'var(--text-3)' }}>{text}</p> : null}
      </div>
    </div>
  );
}

function OfflinePanel({ startupError, onRetry }: { startupError: string | null; onRetry: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-[22px] border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="max-w-md text-center">
        <div className="text-2xl font-semibold" style={{ color: 'var(--danger)' }}>Backend offline</div>
        <p className="mt-3" style={{ color: 'var(--text-3)' }}>{startupError || 'Unable to reach the Catalyst backend.'}</p>
        <button onClick={onRetry} className="mt-5 rounded-xl px-5 py-2" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Retry</button>
      </div>
    </div>
  );
}

function SimpleLineChart({ x, y }: { x: number[]; y: number[] }) {
  if (!Array.isArray(x) || !Array.isArray(y) || !x.length || !y.length) return <StatePanel title="Spectrum unavailable" />;
  const n = Math.min(x.length, y.length);
  if (n < 2) return <StatePanel title="Spectrum unavailable" />;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const yi = Number(y[i]);
    if (!Number.isFinite(yi)) continue;
    if (yi < minY) minY = yi;
    if (yi > maxY) maxY = yi;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return <StatePanel title="Spectrum unavailable" />;
  const range = Math.max(1e-6, maxY - minY);
  const points: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const px = (i / (n - 1)) * 100;
    const py = 100 - ((Number(y[i]) - minY) / range) * 100;
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 42" className="h-56 w-full rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      {[10, 20, 30].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="var(--border-subtle)" strokeWidth="0.35" />)}
      <polyline points={points.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}

function formatValue(value: unknown, unit = ''): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (Number.isFinite(n)) {
    const rendered = Math.abs(n) >= 10 ? n.toFixed(2) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return `${rendered}${unit ? ` ${unit}` : ''}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}

function getPropertyGroups(payload: any): PropertyGroupVM[] {
  return Array.isArray(payload?.property_groups) ? payload.property_groups : [];
}

function findPropertyGroup(payload: any, key: string): PropertyGroupVM | null {
  return findGroupInList(getPropertyGroups(payload), key);
}

function findGroupInList(groups: PropertyGroupVM[], key: string): PropertyGroupVM | null {
  const alias: Record<string, string> = {
    thermo: 'thermodynamic',
    electronic_structure: 'electronic',
    magnetism: 'magnetic',
    elasticity: 'mechanical',
    surfaces: 'surface',
  };
  const normalized = alias[key] || key;
  return groups.find((group) => group.key === normalized || group.key === key) || null;
}

function renderMetric(item: PropertyMetricVM): string {
  if (item.available === false || item.value === null || item.value === undefined || item.value === '') return '-';
  const raw = item.value;
  if (Array.isArray(raw)) {
    return raw.length ? raw.slice(0, 3).map(compactValue).join(', ') : '-';
  }
  if (typeof raw === 'object') return compactValue(raw);
  return formatValue(raw, item.unit || '');
}

function compactValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function metricNumber(item: Partial<PropertyMetricVM>): number {
  if (item.value === null || item.value === undefined || typeof item.value === 'boolean') return Number.NaN;
  if (typeof item.value === 'number') return item.value;
  if (typeof item.value === 'string') {
    const n = Number(item.value.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function countActiveFilters(filters: SearchFilters): number {
  return Object.entries(filters).reduce((count, [key, value]) => {
    if (key === 'stable' || key === 'metal' || key === 'magnetic') return count + (value !== 'any' ? 1 : 0);
    return count + (value ? 1 : 0);
  }, 0);
}

function compactSearchFilters(filters: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (filters.stable === 'stable') out.stable = true;
  if (filters.metal === 'metal') out.metal = true;
  if (filters.metal === 'non_metal') out.metal = false;
  if (filters.magnetic === 'magnetic') out.magnetic = true;
  if (filters.magnetic === 'non_magnetic') out.magnetic = false;
  for (const key of ['band_gap_min', 'band_gap_max', 'density_min', 'density_max'] as const) {
    if (!filters[key].trim()) continue;
    const value = Number(filters[key]);
    if (Number.isFinite(value)) out[key] = value;
  }
  if (filters.elements.trim()) out.elements = filters.elements.trim();
  if (filters.evidence) out.evidence = filters.evidence;
  return out;
}

function getCompareRows(materials: Array<Record<string, any>>, groupKey: string): Array<{ label: string; values: Record<string, PropertyMetricVM>; max: number }> {
  const rows = new Map<string, { label: string; values: Record<string, PropertyMetricVM>; max: number }>();
  for (const material of materials) {
    const materialId = String(material.material_id);
    const groups = Array.isArray(material.property_groups) ? material.property_groups as PropertyGroupVM[] : [];
    const group = findGroupInList(groups, groupKey);
    const items = group?.items?.length ? group.items : fallbackCompareItems(material, groupKey);
    for (const item of items) {
      const current = rows.get(item.label) || { label: item.label, values: {}, max: 0 };
      current.values[materialId] = item;
      const n = Math.abs(metricNumber(item));
      if (Number.isFinite(n)) current.max = Math.max(current.max, n);
      rows.set(item.label, current);
    }
  }
  return Array.from(rows.values()).filter((row) => Object.values(row.values).some((item) => item.available !== false && item.value !== null && item.value !== undefined && item.value !== ''));
}

function fallbackCompareItems(material: Record<string, any>, groupKey: string): PropertyMetricVM[] {
  const pairs: Record<string, Array<[string, string, string?]>> = {
    key: [
      ['Formula', 'formula_pretty'],
      ['Chemical system', 'chemsys'],
      ['Stable', 'is_stable'],
      ['Band gap', 'band_gap', 'eV'],
      ['Energy above hull', 'energy_above_hull', 'eV/atom'],
      ['Formation energy', 'formation_energy_per_atom', 'eV/atom'],
      ['Density', 'density', 'g/cm3'],
      ['Evidence sections', 'evidence_sections'],
    ],
    thermodynamic: [
      ['Energy above hull', 'energy_above_hull', 'eV/atom'],
      ['Formation energy', 'formation_energy_per_atom', 'eV/atom'],
      ['Energy per atom', 'energy_per_atom', 'eV'],
      ['Equilibrium rxn energy', 'equilibrium_reaction_energy_per_atom', 'eV/atom'],
    ],
    electronic: [
      ['Band gap', 'band_gap', 'eV'],
      ['Direct gap', 'is_gap_direct'],
      ['Metal', 'is_metal'],
      ['VBM', 'vbm', 'eV'],
      ['CBM', 'cbm', 'eV'],
      ['Fermi energy', 'efermi', 'eV'],
    ],
    magnetic: [
      ['Magnetic', 'is_magnetic'],
      ['Ordering', 'ordering'],
      ['Total magnetization', 'total_magnetization', 'muB'],
      ['Magnetic sites', 'num_magnetic_sites'],
    ],
    mechanical: [
      ['Bulk modulus VRH', 'bulk_modulus_vrh', 'GPa'],
      ['Shear modulus VRH', 'shear_modulus_vrh', 'GPa'],
      ['Universal anisotropy', 'universal_anisotropy'],
      ['Poisson ratio', 'homogeneous_poisson'],
    ],
    dielectric: [
      ['Total dielectric', 'e_total'],
      ['Ionic dielectric', 'e_ionic'],
      ['Electronic dielectric', 'e_electronic'],
      ['Refractive index', 'n_refractive'],
      ['Piezo e_ij max', 'e_ij_max'],
    ],
    surface: [
      ['Surface energy', 'weighted_surface_energy', 'J/m2'],
      ['Work function', 'weighted_work_function', 'eV'],
      ['Surface anisotropy', 'surface_anisotropy'],
      ['Shape factor', 'shape_factor'],
    ],
    spectra: [
      ['Evidence sections', 'evidence_sections'],
      ['Relations', 'relation_count'],
    ],
    evidence: [
      ['Evidence sections', 'evidence_sections'],
      ['Relations', 'relation_count'],
      ['Source release', 'source_release'],
    ],
  };
  return (pairs[groupKey] || []).map(([label, key, unit]) => ({
    label,
    value: material[key],
    unit,
    source: 'compare',
    available: material[key] !== null && material[key] !== undefined && material[key] !== '',
  }));
}
