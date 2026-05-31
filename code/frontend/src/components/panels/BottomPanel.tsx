// @ts-nocheck
import { ChevronDown, MoreVertical } from "lucide-react"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"

export function BottomPanel() {
  const selectedMaterialData = useStore((state) => state.selectedMaterialData)
  const selectedEdgeData = useStore((state) => state.selectedEdgeData)
  const expandNeighborhood = useStore((state) => state.expandNeighborhood)
  const selectedNodeId = useStore((state) => state.selectedNodeId)

  // Only show if there's either material data (for evidence) or edge data (for relation details)
  if (!selectedMaterialData && !selectedEdgeData) return null;
  const relation = selectedEdgeData ? normalizeEdge(selectedEdgeData) : null;

  return (
    <div className="absolute bottom-6 left-16 right-[424px] hidden gap-4 pointer-events-none z-10 xl:flex">
      {/* Evidence & Provenance */}
      {selectedMaterialData && selectedMaterialData.evidence?.sections && selectedMaterialData.evidence.sections.length > 0 && (
        <div className="flex-1 bg-surface-2/95 backdrop-blur-xl border border-border-default rounded-xl pointer-events-auto flex flex-col overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] h-[230px]">
          <div className="px-4 py-3 border-b border-border-default flex justify-between items-center">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Evidence & provenance</h3>
              <p className="mt-0.5 text-[10px] text-text-tertiary">Indexed source sections for the selected material</p>
            </div>
            <div className="flex gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1 cursor-pointer hover:text-text-primary">Group by: Source <ChevronDown className="w-3 h-3"/></span>
              <span className="flex items-center gap-1 cursor-pointer hover:text-text-primary">Sort: Relevance <ChevronDown className="w-3 h-3"/></span>
            </div>
          </div>
          
          <div className="flex-1 p-4 flex gap-3 overflow-x-auto custom-scrollbar">
            {selectedMaterialData.evidence.sections.map((section: any, i: number) => (
              <EvidenceCard 
                key={i}
                source={section.source || "Unknown"} 
                id={section.name || "N/A"} 
                method={section.file || "N/A"} 
                details={[`Records: ${section.records || 0}`]} 
                date={""} 
                status={"Info"} 
                statusColor="text-accent border-accent/20 bg-accent/5" 
              />
            ))}
          </div>
        </div>
      )}

      {/* Relation Details */}
      {relation && (
        <div className="w-[370px] bg-surface-2/95 backdrop-blur-xl border border-border-default rounded-xl pointer-events-auto flex flex-col overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] h-[230px]">
          <div className="px-4 py-3 border-b border-border-default flex justify-between">
            <h3 className="text-sm font-medium text-text-primary">Relation details</h3>
            <span className="font-mono text-[10px] text-text-tertiary">{relation.recipe}</span>
          </div>
          <div className="p-4 flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
            <div className="text-sm flex items-center gap-2 min-w-0">
              <span className="text-accent font-medium truncate">{relation.source}</span>
              <span className="text-text-tertiary">- [{relation.type}] -</span>
              <span className="text-accent font-medium truncate">{relation.target}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Weight" value={relation.weight} />
              <Metric label="Confidence" value={relation.confidence} />
            </div>
            {relation.reason && (
              <div className="rounded-md border border-border-default bg-surface-1 p-3 text-xs leading-relaxed text-text-tertiary">
                <span className="text-text-secondary font-medium">Reason:</span> {relation.reason}
              </div>
            )}
            {relation.deltas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {relation.deltas.map((item: string) => (
                  <span key={item} className="rounded border border-border-default bg-surface-0 px-2 py-1 font-mono text-[10px] text-text-secondary">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          {selectedNodeId && (
            <div className="p-3 border-t border-border-default flex justify-center">
              <button 
                className="text-xs text-accent hover:text-accent/80 transition-colors active:scale-[0.98]"
                onClick={() => expandNeighborhood(selectedNodeId)}
              >
                Expand neighborhood
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EvidenceCard({ source, id, method, details, date, status, statusColor }: any) {
  return (
    <div className="min-w-[205px] border border-border-default rounded-lg bg-surface-1 p-3 flex flex-col gap-3 relative group transition hover:border-border-default/80 hover:bg-surface-3">
      <MoreVertical className="w-3 h-3 text-text-tertiary absolute top-3 right-2 opacity-0 group-hover:opacity-100 cursor-pointer" />
      <div>
        <div className="text-xs text-accent font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-accent flex items-center justify-center"><div className="w-1 h-1 bg-accent rounded-full"></div></span>
          {source}
        </div>
        <div className="text-[10px] text-text-tertiary mt-1 flex justify-between items-center pr-2">
          {id} <span className="px-1 py-0.5 bg-surface-0 border border-border-default rounded text-[9px]">{method}</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-0.5 text-[10px] text-text-tertiary">
        {details.map((d: string, i: number) => <div key={i}>{d}</div>)}
      </div>
      <div className="flex justify-between items-end mt-2">
        <div className="text-[9px] text-text-tertiary/60">{date && `Added ${date}`}</div>
        <div className={cn("text-[9px] px-1.5 py-0.5 rounded border", statusColor)}>{status}</div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value?: number | string }) {
  const display = typeof value === "number" ? value.toFixed(3) : value || "N/A";
  return (
    <div className="rounded-md border border-border-default bg-surface-1 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-sm text-text-primary font-medium">{display}</div>
    </div>
  );
}

function normalizeEdge(edge: any) {
  let parsed: Record<string, unknown> = {};
  if (edge.feature_deltas_json) {
    try {
      parsed = JSON.parse(edge.feature_deltas_json);
    } catch {
      parsed = {};
    }
  }
  return {
    source: edge.source_id || "source",
    target: edge.target_id || "target",
    type: edge.edge_type || edge.type || "relation",
    recipe: edge.recipe_name || "recipe",
    weight: edge.weight,
    confidence: edge.confidence,
    reason: edge.reason_summary,
    deltas: Object.entries(parsed).slice(0, 6).map(([key, value]) => `${key}: ${String(value)}`),
  };
}
