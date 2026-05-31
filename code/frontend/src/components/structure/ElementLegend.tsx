import { elementColor } from './elementColors';

type ElementLegendProps = {
  elements: string[];
};

export function ElementLegend({ elements }: ElementLegendProps) {
  if (!elements.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {elements.map((el) => (
        <span
          key={el}
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: elementColor(el) }}
          />
          <span className="font-mono">{el}</span>
        </span>
      ))}
    </div>
  );
}
