// ── InspectorSheet: right sheet, bridge-driven, no fake data ─────────────────
import { X, Plus, Check, Network, Download, Copy, Bot, Atom, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCatalystWorkspace, useCatalystCandidates, useCatalystLayout, useCatalystGraph, useCommandExecutor } from '@/catalyst/bridge/hooks'
import type { MetricVM, EvidenceItemVM, GraphNodeDetail } from '@/catalyst/bridge/viewModels'

export function InspectorSheet() {
  const { workspace, isLoading: wsLoading, error: wsError, nodeDetail, nodeDetailLoading, nodeDetailError } = useCatalystWorkspace()
  const { candidates, addCandidate, removeCandidate } = useCatalystCandidates()
  const { activeSheet, closeSheet } = useCatalystLayout()
  const { selectedNodeId } = useCatalystGraph()
  const execute = useCommandExecutor()

  const isOpen = activeSheet === 'inspector' && !!selectedNodeId

  if (!isOpen) return null

  if ((wsLoading || nodeDetailLoading) && !workspace && !nodeDetail) {
    return <SheetShell onClose={closeSheet}><LoadingState /></SheetShell>
  }

  if (nodeDetailError && !nodeDetail) {
    return (
      <SheetShell onClose={closeSheet}>
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
          {nodeDetailError}
        </div>
      </SheetShell>
    )
  }

  if (!workspace && !nodeDetail) {
      if (wsError) {
        return (
          <SheetShell onClose={closeSheet}>
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
              {wsError}
            </div>
          </SheetShell>
        )
      }
      return null
  }

  // --- Render Material via Workspace ---
  if (workspace) {
    const isCandidate = candidates.some((c) => c.material_id === workspace.resolvedMaterialId)
    return (
      <SheetShell onClose={closeSheet}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="p-5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight truncate" style={{ color: 'var(--text-1)' }}>
                {workspace.title}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
                {workspace.subtitle}
                {workspace.structure.crystalSystem && ` · ${workspace.structure.crystalSystem}`}
              </p>
              <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>
                {workspace.resolvedMaterialId}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigator.clipboard?.writeText(workspace.resolvedMaterialId)}
                title="Copy ID"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
                style={{ color: 'var(--text-3)' }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  isCandidate
                    ? removeCandidate(workspace.resolvedMaterialId)
                    : addCandidate(workspace)
                }
                className={cn(
                  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs transition active:scale-95',
                  isCandidate
                    ? 'border-[var(--success)] bg-[rgba(122,203,143,0.08)] text-[var(--success)]'
                    : 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                )}
              >
                {isCandidate ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {isCandidate ? 'Added' : 'Candidate'}
              </button>
            </div>
          </div>

          {/* Namespace + status badges */}
          {workspace.statusBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {workspace.statusBadges.map((b, i) => (
                <span key={i} className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border"
                  style={badgeStyle(b.variant)}>
                  {b.label}
                </span>
              ))}
              {workspace.isFallback && (
                <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-4)' }}>
                  Limited data
                </span>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <ActionBtn icon={<Network className="w-3 h-3" />} label="Expand graph"
              onClick={() => execute({ type: 'expand_neighborhood', materialId: workspace.resolvedMaterialId })} />
            <ActionBtn icon={<Download className="w-3 h-3" />} label="Export"
              onClick={() => execute({ type: 'export_subgraph', materialIds: [workspace.resolvedMaterialId] })} />
            <ActionBtn icon={<Bot className="w-3 h-3" />} label="Ask agent"
              onClick={() => execute({ type: 'ask_agent', message: `Tell me about ${workspace.title}` }, workspace)} />
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col gap-5">

          {/* Key metrics */}
          {workspace.metrics.length > 0 && (
            <Section title="Key metrics">
              <div className="grid grid-cols-2 gap-2">
                {workspace.metrics.map((m, i) => <MetricCard key={i} metric={m} />)}
              </div>
            </Section>
          )}

          <MaterialProfile detail={nodeDetail} workspaceMetrics={workspace.metrics} />

          {/* Structure */}
          <Section title="Structure">
            <div className="flex flex-col gap-1.5 text-xs">
              <PropRow label="Space group" value={workspace.structure.spaceGroupSymbol || workspace.structure.spaceGroupNumber?.toString() || '—'} mono />
              <PropRow label="Crystal system" value={workspace.structure.crystalSystem || '—'} />
              <PropRow label="Sites" value={workspace.structure.nsites?.toString() || '—'} />
              <PropRow label="Volume" value={workspace.structure.volume !== undefined ? `${Number(workspace.structure.volume).toFixed(2)} Å³` : '—'} mono />
              <PropRow label="Density" value={workspace.structure.density !== undefined ? `${Number(workspace.structure.density).toFixed(3)} g/cm³` : '—'} mono />
            </div>
          </Section>

          {/* Evidence */}
          <Section title={`Evidence (${workspace.evidence.totalSections} sections, ${workspace.evidence.totalRecords} records)`}>
            {workspace.evidence.sections.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>No evidence data available.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {workspace.evidence.sections.map((s, i) => <EvidenceRow key={i} item={s} />)}
              </div>
            )}
          </Section>

          {/* Graph context */}
          <Section title="Graph context">
            <div className="flex flex-col gap-1.5 text-xs">
              <PropRow label="Relations" value={workspace.relationCount.toString()} />
              {workspace.elements.length > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Elements</span>
                  <span className="flex gap-1 flex-wrap justify-end">
                    {workspace.elements.map((el) => (
                      <span key={el} className="font-mono px-1.5 py-0.5 rounded text-[10px]"
                        style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>{el}</span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </Section>
        </div>
      </SheetShell>
    )
  }

  // --- Render Generic Node Detail ---
  if (nodeDetail) {
    return (
      <SheetShell onClose={closeSheet}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="p-5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight truncate" style={{ color: 'var(--text-1)' }}>
                {nodeDetail.title || nodeDetail.label}
              </h2>
              {nodeDetail.subtitle && (
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {nodeDetail.subtitle}
                </p>
              )}
              <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>
                {nodeDetail.id}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigator.clipboard?.writeText(nodeDetail.id)}
                title="Copy ID"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
                style={{ color: 'var(--text-3)' }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border"
                style={badgeStyle('info')}>
                {nodeDetail.type}
              </span>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <ActionBtn icon={<Network className="w-3 h-3" />} label="Expand graph"
              onClick={() => execute({ type: 'expand_neighborhood', materialId: nodeDetail.id })} />
            <ActionBtn icon={<Bot className="w-3 h-3" />} label="Ask agent"
              onClick={() => execute({ type: 'ask_agent', message: `Tell me about ${nodeDetail.title || nodeDetail.label}` })} />
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col gap-5">
          {/* Summary */}
          {Object.keys(nodeDetail.summary || {}).length > 0 && (
            <Section title="Summary">
              <div className="flex flex-col gap-1.5 text-xs">
                {Object.entries(nodeDetail.summary).map(([k, v]) => (
                  <PropRow key={k} label={k} value={String(v)} />
                ))}
              </div>
            </Section>
          )}
          
          {/* Metrics */}
          {nodeDetail.metrics && Object.keys(nodeDetail.metrics).length > 0 && (
            <Section title="Metrics">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(nodeDetail.metrics).map(([k, v]) => (
                  <StatCard key={k} label={k} value={v} />
                ))}
              </div>
            </Section>
          )}

          <NodeProfile detail={nodeDetail} />

          {/* Elements */}
          {nodeDetail.elements && nodeDetail.elements.length > 0 && (
            <Section title="Elements">
              <CompositionBars elements={nodeDetail.elements} />
            </Section>
          )}
          
          {/* Examples */}
          {nodeDetail.examples && nodeDetail.examples.length > 0 && (
            <Section title="Examples">
              <div className="flex flex-col gap-1">
                {nodeDetail.examples.map((ex, i) => (
                  <ExampleRow key={i} example={ex} onOpen={(id) => execute({ type: 'open_material', materialId: id })} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </SheetShell>
    )
  }

  return null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SheetShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute top-0 bottom-0 right-0 z-30 flex flex-col animate-slide-right shadow-2xl"
      style={{ width: 380, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>
      <button onClick={onClose}
        className="absolute top-4 left-4 w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
        style={{ color: 'var(--text-3)' }}>
        <X className="w-4 h-4" />
      </button>
      {children}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col gap-4 p-5 pt-12">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--surface-3)', width: `${70 + i * 5}%` }} />
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>{title}</h3>
      {children}
    </div>
  )
}

function MetricCard({ metric }: { metric: MetricVM }) {
  const val = metric.value !== null ? String(metric.value) : null
  if (!val) return null

  return (
    <div className="p-2.5 rounded-lg border flex flex-col gap-1"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{metric.label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-medium" style={{ color: statusColor(metric.statusVariant) }}>
          {val}
        </span>
        {metric.unit && <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>{metric.unit}</span>}
      </div>
      {metric.status && (
        <span className="text-[10px] font-medium" style={{ color: statusColor(metric.statusVariant) }}>
          {metric.status}
        </span>
      )}
    </div>
  )
}

function PropRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span className={cn(mono && 'font-mono', 'text-right truncate max-w-[55%]')} style={{ color: 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

function EvidenceRow({ item }: { item: EvidenceItemVM }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg text-xs border"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="min-w-0">
        <span className="truncate block" style={{ color: 'var(--text-2)' }}>{item.sectionName}</span>
        {item.source && <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>{item.source}</span>}
      </div>
      <span className="font-mono text-[11px] flex-shrink-0 ml-2" style={{ color: 'var(--text-3)' }}>
        {item.records} rec
      </span>
    </div>
  )
}

function MaterialProfile({ detail, workspaceMetrics }: { detail: GraphNodeDetail | null; workspaceMetrics: MetricVM[] }) {
  const summary = detail?.summary || {}
  const metrics = detail?.metrics || {}
  const metricByLabel = new Map(workspaceMetrics.map((metric) => [metric.label.toLowerCase(), metric]))
  const hull = asNumber(summary.energy_above_hull ?? metricByLabel.get('hull energy')?.value)
  const formation = asNumber(summary.formation_energy_per_atom ?? metricByLabel.get('formation energy')?.value)
  const bandGap = asNumber(summary.band_gap ?? metricByLabel.get('band gap')?.value)
  const density = asNumber(summary.density ?? metricByLabel.get('density')?.value)
  const relationCount = asNumber(metrics.relation_count)
  const evidenceRecords = asNumber(metrics.evidence_records)

  if ([hull, formation, bandGap, density, relationCount, evidenceRecords].every((v) => v === null) && !detail?.elements?.length) {
    return null
  }

  return (
    <Section title="Property profile">
      <div className="rounded-lg border p-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          <BarChart3 className="h-3.5 w-3.5" />
          Snapshot statistics
        </div>
        <div className="space-y-2.5">
          <ScalarBar label="Hull energy" value={hull} max={0.25} unit="eV/atom" invert />
          <ScalarBar label="Formation energy" value={formation === null ? null : Math.abs(formation)} max={5} unit="eV/atom" />
          <ScalarBar label="Band gap" value={bandGap} max={6} unit="eV" />
          <ScalarBar label="Density" value={density} max={14} unit="g/cm3" />
          <ScalarBar label="Graph relations" value={relationCount} max={80} unit="links" />
          <ScalarBar label="Evidence records" value={evidenceRecords} max={30} unit="records" />
        </div>
        {detail?.elements && detail.elements.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              <Atom className="h-3.5 w-3.5" />
              Composition
            </div>
            <CompositionBars elements={detail.elements} />
          </div>
        )}
      </div>
    </Section>
  )
}

function NodeProfile({ detail }: { detail: GraphNodeDetail }) {
  if (detail.type === 'cluster') return <ClusterProfile detail={detail} />
  if (detail.type === 'element') return <ElementProfile detail={detail} />
  if (detail.type === 'material') return <MaterialProfile detail={detail} workspaceMetrics={[]} />
  return null
}

function ClusterProfile({ detail }: { detail: GraphNodeDetail }) {
  const summary = detail.summary || {}
  const metrics = detail.metrics || {}
  const total = asNumber(summary.material_count)
  const stable = asNumber(summary.stable_count)
  const metal = asNumber(summary.metal_count)
  const stabilityRatio = asNumber(metrics.stability_ratio)
  const metalRatio = asNumber(metrics.metal_ratio)

  return (
    <Section title="Cluster statistics">
      <div className="space-y-3 rounded-lg border p-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Materials" value={total} />
          <StatCard label="Stable" value={stable} />
          <StatCard label="Metals" value={metal} />
        </div>
        <ScalarBar label="Stable share" value={stabilityRatio === null ? null : stabilityRatio * 100} max={100} unit="%" />
        <ScalarBar label="Metal share" value={metalRatio === null ? null : metalRatio * 100} max={100} unit="%" />
        <ScalarBar label="Avg band gap" value={asNumber(summary.avg_band_gap)} max={6} unit="eV" />
        <ScalarBar label="Avg hull energy" value={asNumber(summary.avg_energy_above_hull)} max={0.25} unit="eV/atom" invert />
        <TokenList items={toList(summary.dominant_elements)} />
      </div>
    </Section>
  )
}

function ElementProfile({ detail }: { detail: GraphNodeDetail }) {
  const summary = detail.summary || {}
  const metrics = detail.metrics || {}
  return (
    <Section title="Element statistics">
      <div className="space-y-3 rounded-lg border p-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Atomic no." value={summary.atomic_number} />
          <StatCard label="Group" value={summary.group} />
          <StatCard label="Period" value={summary.period} />
        </div>
        <ScalarBar label="Material coverage" value={asNumber(metrics.material_count)} max={10000} unit="materials" />
        <ScalarBar label="Avg atomic fraction" value={fractionToPercent(metrics.avg_atomic_fraction)} max={100} unit="%" />
        <ScalarBar label="Max atomic fraction" value={fractionToPercent(metrics.max_atomic_fraction)} max={100} unit="%" />
        <PropRow label="Block" value={formatValue(summary.block)} />
        <PropRow label="Electronegativity" value={formatValue(summary.electronegativity)} mono />
      </div>
    </Section>
  )
}

function CompositionBars({ elements }: { elements: unknown[] }) {
  const rows = elements.map((item) => {
    if (typeof item === 'string') return { label: item, value: null as number | null, meta: '' }
    const row = item as Record<string, unknown>
    return {
      label: String(row.element_symbol || row.symbol || row.label || '?'),
      value: fractionToPercent(row.atomic_fraction ?? row.normalized_fraction),
      meta: row.oxidation_state !== undefined && row.oxidation_state !== null ? `ox ${row.oxidation_state}` : '',
    }
  })

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono" style={{ color: 'var(--text-2)' }}>{row.label}</span>
            <span style={{ color: 'var(--text-4)' }}>{row.value === null ? row.meta : `${row.value.toFixed(1)}% ${row.meta}`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${row.value ?? 100}%`, background: 'var(--accent)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ScalarBar({ label, value, max, unit, invert }: { label: string; value: number | null; max: number; unit: string; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null
  const pct = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100))
  const color = invert ? qualityColor(100 - pct) : qualityColor(pct)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'var(--text-3)' }}>{label}</span>
        <span className="font-mono" style={{ color: 'var(--text-1)' }}>{formatNumber(value)} {unit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border p-2" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="text-[10px]" style={{ color: 'var(--text-4)' }}>{titleize(label)}</div>
      <div className="mt-1 truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>{formatValue(value)}</div>
    </div>
  )
}

function TokenList({ items }: { items: unknown[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
          {String(item)}
        </span>
      ))}
    </div>
  )
}

function ExampleRow({ example, onOpen }: { example: unknown; onOpen: (materialId: string) => void }) {
  const row = typeof example === 'object' && example !== null ? example as Record<string, unknown> : { label: example }
  const materialId = typeof row.material_id === 'string' ? row.material_id : null
  const chemsys = row.chemsys === undefined || row.chemsys === null ? null : String(row.chemsys)
  return (
    <button
      disabled={!materialId}
      onClick={() => materialId && onOpen(materialId)}
      className="w-full rounded-lg border px-2 py-1.5 text-left text-xs transition enabled:hover:bg-[var(--surface-3)] disabled:cursor-default"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono">{String(row.formula_pretty || row.label || row.material_id || example)}</span>
        {row.atomic_fraction !== undefined && (
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-4)' }}>{formatNumber(fractionToPercent(row.atomic_fraction))}%</span>
        )}
      </div>
      {chemsys && <div className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--text-4)' }}>{chemsys}</div>}
    </button>
  )
}

function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs transition hover:bg-[var(--surface-3)] active:scale-95"
      style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
      {icon}{label}
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function badgeStyle(variant: string) {
  switch (variant) {
    case 'success': return { borderColor: 'rgba(122,203,143,0.3)', color: 'var(--success)', background: 'rgba(122,203,143,0.08)' }
    case 'warning': return { borderColor: 'rgba(240,195,106,0.3)', color: 'var(--warning)', background: 'rgba(240,195,106,0.08)' }
    case 'danger':  return { borderColor: 'rgba(238,123,123,0.3)', color: 'var(--danger)',  background: 'rgba(238,123,123,0.08)' }
    case 'info':    return { borderColor: 'rgba(143,188,255,0.3)', color: 'var(--accent)',  background: 'var(--accent-muted)' }
    default:        return { borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface-3)' }
  }
}

function statusColor(v?: string) {
  switch (v) {
    case 'success': return 'var(--success)'
    case 'warning': return 'var(--warning)'
    case 'danger':  return 'var(--danger)'
    case 'info':    return 'var(--accent)'
    default:        return 'var(--text-1)'
  }
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function fractionToPercent(value: unknown): number | null {
  const n = asNumber(value)
  if (n === null) return null
  return n <= 1 ? n * 100 : n
}

function formatNumber(value: unknown): string {
  const n = asNumber(value)
  if (n === null) return formatValue(value)
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(n) >= 10) return n.toFixed(1)
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function titleize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function qualityColor(score: number) {
  if (score >= 70) return 'var(--success)'
  if (score >= 40) return 'var(--warning)'
  return 'var(--danger)'
}

function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}
