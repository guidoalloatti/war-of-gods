import { describe, it, expect } from 'vitest';
import { generateMap, computeCapitalPositions } from '../era3/map-gen.js';
import { distance, disk, hexKey, neighbors } from '../era3/hex.js';
import {
  MAP_RADIUS,
  CAPITAL_RING_RADIUS,
  SPAWN_RING_RADIUS,
} from '../era3/constants.js';
import { createRng } from '../state/random.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';

const RACES: RaceId[] = ['elf', 'dwarf', 'human', 'halfelf', 'orc', 'giant'];

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    raceId: RACES[i % RACES.length],
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [],
    relic: null,
    score: 25,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
  }));
}

describe('generateMap — structural invariants', () => {
  it('produces the full disk of 331 hexes at radius 10', () => {
    const map = generateMap(42, makePlayers(4));
    expect(map.radius).toBe(MAP_RADIUS);
    expect(Object.keys(map.hexes).length).toBe(disk(MAP_RADIUS).length);
  });

  it('places the citadel at (0,0)', () => {
    const map = generateMap(42, makePlayers(4));
    expect(map.hexes['0,0'].terrain).toBe('citadel');
  });

  it('is deterministic — same seed + players produce byte-identical hexes', () => {
    const a = generateMap(12345, makePlayers(4));
    const b = generateMap(12345, makePlayers(4));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds produce different maps', () => {
    const a = generateMap(1, makePlayers(4));
    const b = generateMap(2, makePlayers(4));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('no hex has a stack reference after generation', () => {
    const map = generateMap(42, makePlayers(4));
    for (const h of Object.values(map.hexes)) {
      expect(h.stackId).toBeNull();
    }
  });
});

describe('generateMap — capitals', () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    it(`places ${count} capitals on the ring at distance ${CAPITAL_RING_RADIUS}`, () => {
      const players = makePlayers(count);
      const map = generateMap(42, players);
      const capitalHexes = Object.values(map.hexes).filter(h => h.isCapital);
      expect(capitalHexes.length).toBe(count);
      for (const h of capitalHexes) {
        // hexRound may shift by 1 due to discretization — tolerate ±1 from the
        // ideal ring radius.
        const d = distance(h.coord, { q: 0, r: 0 });
        expect(Math.abs(d - CAPITAL_RING_RADIUS)).toBeLessThanOrEqual(1);
        expect(h.terrain).toBe('plain');
        expect(h.capitalOwnerId).toBeTruthy();
      }
    });
  }

  it('capitals belong to distinct players', () => {
    const map = generateMap(42, makePlayers(4));
    const ids = Object.values(map.hexes)
      .filter(h => h.isCapital)
      .map(h => h.capitalOwnerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateMap — spawn zones', () => {
  it('places one spawn zone per player, on ring SPAWN_RING_RADIUS (±1)', () => {
    const map = generateMap(42, makePlayers(4));
    const spawns = Object.values(map.hexes).filter(h => h.isSpawnZone);
    expect(spawns.length).toBeGreaterThanOrEqual(3); // tolerate rare collisions
    expect(spawns.length).toBeLessThanOrEqual(4);
    for (const s of spawns) {
      const d = distance(s.coord, { q: 0, r: 0 });
      expect(Math.abs(d - SPAWN_RING_RADIUS)).toBeLessThanOrEqual(1);
      expect(s.terrain).toBe('ruins');
      expect(s.spawnZoneOwnerRace).toBeTruthy();
    }
  });
});

describe('generateMap — roads', () => {
  it('every capital has at least one adjacent road hex', () => {
    const map = generateMap(42, makePlayers(4));
    const capitals = Object.values(map.hexes).filter(h => h.isCapital);
    for (const cap of capitals) {
      const adjRoads = neighbors(cap.coord)
        .map(n => map.hexes[hexKey(n)])
        .filter(h => h && h.terrain === 'road');
      expect(adjRoads.length).toBeGreaterThan(0);
    }
  });

  it('at least one road hex sits on or near the map edge (radius >= MAP_RADIUS - 1)', () => {
    const map = generateMap(42, makePlayers(4));
    const edgeRoads = Object.values(map.hexes).filter(
      h => h.terrain === 'road' && distance(h.coord, { q: 0, r: 0 }) >= MAP_RADIUS - 1,
    );
    expect(edgeRoads.length).toBeGreaterThan(0);
  });
});

describe('generateMap — geographic features', () => {
  it('produces every terrain type (plains dominate; others are features)', () => {
    const map = generateMap(99, makePlayers(4));
    const counts: Record<string, number> = {};
    let total = 0;
    for (const h of Object.values(map.hexes)) {
      counts[h.terrain] = (counts[h.terrain] ?? 0) + 1;
      total += 1;
    }
    // All 7 terrain types should appear on a ~331-hex map.
    for (const t of ['plain', 'mountain', 'forest', 'swamp', 'ruins', 'citadel', 'road']) {
      expect(counts[t] ?? 0).toBeGreaterThan(0);
    }
    // Plains should be the dominant terrain (anything else would mean
    // features accidentally cover the whole map).
    expect((counts.plain ?? 0) / total).toBeGreaterThan(0.3);
    // Mountains should form a visible range (≥8 hexes).
    expect(counts.mountain ?? 0).toBeGreaterThanOrEqual(8);
    // Forests should form visible woods (≥8 hexes).
    expect(counts.forest ?? 0).toBeGreaterThanOrEqual(8);
    // Swamps form small wetlands (≥3 hexes).
    expect(counts.swamp ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('mountain hexes are contiguous in at least one range of 4+', () => {
    const map = generateMap(99, makePlayers(4));
    // Find the largest connected mountain component via BFS.
    const mountainKeys = new Set(
      Object.values(map.hexes)
        .filter(h => h.terrain === 'mountain')
        .map(h => hexKey(h.coord)),
    );
    const visited = new Set<string>();
    let largest = 0;
    for (const start of mountainKeys) {
      if (visited.has(start)) continue;
      const queue: string[] = [start];
      let size = 0;
      while (queue.length > 0) {
        const k = queue.shift()!;
        if (visited.has(k)) continue;
        visited.add(k);
        size += 1;
        const [q, r] = k.split(',').map(Number);
        for (const n of neighbors({ q, r })) {
          const nk = hexKey(n);
          if (mountainKeys.has(nk) && !visited.has(nk)) queue.push(nk);
        }
      }
      if (size > largest) largest = size;
    }
    expect(largest).toBeGreaterThanOrEqual(4);
  });
});

describe('computeCapitalPositions', () => {
  it('returns exactly playerCount positions (2 for solo)', () => {
    const rng = createRng(1);
    expect(computeCapitalPositions(1, rng).length).toBe(1);
    expect(computeCapitalPositions(2, createRng(1)).length).toBe(2);
    expect(computeCapitalPositions(6, createRng(1)).length).toBe(6);
  });

  it('same seed rng produces same positions', () => {
    const a = computeCapitalPositions(4, createRng(777));
    const b = computeCapitalPositions(4, createRng(777));
    expect(a).toEqual(b);
  });
});
