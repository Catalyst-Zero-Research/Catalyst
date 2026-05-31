import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Structure3DVM } from '@/catalyst/bridge/viewModels';
import { AtomMesh } from './AtomMesh';
import { BondCylinder } from './BondCylinder';
import { UnitCell } from './UnitCell';
import { computeBondSegments, parseStructure } from './structureMath';

type CrystalStructureViewerProps = {
  structure: Structure3DVM | null;
  showBonds: boolean;
  showUnitCell: boolean;
  atomScale: number;
  resetNonce: number;
};

export function CrystalStructureViewer({
  structure,
  showBonds,
  showUnitCell,
  atomScale,
  resetNonce,
}: CrystalStructureViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const parsed = useMemo(() => parseStructure(structure), [structure]);
  const bonds = useMemo(() => (showBonds ? computeBondSegments(parsed.sites) : []), [parsed.sites, showBonds]);

  const extent = useMemo(() => {
    const values = parsed.sites.flatMap((site) => site.position.map((v) => Math.abs(v)));
    return values.length ? Math.max(...values) : 1;
  }, [parsed.sites]);
  const fitScale = extent > 0 ? Math.min(2.3, Math.max(0.18, 8 / extent)) : 1;

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.reset();
  }, [resetNonce]);

  if (!structure || !parsed.sites.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
        Full 3D structure record unavailable in local snapshot
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 18], fov: 44, near: 0.1, far: 2000 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.52} />
      <directionalLight position={[8, 12, 8]} intensity={0.88} />
      <directionalLight position={[-10, -8, -10]} intensity={0.35} />

      <group scale={[fitScale, fitScale, fitScale]}>
        {showUnitCell && <UnitCell vectors={parsed.latticeVectors} />}
        {bonds.map((bond, idx) => (
          <BondCylinder key={idx} bond={bond} />
        ))}
        {parsed.sites.map((site) => (
          <AtomMesh key={`${site.label}-${site.index}`} site={site} scale={atomScale} />
        ))}
      </group>

      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} makeDefault />
    </Canvas>
  );
}
