import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { BondSegment } from './structureMath';

type BondCylinderProps = {
  bond: BondSegment;
  radius?: number;
  color?: string;
};

export function BondCylinder({ bond, radius = 0.035, color = '#67768b' }: BondCylinderProps) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const a = new Vector3(...bond.a);
    const b = new Vector3(...bond.b);
    const dir = new Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    return {
      midpoint: [mid.x, mid.y, mid.z] as [number, number, number],
      length: len,
      quaternion: q,
    };
  }, [bond]);

  if (!Number.isFinite(length) || length <= 0.001) return null;

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 14]} />
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.65} />
    </mesh>
  );
}
