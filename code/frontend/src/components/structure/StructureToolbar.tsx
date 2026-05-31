import { RotateCcw, Grid3X3, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';

type StructureToolbarProps = {
  showBonds: boolean;
  showUnitCell: boolean;
  atomScale: number;
  onShowBondsChange: (next: boolean) => void;
  onShowUnitCellChange: (next: boolean) => void;
  onAtomScaleChange: (next: number) => void;
  onResetView: () => void;
};

export function StructureToolbar({
  showBonds,
  showUnitCell,
  atomScale,
  onShowBondsChange,
  onShowUnitCellChange,
  onAtomScaleChange,
  onResetView,
}: StructureToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleButton
        active={showBonds}
        icon={<Link2 className="h-3 w-3" />}
        label="Bonds"
        onClick={() => onShowBondsChange(!showBonds)}
      />
      <ToggleButton
        active={showUnitCell}
        icon={<Grid3X3 className="h-3 w-3" />}
        label="Unit Cell"
        onClick={() => onShowUnitCellChange(!showUnitCell)}
      />
      <label className="ml-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
        Atom size
        <input
          type="range"
          min={0.22}
          max={0.62}
          step={0.02}
          value={atomScale}
          onChange={(event) => onAtomScaleChange(Number(event.target.value))}
          className="h-1 w-24 rounded-full bg-[var(--surface-3)] accent-[var(--accent)]"
        />
      </label>
      <button
        onClick={onResetView}
        className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition hover:bg-[var(--surface-2)]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>
    </div>
  );
}

function ToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-muted)' : 'var(--surface-1)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
