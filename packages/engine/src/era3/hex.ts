import type { HexCoord } from '../types/era3.js';

/**
 * Axial hex grid primitives. Reference: https://www.redblobgames.com/grids/hexagons/
 *
 * Directions are fixed in this order; DO NOT reorder — map-gen and tests rely
 * on the specific index mapping (DIRECTIONS[0] == east, etc.).
 */
export const DIRECTIONS: readonly HexCoord[] = [
  { q: +1, r: 0 },
  { q: +1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: +1 },
  { q: 0, r: +1 },
];

export function hexKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    throw new Error(`Invalid hex key: ${key}`);
  }
  return { q, r };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexSub(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexScale(a: HexCoord, k: number): HexCoord {
  return { q: a.q * k, r: a.r * k };
}

/** Cube distance in axial coords. */
export function distance(a: HexCoord, b: HexCoord): number {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2;
}

export function neighbors(c: HexCoord): HexCoord[] {
  return DIRECTIONS.map(d => hexAdd(c, d));
}

/** Ring of hexes at exact distance `radius` from origin. radius=0 returns [origin]. */
export function ring(radius: number): HexCoord[] {
  if (radius < 0) throw new Error(`Ring radius must be >= 0, got ${radius}`);
  if (radius === 0) return [{ q: 0, r: 0 }];

  const result: HexCoord[] = [];
  // Start at the west corner: radius steps in direction 4 (-1, +1).
  let current: HexCoord = hexScale(DIRECTIONS[4], radius);
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      result.push(current);
      current = hexAdd(current, DIRECTIONS[side]);
    }
  }
  return result;
}

/** All hexes within `radius` of origin (inclusive). */
export function disk(radius: number): HexCoord[] {
  if (radius < 0) throw new Error(`Disk radius must be >= 0, got ${radius}`);
  const result: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      result.push({ q, r });
    }
  }
  return result;
}

/** Rounded hex at `fraction` of the way from `a` to `b` (0..1). */
export function hexLerp(a: HexCoord, b: HexCoord, t: number): HexCoord {
  const qF = a.q + (b.q - a.q) * t;
  const rF = a.r + (b.r - a.r) * t;
  return hexRound({ q: qF, r: rF });
}

/** Round fractional axial coords to the nearest hex using cube rounding. */
export function hexRound(c: { q: number; r: number }): HexCoord {
  const x = c.q;
  const z = c.r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

/** Line from a to b inclusive, using cube-lerp + rounding. */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = distance(a, b);
  if (n === 0) return [a];
  const result: HexCoord[] = [];
  for (let i = 0; i <= n; i++) {
    result.push(hexLerp(a, b, i / n));
  }
  return result;
}
