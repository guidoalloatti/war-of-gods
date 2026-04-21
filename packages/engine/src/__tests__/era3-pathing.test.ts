import { describe, it, expect } from 'vitest';
import {
  getTerrainMoveCost,
  canEnterHex,
  reachableHexes,
  findPath,
  pathCost,
  hexKey,
  generateMap,
} from '../era3/index.js';
import type { GameMap, Hex, Stack } from '../types/era3.js';
import type { Player } from '../types/player.js';

function mkPlayer(id: string): Player {
  return {
    id, name: id, raceId: 'elf', isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 0, hasTraded: false, hasPlaced: false, connected: true,
  };
}

function mkMap(): GameMap { return generateMap(42, [mkPlayer('p1'), mkPlayer('p2')]); }

describe('getTerrainMoveCost', () => {
  it('road is one-third of plain', () => {
    expect(getTerrainMoveCost('road')).toBe(1);
    expect(getTerrainMoveCost('plain')).toBe(3);
  });

  it('plain/ruins/citadel baseline = 3', () => {
    expect(getTerrainMoveCost('plain')).toBe(3);
    expect(getTerrainMoveCost('ruins')).toBe(3);
    expect(getTerrainMoveCost('citadel')).toBe(3);
  });

  it('swamp slow going = 4', () => {
    expect(getTerrainMoveCost('swamp')).toBe(4);
  });

  it('forest/desert/mountain cost a full extra move = 6', () => {
    expect(getTerrainMoveCost('forest')).toBe(6);
    expect(getTerrainMoveCost('desert')).toBe(6);
    expect(getTerrainMoveCost('mountain')).toBe(6);
  });

  it('lake is impassable (ground units)', () => {
    expect(getTerrainMoveCost('lake')).toBe(Infinity);
  });
});

describe('canEnterHex', () => {
  const hexPlain: Hex = { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null };
  const hexMtn: Hex = { ...hexPlain, terrain: 'mountain' };
  const hexOccupied: Hex = { ...hexPlain, stackId: 's2' };

  it('accepts mountain (passable, just expensive)', () => {
    expect(canEnterHex(hexMtn, {}, 's1')).toBe(true);
  });

  it('accepts empty plain', () => {
    expect(canEnterHex(hexPlain, {}, 's1')).toBe(true);
  });

  it('rejects hex occupied by another stack', () => {
    expect(canEnterHex(hexOccupied, { s2: {} as Stack }, 's1')).toBe(false);
  });

  it('accepts hex occupied by the moving stack itself', () => {
    const hex: Hex = { ...hexPlain, stackId: 's1' };
    expect(canEnterHex(hex, { s1: {} as Stack }, 's1')).toBe(true);
  });
});

describe('pathCost', () => {
  it('returns 0 for empty path', () => {
    const map = mkMap();
    expect(pathCost(map, [])).toBe(0);
  });

  it('sums terrain step costs', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'forest', isSpawnZone: false, isCapital: false, stackId: null },
        '2,0': { coord: { q: 2, r: 0 }, terrain: 'road', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    expect(pathCost(map, [{ q: 1, r: 0 }, { q: 2, r: 0 }])).toBe(7); // forest(6) + road(1)
  });

  it('mountain costs 6 (passable, slow)', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'mountain', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    expect(pathCost(map, [{ q: 1, r: 0 }])).toBe(6);
  });
});

describe('reachableHexes', () => {
  it('starting hex cost 0, includes neighbors within budget', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '0,1': { coord: { q: 0, r: 1 }, terrain: 'forest', isSpawnZone: false, isCapital: false, stackId: null },
        '1,-1': { coord: { q: 1, r: -1 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    const reach = reachableHexes(map, {}, 's1', { q: 0, r: 0 }, 3);
    expect(reach.get('0,0')).toBe(0);
    expect(reach.get('1,0')).toBe(3);
    expect(reach.get('1,-1')).toBe(3);
    // Minimum-move guarantee: adjacent forest (cost 6) is reachable even with budget 3, recorded at real cost 6
    expect(reach.has('0,1')).toBe(true);
    expect(reach.get('0,1')).toBe(6);
  });

  it('mountain is reachable with minimum-move guarantee (adjacent) or enough budget', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'mountain', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    // Adjacent mountain is always reachable (minimum-move guarantee)
    expect(reachableHexes(map, {}, 's1', { q: 0, r: 0 }, 5).has('1,0')).toBe(true);
    expect(reachableHexes(map, {}, 's1', { q: 0, r: 0 }, 6).has('1,0')).toBe(true);
  });

  it('does not expand through occupied hexes', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: 'other' },
      },
    };
    const reach = reachableHexes(map, { other: {} as Stack }, 's1', { q: 0, r: 0 }, 10);
    expect(reach.has('1,0')).toBe(false);
  });
});

describe('findPath', () => {
  it('returns [] when from === to', () => {
    const map = mkMap();
    const origin = Object.values(map.hexes)[0].coord;
    expect(findPath(map, {}, 's1', origin, origin, 0)).toEqual([]);
  });

  it('finds direct path to neighbor', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    const path = findPath(map, {}, 's1', { q: 0, r: 0 }, { q: 1, r: 0 }, 3);
    expect(path).toEqual([{ q: 1, r: 0 }]);
  });

  it('prefers cheaper (plain) path over forest path', () => {
    const map: GameMap = {
      radius: 2,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'forest', isSpawnZone: false, isCapital: false, stackId: null },
        '0,1': { coord: { q: 0, r: 1 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,1': { coord: { q: 1, r: 1 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    // Budget 6: via (0,1)→(1,1) costs 6 (plain+plain), via (1,0)→(1,1) costs 7 (forest+plain).
    const path = findPath(map, {}, 's1', { q: 0, r: 0 }, { q: 1, r: 1 }, 7);
    expect(path).not.toBeNull();
    const total = pathCost(map, path!);
    expect(total).toBe(6); // cheaper route
  });

  it('always reaches adjacent hex (minimum-move guarantee) even when terrain cost exceeds budget', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'forest', isSpawnZone: false, isCapital: false, stackId: null },
      },
    };
    // Adjacent forest (cost 6) is reachable even with budget 3 — minimum-move guarantee
    // Path is returned (reducer allows it separately via isMinimumMove check)
    expect(findPath(map, {}, 's1', { q: 0, r: 0 }, { q: 1, r: 0 }, 3)).toEqual([{ q: 1, r: 0 }]);
    // But a NON-adjacent 2-hop over-budget path is still null
    // (The minimum-move guarantee only applies to immediate neighbors)
  });

  it('returns null if destination unreachable (blocked by stack)', () => {
    const map: GameMap = {
      radius: 1,
      hexes: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plain', isSpawnZone: false, isCapital: false, stackId: 'other' },
      },
    };
    expect(findPath(map, { other: {} as Stack }, 's1', { q: 0, r: 0 }, { q: 1, r: 0 }, 5)).toBeNull();
  });
});

describe('reachableHexes — generated map sanity', () => {
  it('from a capital with budget=9 can reach at least 7 hexes', () => {
    const map = mkMap();
    const capital = Object.values(map.hexes).find(h => h.isCapital)!;
    const reach = reachableHexes(map, {}, 'stackX', capital.coord, 9);
    expect(reach.size).toBeGreaterThanOrEqual(7);
    expect(reach.get(hexKey(capital.coord))).toBe(0);
  });
});
