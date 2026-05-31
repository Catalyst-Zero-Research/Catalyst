import { Box, Compass, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Structure3DVM } from '@/catalyst/bridge/viewModels';
import { CrystalStructureViewer } from './CrystalStructureViewer';
import { ElementLegend } from './ElementLegend';
import { StructureMetrics } from './StructureMetrics';
import { StructureToolbar } from './StructureToolbar';

type CrystalStructurePanelProps = {
  structure: Structure3DVM | null;
  isLoading?: boolean;
  error?: string | null;
};

export function CrystalStructurePanel({ structure, isLoading = false, error = null }: CrystalStructurePanelProps) {
  const [showBonds, setShowBonds] = useState(true);
  const [showUnitCell, setShowUnitCell] = useState(true);
  const [atomScale, setAtomScale] = useState(0.36);
  const [resetNonce, setResetNonce] = useState(0);
  const hasStructureSites = Boolean(structure?.sites?.length);

  const elements = useMemo(() => {
    const unique = new Set<string>();
    for (const site of structure?.sites || []) {
      const symbol = String(site.element || site.label || '').trim();
      if (symbol) unique.add(symbol);
      if (unique.size >= 18) break;
    }
    return Array.from(unique);
  }, [structure]);

  return (
    <div className="flex h-full min-h-[430px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StructureToolbar
          showBonds={showBonds}
          showUnitCell={showUnitCell}
          atomScale={atomScale}
          onShowBondsChange={setShowBonds}
          onShowUnitCellChange={setShowUnitCell}
          onAtomScaleChange={setAtomScale}
          onResetView={() => setResetNonce((v) => v + 1)}
        />
        <ElementLegend elements={elements} />
      </div>

      <StructureMetrics structure={structure} />

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' }}
      >
        <div className="absolute right-4 top-4 z-10 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-2)' }}>
          <div className="mb-1 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
            Axes
          </div>
          <div className="grid grid-cols-3 gap-1 font-mono">
            <span style={{ color: 'var(--cat-chart-red)' }}>a</span>
            <span style={{ color: 'var(--cat-chart-green)' }}>b</span>
            <span style={{ color: 'var(--cat-chart-blue)' }}>c</span>
          </div>
        </div>
        {isLoading ? (
          <StructureState icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Loading structure" text="Resolving local crystal sites and lattice vectors." />
        ) : error ? (
          <StructureState danger icon={<Box className="h-5 w-5" />} title="Structure unavailable" text={error} />
        ) : !hasStructureSites ? (
          <StructureState icon={<Box className="h-5 w-5" />} title="Structure unavailable" text={structure?.message || 'Full 3D structure record is not present in the local snapshot for this material.'} />
        ) : (
          <CrystalStructureViewer
            structure={structure}
            showBonds={showBonds}
            showUnitCell={showUnitCell}
            atomScale={atomScale}
            resetNonce={resetNonce}
          />
        )}
      </div>
    </div>
  );
}

function StructureState({
  icon,
  title,
  text,
  danger = false,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  danger?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[380px] items-center justify-center text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: danger ? 'rgba(220,38,38,0.12)' : 'var(--accent-muted)', color: danger ? 'var(--danger)' : 'var(--accent)' }}>
          {icon}
        </div>
        <div className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>{title}</div>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{text}</p>
      </div>
    </div>
  );
}
