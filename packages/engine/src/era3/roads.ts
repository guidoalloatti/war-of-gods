import type { Hex, HexCoord } from '../types/era3.js';
import { DIRECTIONS, distance, hexAdd, hexKey } from './hex.js';

/**
 * Paint a road path from each capital outward to the map edge. The path
 * picks among the 2-3 neighbors that strictly increase distance from the
 * citadel (0,0), with an RNG-weighted choice for variety.
 *
 * Never overwrites capitals, citadel, or spawn zones. Safe to call once per
 * capital; multiple capitals may share segments (idempotent — hexes already
 * at 'road' stay 'road').
 */
export function paintRoadsForCapitals(
  hexes: Record<string, Hex>,
  capitals: HexCoord[],
  mapRadius: number,
  rng: () => number,
): void {
  for (const capital of capitals) {
    paintSingleRoad(hexes, capital, mapRadius, rng);
  }
}

function paintSingleRoad(
  hexes: Record<string, Hex>,
  start: HexCoord,
  mapRadius: number,
  rng: () => number,
): void {
  const MAX_STEPS = mapRadius * 3; // safety cap against pathological loops
  let current: HexCoord = start;
  let currentDist = distance(current, { q: 0, r: 0 });

  for (let step = 0; step < MAX_STEPS; step++) {
    // Find neighbors that are in-bounds AND strictly farther from citadel.
    // Skip lakes so roads don't cross water (they will detour around).
    const candidates: HexCoord[] = [];
    for (const dir of DIRECTIONS) {
      const next = hexAdd(current, dir);
      if (distance(next, { q: 0, r: 0 }) > mapRadius) continue; // out of bounds
      if (distance(next, { q: 0, r: 0 }) <= currentDist) continue; // not outward
      const nextHex = hexes[hexKey(next)];
      if (nextHex?.terrain === 'lake') continue;
      candidates.push(next);
    }

    // Fallback: if every outward step leads into a lake, allow any in-bounds
    // outward neighbor (water ford) so the road can still progress.
    if (candidates.length === 0) {
      for (const dir of DIRECTIONS) {
        const next = hexAdd(current, dir);
        if (distance(next, { q: 0, r: 0 }) > mapRadius) continue;
        if (distance(next, { q: 0, r: 0 }) <= currentDist) continue;
        candidates.push(next);
      }
    }

    if (candidates.length === 0) break; // reached the edge
    const picked = candidates[Math.floor(rng() * candidates.length)];

    const key = hexKey(picked);
    const hex = hexes[key];
    if (!hex) break;

    // Don't overwrite special tiles; the road simply passes through as plain.
    if (!hex.isCapital && !hex.isSpawnZone && hex.terrain !== 'citadel') {
      hexes[key] = { ...hex, terrain: 'road' };
    }

    current = picked;
    currentDist = distance(current, { q: 0, r: 0 });

    // Stop if we've reached the edge ring.
    if (currentDist >= mapRadius) break;
  }
}
