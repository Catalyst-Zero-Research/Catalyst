import type { Structure3DVM } from '@/catalyst/bridge/viewModels';

type StructureMetricsProps = {
  structure: Structure3DVM | null;
};

export function StructureMetrics({ structure }: StructureMetricsProps) {
  if (!structure) return null;
  const symmetry = structure.symmetry || {};
  return (
    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
      <Metric label="Sites" value={String(structure.nsites ?? structure.sites.length ?? 0)} />
      <Metric label="Density" value={formatNumber(structure.density, 'g/cm3')} />
      <Metric label="Volume" value={formatNumber(structure.volume, 'A3')} />
      <Metric
        label="Space Group"
        value={String((symmetry as Record<string, unknown>).symbol || (symmetry as Record<string, unknown>).number || '-')}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div style={{ color: 'var(--text-4)' }}>{label}</div>
      <div className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>
        {value}
      </div>
    </div>
  );
}

function formatNumber(value: unknown, unit: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const rendered = n >= 10 ? n.toFixed(2) : n.toFixed(3);
  return `${rendered} ${unit}`;
}
