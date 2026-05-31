// @ts-nocheck
import { Check, Link2, Plus, Star, X, Network, Download, Copy } from "lucide-react"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"

export function InspectorPanel() {
  const selectedNodeId = useStore((state) => state.selectedNodeId)
  const setSelectedNodeId = useStore((state) => state.setSelectedNodeId)
  const selectedMaterialData = useStore((state) => state.selectedMaterialData)
  const isLoading = useStore((state) => state.isLoading)
  const addCandidate = useStore((state) => state.addCandidate)
  const removeCandidate = useStore((state) => state.removeCandidate)
  const candidates = useStore((state) => state.candidates)
  const expandNeighborhood = useStore((state) => state.expandNeighborhood)
  const exportCandidates = useStore((state) => state.exportCandidates)

  if (!selectedNodeId) return null

  if (isLoading && !selectedMaterialData) {
    return (
      <div className="absolute top-6 bottom-6 right-6 w-[400px] max-w-[calc(100vw-104px)] bg-surface-2/95 backdrop-blur-xl border border-border-default rounded-xl flex items-center justify-center shadow-2xl z-30">
        <div className="text-text-tertiary animate-pulse text-sm">Loading material data...</div>
      </div>
    )
  }

  if (!selectedMaterialData) {
     return (
      <div className="absolute top-6 bottom-6 right-6 w-[400px] max-w-[calc(100vw-104px)] bg-surface-2/95 backdrop-blur-xl border border-border-default rounded-xl flex items-center justify-center shadow-2xl z-30">
        <div className="text-text-tertiary text-sm">Material data unavailable</div>
        <button onClick={() => setSelectedNodeId(null)} className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4"/></button>
      </div>
    )
  }

  const summary = selectedMaterialData.summary || {};
  const material = selectedMaterialData.material || {};
  const props = selectedMaterialData.properties || {};
  const structure = selectedMaterialData.structure || {};
  const evidenceSections = selectedMaterialData.evidence?.sections || [];
  
  const matId = selectedMaterialData.resolved_material_id || selectedMaterialData.material_id;
  const isCandidate = candidates.some((candidate) => candidate.material_id === matId);
  const displayName = summary.formula_pretty || material.formula_pretty || "Unknown";
  const subtitle = summary.chemsys || material.chemsys || "Unknown";
  
  const stabilityVal = summary.formation_energy_per_atom;
  const stability = stabilityVal !== undefined && stabilityVal !== null ? stabilityVal.toFixed(3) : "N/A";
  const isStable = summary.is_stable;
  const stabilityStatus = isStable === true ? "Stable" : isStable === false ? "Metastable" : undefined;
  
  const bandGapVal = summary.band_gap;
  const bandGap = bandGapVal !== undefined && bandGapVal !== null ? bandGapVal.toFixed(3) : "N/A";
  const isMetal = summary.is_metal;
  const bandGapStatus = isMetal ? "Metal" : "Non-metal";

  const magneticState = summary.ordering || "N/A";
  const isMagnetic = summary.is_magnetic;
  const magneticStatus = isMagnetic ? "Magnetic" : "Non-magnetic";

  const spaceGroup = structure.symmetry?.symbol || structure.symmetry?.number?.toString() || "N/A";
  const crystalSystem = structure.symmetry?.crystal_system || "N/A";
  const density = structure.density !== undefined && structure.density !== null ? structure.density.toFixed(3) : undefined;
  const nsites = structure.nsites !== undefined && structure.nsites !== null ? structure.nsites.toString() : "N/A";
  const volume = structure.volume !== undefined && structure.volume !== null ? structure.volume.toFixed(3) : "N/A";
  const bulkModulus = props.mechanical?.bulk_modulus_vrh !== undefined && props.mechanical?.bulk_modulus_vrh !== null ? props.mechanical.bulk_modulus_vrh.toFixed(3) : undefined;

  const recordsTotal = evidenceSections.reduce((acc: number, sec: any) => acc + (sec.records || 0), 0);

  const elements = material.elements || [];
  const legendElements = elements.length > 0 ? elements.slice(0, 4) : ["A", "B"];
  const legendColors = ["bg-status-success", "bg-node-material", "bg-node-element", "bg-node-cluster"];

  return (
    <div className="absolute top-6 bottom-6 right-6 w-[400px] max-w-[calc(100vw-104px)] bg-surface-2/95 backdrop-blur-xl border border-border-default rounded-xl flex flex-col shadow-2xl z-30 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border-default flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedNodeId(null)} className="text-text-tertiary hover:text-text-primary">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{displayName}</h2>
          </div>
          <div className="flex gap-3 text-text-tertiary">
            <button
              onClick={() => isCandidate ? removeCandidate(matId) : addCandidate(selectedMaterialData)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs transition active:scale-[0.98]",
                isCandidate
                  ? "border-status-success/25 bg-status-success/10 text-status-success hover:bg-status-success/15"
                  : "border-border-default bg-surface-0 text-text-tertiary hover:bg-surface-1 hover:text-text-primary"
              )}
            >
              {isCandidate ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              Candidate
            </button>
            <Star className="w-4 h-4 cursor-pointer hover:text-status-warning transition-colors" />
            <button onClick={() => { navigator.clipboard?.writeText(matId) }} title="Copy ID">
              <Copy className="w-4 h-4 cursor-pointer hover:text-text-primary transition-colors" />
            </button>
          </div>
        </div>
        <div>
          {/* Namespace badge */}
          {selectedMaterialData.material?.namespace && (
            <span className={cn(
              'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border mb-1',
              selectedMaterialData.material.namespace === 'external_research'
                ? 'bg-status-warning/10 border-status-warning/25 text-status-warning'
                : 'bg-accent/10 border-accent/25 text-accent'
            )}>
              {selectedMaterialData.material.namespace === 'external_research' ? 'External research' : 'Materials Project snapshot'}
            </span>
          )}
          <div className="text-sm text-text-tertiary">{subtitle} - {crystalSystem}</div>
          <div className="text-xs text-text-tertiary/60 flex items-center gap-1 mt-1">
            ID: <span className="font-mono">{matId}</span>
          </div>
        </div>

        {/* Backend action buttons */}
        {(selectedMaterialData.actions || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(selectedMaterialData.actions || []).map((action: any) => (
              <button
                key={action.id}
                onClick={() => {
                  if (action.id === 'expand_neighborhood') expandNeighborhood(matId)
                  else if (action.id === 'export_subgraph') exportCandidates()
                }}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border-default bg-surface-0 text-xs text-text-tertiary hover:bg-surface-1 hover:text-text-primary transition"
              >
                {action.id === 'expand_neighborhood' ? <Network className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center px-5 border-b border-border-default">
        <Tab label="Overview" isActive />
        <Tab label="Structure" />
        <Tab label="Properties" />
        <Tab label="Relations" />
        <Tab label="Notes" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
        {/* Structure Visualization Placeholder */}
        <div className="h-48 rounded-lg bg-surface-0 border border-border-default flex items-center justify-center relative overflow-hidden">
          <div className="absolute right-4 flex flex-col gap-2">
            {legendElements.map((el: string, idx: number) => (
              <LegendItem key={idx} color={legendColors[idx] || "bg-text-quaternary"} label={el} />
            ))}
          </div>
          <div className="w-32 h-32 border border-border-default rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(91,123,247,0.08)]">
             <div className="w-16 h-16 border border-border-default rounded-lg rotate-45 flex items-center justify-center bg-surface-1">
                <div className="w-2 h-2 bg-status-success rounded-full absolute -top-1 -left-1"></div>
                <div className="w-2 h-2 bg-node-material rounded-full"></div>
             </div>
          </div>
        </div>

        {/* Primary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard title="Stability" subtitle="(formation energy)" value={stability} unit="eV/atom" statusColor="text-status-success" status={stabilityStatus} />
          <StatCard title="Band gap" subtitle="(GGA PBE)" value={bandGap} unit="eV" statusColor="text-node-element" status={bandGapStatus} />
          <StatCard title="Ground state" value={magneticState} statusColor="text-node-cluster" status={magneticStatus} />
        </div>

        {/* Properties Table & Radar */}
        <div className="rounded-lg border border-border-default bg-surface-1 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-text-primary">Properties</h3>
            <span className="text-xs text-accent cursor-pointer hover:underline">See all</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <div className="flex flex-col gap-2 text-xs">
              <PropertyRow label="Space group" value={spaceGroup} />
              <PropertyRow label="Crystal system" value={crystalSystem} />
              <PropertyRow label="Density" value={density ? `${density} g/cm^3` : "N/A"} />
              <PropertyRow label="Sites" value={nsites} />
              <PropertyRow label="Volume" value={volume ? `${volume} Ang^3` : "N/A"} />
              {bulkModulus && <PropertyRow label="Bulk Modulus" value={`${bulkModulus} GPa`} />}
            </div>
            <div className="w-24 h-24 border border-border-default rounded-full flex items-center justify-center bg-surface-3">
              <div className="text-[10px] text-text-tertiary/50 rotate-45">Radar</div>
            </div>
          </div>
        </div>

        {/* Evidence */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-text-primary">Evidence ({evidenceSections.length} sections, {recordsTotal} records)</h3>
          </div>
          <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-surface-0 mt-1">
            <div className="h-full bg-status-success w-[100%]"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tab({ label, isActive }: { label: string, isActive?: boolean }) {
  return (
    <button className={cn(
      "px-4 py-3 text-xs font-medium border-b-2 transition-colors",
      isActive ? "border-accent text-accent" : "border-transparent text-text-tertiary hover:text-text-primary"
    )}>
      {label}
    </button>
  )
}

function LegendItem({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2 h-2 rounded-full", color)}></div>
      <span className="text-[10px] text-text-secondary">{label}</span>
    </div>
  )
}

function StatCard({ title, subtitle, value, unit, status, statusColor, extra }: any) {
  return (
    <div className="flex flex-col gap-1 border border-border-default bg-surface-1 rounded-lg p-3">
      <div className="text-[10px] text-text-tertiary leading-tight">
        {title} <br/> {subtitle}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("text-lg font-medium leading-tight", statusColor || "text-text-primary")}>{value}</span>
        {unit && value !== "N/A" && <span className="text-[10px] text-text-tertiary">{unit}</span>}
      </div>
      {status && <div className={cn("text-[10px] mt-1 font-medium", statusColor)}>{status}</div>}
      {extra && <div className="text-[10px] mt-1 text-text-tertiary/60">{extra}</div>}
    </div>
  )
}

function PropertyRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  )
}
