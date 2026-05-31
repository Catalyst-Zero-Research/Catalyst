import { Line } from '@react-three/drei';
import type { Vec3 } from './structureMath';

type UnitCellProps = {
  vectors: Vec3[];
  color?: string;
};

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function UnitCell({ vectors, color = '#8fbcff' }: UnitCellProps) {
  if (vectors.length !== 3) return null;
  const [a, b, c] = vectors;
  const shift = mul(add(add(a, b), c), 0.5);
  const o = sub([0, 0, 0], shift);
  const p100 = add(o, a);
  const p010 = add(o, b);
  const p001 = add(o, c);
  const p110 = add(p100, b);
  const p101 = add(p100, c);
  const p011 = add(p010, c);
  const p111 = add(p110, c);
  const edges: Array<[Vec3, Vec3]> = [
    [o, p100],
    [o, p010],
    [o, p001],
    [p100, p110],
    [p100, p101],
    [p010, p110],
    [p010, p011],
    [p001, p101],
    [p001, p011],
    [p110, p111],
    [p101, p111],
    [p011, p111],
  ];

  return (
    <group>
      {edges.map((edge, idx) => (
        <Line key={idx} points={edge as [number, number, number][]} color={color} lineWidth={1} transparent opacity={0.7} />
      ))}
    </group>
  );
}
