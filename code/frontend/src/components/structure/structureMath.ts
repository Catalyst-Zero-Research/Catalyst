import type { Structure3DVM } from '@/catalyst/bridge/viewModels';

export type Vec3 = [number, number, number];

const DEFAULT_BOND_MAX = 3.1;

const COVALENT_RADII: Record<string, number> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  P: 1.07,
  S: 1.05,
  Cl: 1.02,
  Si: 1.11,
  Ti: 1.6,
  V: 1.53,
  Cr: 1.39,
  Mn: 1.39,
  Fe: 1.32,
  Co: 1.26,
  Ni: 1.24,
  Cu: 1.32,
  Zn: 1.22,
  Ga: 1.22,
  Ge: 1.2,
  As: 1.19,
  Se: 1.2,
  Zr: 1.75,
  Nb: 1.64,
  Mo: 1.54,
  W: 1.62,
};

export type ParsedSite = {
  index: number;
  label: string;
  element: string;
  position: Vec3;
  radius: number;
};

export type ParsedStructure = {
  sites: ParsedSite[];
  center: Vec3;
  latticeVectors: Vec3[];
};

export type BondSegment = {
  a: Vec3;
  b: Vec3;
};

export function parseLatticeVectors(structure?: Structure3DVM | null): Vec3[] {
  const matrix = (structure?.lattice as Record<string, unknown> | undefined)?.matrix;
  if (Array.isArray(matrix) && matrix.length === 3) {
    const vectors: Vec3[] = [];
    for (const row of matrix) {
      if (!Array.isArray(row) || row.length < 3) return [];
      vectors.push([Number(row[0]) || 0, Number(row[1]) || 0, Number(row[2]) || 0]);
    }
    return vectors;
  }

  const a = Number((structure?.lattice as Record<string, unknown> | undefined)?.a || 0);
  const b = Number((structure?.lattice as Record<string, unknown> | undefined)?.b || 0);
  const c = Number((structure?.lattice as Record<string, unknown> | undefined)?.c || 0);
  if (!a || !b || !c) return [];
  return [
    [a, 0, 0],
    [0, b, 0],
    [0, 0, c],
  ];
}

function norm(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorFrom(value: unknown): Vec3 {
  if (!Array.isArray(value) || value.length < 3) return [0, 0, 0];
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
}

function fractionalToCartesian(frac: Vec3, lattice: Vec3[]): Vec3 {
  if (lattice.length !== 3) return frac;
  const [a, b, c] = lattice;
  return add(add(mul(a, frac[0]), mul(b, frac[1])), mul(c, frac[2]));
}

export function parseStructure(structure?: Structure3DVM | null): ParsedStructure {
  const latticeVectors = parseLatticeVectors(structure);
  const parsedSites: ParsedSite[] = (structure?.sites || []).map((site) => {
    const element = String(site.element || site.label || 'X');
    const xyz = vectorFrom(site.xyz);
    const abc = vectorFrom(site.abc);
    const position = norm(xyz) > 0 ? xyz : fractionalToCartesian(abc, latticeVectors);
    return {
      index: site.index,
      label: site.label,
      element,
      position,
      radius: COVALENT_RADII[element] || 1.1,
    };
  });

  let center: Vec3 = [0, 0, 0];
  if (parsedSites.length) {
    const summed = parsedSites.reduce<Vec3>((acc, site) => add(acc, site.position), [0, 0, 0]);
    center = [summed[0] / parsedSites.length, summed[1] / parsedSites.length, summed[2] / parsedSites.length];
  }

  const centeredSites = parsedSites.map((site) => ({ ...site, position: sub(site.position, center) }));
  return {
    sites: centeredSites,
    center,
    latticeVectors,
  };
}

export function computeBondSegments(sites: ParsedSite[], maxBonds = 900): BondSegment[] {
  const bonds: BondSegment[] = [];
  for (let i = 0; i < sites.length; i += 1) {
    for (let j = i + 1; j < sites.length; j += 1) {
      const a = sites[i];
      const b = sites[j];
      const dx = a.position[0] - b.position[0];
      const dy = a.position[1] - b.position[1];
      const dz = a.position[2] - b.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const cutoff = Math.min(DEFAULT_BOND_MAX, (a.radius + b.radius) * 1.23);
      if (dist > 0.15 && dist <= cutoff) {
        bonds.push({ a: a.position, b: b.position });
        if (bonds.length >= maxBonds) return bonds;
      }
    }
  }
  return bonds;
}
