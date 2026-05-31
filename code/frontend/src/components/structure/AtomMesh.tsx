import { Sphere } from '@react-three/drei';
import { elementColor } from './elementColors';
import type { ParsedSite } from './structureMath';

type AtomMeshProps = {
  site: ParsedSite;
  scale?: number;
};

export function AtomMesh({ site, scale = 0.36 }: AtomMeshProps) {
  return (
    <Sphere args={[Math.max(0.08, site.radius * scale), 28, 28]} position={site.position}>
      <meshStandardMaterial color={elementColor(site.element)} metalness={0.15} roughness={0.4} />
    </Sphere>
  );
}
