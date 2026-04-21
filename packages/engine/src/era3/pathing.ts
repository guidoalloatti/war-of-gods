import type { GameMap, Hex, HexCoord, HexTerrain, Stack } from '../types/era3.js';
import { hexKey, neighbors } from './hex.js';

/**
 * Movement cost to ENTER a hex of the given terrain.
 * `Infinity` means impassable (ground units). Flying units bypass this.
 *
 * Costs are scaled ×3 so roads can cost 1 (1/3 of a plain) as an integer.
 * - road: 1  - river (bridged): 1  - plain/ruins/citadel: 3  - swamp: 4
 * - forest/mountain/desert: 6  - lake: Infinity  - river (no bridge): Infinity
 */
export function getTerrainMoveCost(terrain: HexTerrain, hex?: Hex): number {
  switch (terrain) {
    case 'road': return 1;
    case 'river': return (hex?.hasBridge) ? 1 : Infinity;
    case 'plain': return 3;
    case 'hill': return 3;
    case 'ruins': return 3;
    case 'citadel': return 3;
    case 'swamp': return 4;
    case 'forest': return 6;
    case 'desert': return 6;
    case 'mountain': return 6;
    case 'lake': return Infinity;
  }
}

/**
 * Can the given player's stack enter `hex`? Checks impassability including
 * whether a river hex has a bridge.
 */
export function canEnterHex(
  hex: Hex,
  stacks: Record<string, Stack>,
  movingStackId: string,
  flying = false,
): boolean {
  if (!flying && getTerrainMoveCost(hex.terrain, hex) === Infinity) return false;
  if (!hex.stackId) return true;
  return hex.stackId === movingStackId;
}

/**
 * Dijkstra from `from`, returning a map of hexKey → cheapest cost to reach it,
 * bounded by `budget`. Only includes hexes the stack can enter.
 * The starting hex has cost 0.
 * Pass `flying = true` for stacks where ALL units are flying — they pay flat cost 3 everywhere.
 *
 * Minimum-move guarantee: adjacent passable hexes (distance=1) are ALWAYS reachable
 * regardless of budget, so a stack can always move at least 1 hex per turn.
 */
export function reachableHexes(
  map: GameMap,
  stacks: Record<string, Stack>,
  movingStackId: string,
  from: HexCoord,
  budget: number,
  flying = false,
): Map<string, number> {
  const costs = new Map<string, number>();
  const fromKey = hexKey(from);
  costs.set(fromKey, 0);

  // Min-heap-less Dijkstra — N is at most ~331, so an array + linear scan is fine.
  const frontier: { key: string; coord: HexCoord; cost: number }[] = [
    { key: fromKey, coord: from, cost: 0 },
  ];

  // Minimum-move guarantee: adjacent passable hexes whose real terrain cost
  // exceeds the budget are pre-marked reachable at the actual terrain cost.
  // Hexes within budget are left to Dijkstra so their recorded cost stays accurate.
  for (const nb of neighbors(from)) {
    const nbKey = hexKey(nb);
    const hex = map.hexes[nbKey];
    if (!hex || !canEnterHex(hex, stacks, movingStackId, flying)) continue;
    const realCost = flying ? 3 : (hex.hasRoadOverlay ? 1 : getTerrainMoveCost(hex.terrain, hex));
    if (realCost > budget) {
      // Only pre-seed over-budget neighbors — they won't be reached by normal Dijkstra.
      costs.set(nbKey, realCost);
      frontier.push({ key: nbKey, coord: nb, cost: realCost });
    }
  }

  while (frontier.length > 0) {
    // Pop cheapest (stable on insertion order → deterministic).
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bestIdx].cost) bestIdx = i;
    }
    const current = frontier.splice(bestIdx, 1)[0];

    if (current.cost > (costs.get(current.key) ?? Infinity)) continue;

    for (const nb of neighbors(current.coord)) {
      const nbKey = hexKey(nb);
      const hex = map.hexes[nbKey];
      if (!hex) continue;
      if (!canEnterHex(hex, stacks, movingStackId, flying)) continue;
      const stepCost = flying ? 3 : (hex.hasRoadOverlay ? 1 : getTerrainMoveCost(hex.terrain, hex));
      const nextCost = current.cost + stepCost;
      if (nextCost > budget) continue;
      if (nextCost < (costs.get(nbKey) ?? Infinity)) {
        costs.set(nbKey, nextCost);
        frontier.push({ key: nbKey, coord: nb, cost: nextCost });
      }
    }
  }

  return costs;
}

/**
 * Compute the cheapest path from `from` to `to` within `budget`, or null if
 * unreachable. Returns the sequence of hexes starting AFTER `from` (i.e. each
 * element is a step to take). Deterministic tiebreak: prefers neighbor with
 * lexicographically smallest hexKey.
 */
export function findPath(
  map: GameMap,
  stacks: Record<string, Stack>,
  movingStackId: string,
  from: HexCoord,
  to: HexCoord,
  budget: number,
  flying = false,
): HexCoord[] | null {
  const fromKey = hexKey(from);
  const toKey = hexKey(to);
  if (fromKey === toKey) return [];

  const costs = new Map<string, number>();
  const prev = new Map<string, string>();
  costs.set(fromKey, 0);

  const frontier: { key: string; coord: HexCoord; cost: number }[] = [
    { key: fromKey, coord: from, cost: 0 },
  ];

  // Minimum-move guarantee: adjacent over-budget hexes are pre-seeded at their real cost.
  // Hexes within budget are left to Dijkstra so cost accuracy is preserved.
  for (const nb of neighbors(from)) {
    const nbKey = hexKey(nb);
    const hex = map.hexes[nbKey];
    if (!hex || !canEnterHex(hex, stacks, movingStackId, flying)) continue;
    const realCost = flying ? 3 : (hex.hasRoadOverlay ? 1 : getTerrainMoveCost(hex.terrain, hex));
    if (realCost > budget && !costs.has(nbKey)) {
      costs.set(nbKey, realCost);
      prev.set(nbKey, fromKey);
      frontier.push({ key: nbKey, coord: nb, cost: realCost });
    }
  }

  while (frontier.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      const a = frontier[i], b = frontier[bestIdx];
      if (a.cost < b.cost || (a.cost === b.cost && a.key < b.key)) bestIdx = i;
    }
    const current = frontier.splice(bestIdx, 1)[0];
    if (current.cost > (costs.get(current.key) ?? Infinity)) continue;
    if (current.key === toKey) break;

    const nbs = neighbors(current.coord).sort((a, b) => {
      const ak = hexKey(a), bk = hexKey(b);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    for (const nb of nbs) {
      const nbKey = hexKey(nb);
      const hex = map.hexes[nbKey];
      if (!hex) continue;
      if (!canEnterHex(hex, stacks, movingStackId, flying)) continue;
      const stepCost = flying ? 3 : (hex.hasRoadOverlay ? 1 : getTerrainMoveCost(hex.terrain, hex));
      const nextCost = current.cost + stepCost;
      if (nextCost > budget) continue;
      if (nextCost < (costs.get(nbKey) ?? Infinity)) {
        costs.set(nbKey, nextCost);
        prev.set(nbKey, current.key);
        frontier.push({ key: nbKey, coord: nb, cost: nextCost });
      }
    }
  }

  if (!costs.has(toKey)) return null;

  // Reconstruct.
  const reverseKeys: string[] = [toKey];
  let cursor = toKey;
  while (cursor !== fromKey) {
    const p = prev.get(cursor);
    if (!p) return null;
    reverseKeys.push(p);
    cursor = p;
  }
  reverseKeys.reverse();
  // Drop `from`, return coords.
  return reverseKeys.slice(1).map(k => {
    const [q, r] = k.split(',').map(Number);
    return { q, r };
  });
}

/**
 * Total movement cost of a pre-supplied path (each step is a hex to enter).
 * Returns Infinity if any step is impassable or off-map.
 */
export function pathCost(map: GameMap, path: HexCoord[]): number {
  let total = 0;
  for (const step of path) {
    const hex = map.hexes[hexKey(step)];
    if (!hex) return Infinity;
    const c = hex.hasRoadOverlay ? 1 : getTerrainMoveCost(hex.terrain, hex);
    if (c === Infinity) return Infinity;
    total += c;
  }
  return total;
}
