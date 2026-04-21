import type { Player } from '../types/player.js';
import type { GameMap, Hex, HexCoord, HexTerrain } from '../types/era3.js';
import { createRng } from '../state/random.js';
import {
  MAP_RADIUS,
  CAPITAL_RING_RADIUS,
  SPAWN_RING_RADIUS,
  OFFSET_ERA3_TERRAIN,
  OFFSET_ERA3_CAPITAL_ROTATION,
  OFFSET_ERA3_ROADS,
  OFFSET_ERA3_RUINS,
  OFFSET_ERA3_RIVERS,
  FORT_HEX_PROBABILITY,
} from './constants.js';
import { rollRuinsReward } from './ruins.js';
import {
  disk,
  hexKey,
  ring,
  distance,
} from './hex.js';
import { paintRoadsForCapitals } from './roads.js';

/**
 * Seed a geographic feature (mountain range, forest, lake) as a contiguous
 * blob. Starts at `origin`, picks a preferred axis direction, and grows outward
 * with decaying probability so features have a natural shape rather than a
 * perfect circle.
 *
 * @param target       Terrain to paint into the blob.
 * @param origin       Seed hex (must exist in hexes).
 * @param size         Approx. number of hexes to paint (± random variance).
 * @param growthChance Per-neighbor probability to extend (0..1).
 * @param directional  If true, bias growth along one random axis — produces
 *                     elongated ranges rather than round blobs.
 */
function seedFeature(
  hexes: Record<string, Hex>,
  target: HexTerrain,
  origin: HexCoord,
  size: number,
  growthChance: number,
  directional: boolean,
  rng: () => number,
  protectedKeys: Set<string>,
): void {
  const originKey = hexKey(origin);
  if (!hexes[originKey]) return;

  // Pick a biased direction vector for elongated features (mountain ranges).
  const axes = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const primary = axes[Math.floor(rng() * axes.length)];
  const isAlongPrimary = (from: HexCoord, to: HexCoord): boolean => {
    const dq = to.q - from.q, dr = to.r - from.r;
    return dq === primary.q && dr === primary.r;
  };

  // BFS with per-step random chance to enqueue neighbors.
  const queue: HexCoord[] = [origin];
  const visited = new Set<string>();
  visited.add(originKey);

  let painted = 0;
  const maxPaints = Math.max(1, size + Math.floor(rng() * 3) - 1);

  while (queue.length > 0 && painted < maxPaints) {
    const current = queue.shift()!;
    const key = hexKey(current);
    if (!hexes[key]) continue;
    if (protectedKeys.has(key)) continue;
    hexes[key] = { ...hexes[key], terrain: target };
    painted += 1;

    // Gather neighbors, shuffle, and enqueue each with decaying probability.
    const ns = [...directions].map(d => ({ q: current.q + d.q, r: current.r + d.r }));
    // Fisher-Yates shuffle (deterministic via rng)
    for (let i = ns.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ns[i], ns[j]] = [ns[j], ns[i]];
    }
    for (const n of ns) {
      const nk = hexKey(n);
      if (visited.has(nk)) continue;
      if (!hexes[nk]) continue;
      const chance = directional && isAlongPrimary(current, n)
        ? Math.min(0.98, growthChance + 0.25)
        : growthChance;
      if (rng() < chance) {
        visited.add(nk);
        queue.push(n);
      }
    }
  }
}

// Local directions list (duplicated from hex.ts to avoid a cycle with seed helpers).
const directions: HexCoord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/**
 * Pick N distinct random hexes inside the disk that aren't in `excluded`.
 * Uses rejection sampling against the disk footprint.
 */
function pickRandomHexes(
  rng: () => number,
  n: number,
  radius: number,
  minDist: number,
  excluded: (c: HexCoord) => boolean,
): HexCoord[] {
  const picks: HexCoord[] = [];
  const all = disk(radius);
  let attempts = 0;
  while (picks.length < n && attempts < 500) {
    attempts += 1;
    const c = all[Math.floor(rng() * all.length)];
    if (excluded(c)) continue;
    const tooClose = picks.some(p => distance(p, c) < minDist);
    if (tooClose) continue;
    picks.push(c);
  }
  return picks;
}

/**
 * Angle (radians) of a hex on the CAPITAL_RING_RADIUS ring, measured from
 * the +q axis using pointy-top pixel projection. This gives a stable
 * ordering around the ring independent of axial idiosyncrasies.
 */
function ringHexAngle(c: HexCoord): number {
  const x = c.q + c.r / 2;
  const y = (Math.sqrt(3) / 2) * c.r;
  return Math.atan2(y, x);
}

/**
 * Place N capitals on the CAPITAL_RING_RADIUS ring, equispaced by angle,
 * with a deterministic starting rotation driven by the seed RNG. Picks
 * actual hexes on the ring (never invents coords off-grid or outside disk).
 *
 * For playerCount=1, we still return 1 position (the solo-with-2-races
 * case can choose the opposite hex externally if needed).
 */
export function computeCapitalPositions(playerCount: number, seedRng: () => number): HexCoord[] {
  if (playerCount < 1) throw new Error(`playerCount must be >= 1, got ${playerCount}`);

  // Pool of candidate hexes — the ring at radius CAPITAL_RING_RADIUS,
  // sorted by angle for stable slicing.
  const ringHexes = [...ring(CAPITAL_RING_RADIUS)].sort(
    (a, b) => ringHexAngle(a) - ringHexAngle(b),
  );
  const ringLen = ringHexes.length; // = 6 * R

  // Deterministic rotation offset (an integer index into the sorted ring).
  const rotationOffset = Math.floor(seedRng() * ringLen);

  const positions: HexCoord[] = [];
  for (let i = 0; i < playerCount; i++) {
    const idx = (rotationOffset + Math.round((i * ringLen) / playerCount)) % ringLen;
    positions.push(ringHexes[idx]);
  }
  return positions;
}

/**
 * Pick a hex on the SPAWN_RING_RADIUS ring that's closest to the capital —
 * visually "midway" between the capital and the citadel along the shortest
 * hex path. Guaranteed to return a hex actually on the ring.
 */
function computeSpawnZoneForCapital(capital: HexCoord): HexCoord {
  const ringHexes = ring(SPAWN_RING_RADIUS);
  let best = ringHexes[0];
  let bestDist = distance(capital, best);
  for (const h of ringHexes) {
    const d = distance(capital, h);
    if (d < bestDist) { best = h; bestDist = d; }
  }
  return best;
}

export function generateMap(seed: number, players: Player[]): GameMap {
  const terrainRng = createRng(seed + OFFSET_ERA3_TERRAIN);
  const rotationRng = createRng(seed + OFFSET_ERA3_CAPITAL_ROTATION);
  const roadRng = createRng(seed + OFFSET_ERA3_ROADS);
  const ruinsRng = createRng(seed + OFFSET_ERA3_RUINS);

  const hexes: Record<string, Hex> = {};

  // 1. Fill the disk with plains as the base layer.
  for (const coord of disk(MAP_RADIUS)) {
    hexes[hexKey(coord)] = {
      coord,
      terrain: 'plain',
      isSpawnZone: false,
      isCapital: false,
      stackId: null,
    };
  }

  // Reserve the citadel + its 1-ring neighborhood from feature overwrites so
  // the final sanctuary stays accessible and visually clean.
  const reserved = new Set<string>([hexKey({ q: 0, r: 0 })]);
  for (const n of directions) {
    reserved.add(hexKey({ q: n.q, r: n.r }));
  }

  // 1a. Mountain ranges — large, elongated ridges. Two big ones plus an
  //     optional third smaller spur. Directional growth produces cordilleras.
  const mountainOrigins = pickRandomHexes(
    terrainRng,
    3,
    MAP_RADIUS,
    /* minDist */ 7,
    c => reserved.has(hexKey(c)) || distance(c, { q: 0, r: 0 }) < 3,
  );
  mountainOrigins.forEach((origin, i) => {
    // Main ranges are bigger than the smaller spur.
    const size = i < 2
      ? 28 + Math.floor(terrainRng() * 10) // 28–37
      : 14 + Math.floor(terrainRng() * 6); // 14–19
    seedFeature(hexes, 'mountain', origin, size, /* growth */ 0.7, /* directional */ true, terrainRng, reserved);
  });

  // 1b. Forests — two very large woodlands plus an optional smaller grove.
  const forestOrigins = pickRandomHexes(
    terrainRng,
    3,
    MAP_RADIUS,
    /* minDist */ 6,
    c => {
      const k = hexKey(c);
      return reserved.has(k) || hexes[k]?.terrain === 'mountain';
    },
  );
  forestOrigins.forEach((origin, i) => {
    const size = i < 2
      ? 22 + Math.floor(terrainRng() * 10) // 22–31
      : 12 + Math.floor(terrainRng() * 6); // 12–17
    seedFeature(hexes, 'forest', origin, size, /* growth */ 0.62, /* directional */ false, terrainRng, reserved);
  });

  // 1c. Deserts — one sprawling arid expanse plus one smaller scrubland.
  const desertOrigins = pickRandomHexes(
    terrainRng,
    2,
    MAP_RADIUS,
    /* minDist */ 8,
    c => {
      const k = hexKey(c);
      const h = hexes[k];
      return reserved.has(k) || (h?.terrain !== 'plain');
    },
  );
  desertOrigins.forEach((origin, i) => {
    const size = i === 0
      ? 22 + Math.floor(terrainRng() * 10) // 22–31
      : 10 + Math.floor(terrainRng() * 5); // 10–14
    seedFeature(hexes, 'desert', origin, size, /* growth */ 0.55, /* directional */ false, terrainRng, reserved);
  });

  // 1d. Lakes — round blue bodies, impassable. One big lake + one small pond.
  const lakeOrigins = pickRandomHexes(
    terrainRng,
    2,
    MAP_RADIUS,
    /* minDist */ 8,
    c => {
      const k = hexKey(c);
      const h = hexes[k];
      return reserved.has(k) || (h?.terrain !== 'plain');
    },
  );
  lakeOrigins.forEach((origin, i) => {
    const size = i === 0
      ? 9 + Math.floor(terrainRng() * 5) // 9–13
      : 4 + Math.floor(terrainRng() * 3); // 4–6
    seedFeature(hexes, 'lake', origin, size, /* growth */ 0.75, /* directional */ false, terrainRng, reserved);
  });

  // 1e. Swamps — mid-sized wetlands, often near lakes or forests.
  const swampOrigins = pickRandomHexes(
    terrainRng,
    2,
    MAP_RADIUS,
    /* minDist */ 6,
    c => {
      const k = hexKey(c);
      const h = hexes[k];
      return reserved.has(k) || h?.terrain === 'mountain' || h?.terrain === 'lake';
    },
  );
  for (const origin of swampOrigins) {
    seedFeature(hexes, 'swamp', origin, /* size */ 9 + Math.floor(terrainRng() * 4), 0.5, /* directional */ false, terrainRng, reserved);
  }

  // 1f. Ruins — scattered single-hex landmarks on plains. Skip hexes that
  //     were reassigned to a biome.
  const ruinCount = 10;
  const ruinOrigins = pickRandomHexes(
    terrainRng,
    ruinCount,
    MAP_RADIUS,
    /* minDist */ 3,
    c => {
      const k = hexKey(c);
      if (reserved.has(k)) return true;
      return hexes[k]?.terrain !== 'plain';
    },
  );
  for (const origin of ruinOrigins) {
    const k = hexKey(origin);
    if (hexes[k]) hexes[k] = { ...hexes[k], terrain: 'ruins' };
  }


  // 2. Citadel at (0,0).
  const citadelKey = hexKey({ q: 0, r: 0 });
  hexes[citadelKey] = { ...hexes[citadelKey], terrain: 'citadel' };

  // 3. Capitals on ring 8.
  const capitals = computeCapitalPositions(players.length, rotationRng);
  capitals.forEach((coord, i) => {
    const key = hexKey(coord);
    hexes[key] = {
      ...hexes[key],
      terrain: 'plain',
      isCapital: true,
      capitalOwnerId: players[i].id,
    };
  });

  // 4. Spawn zones mid-way between each capital and the citadel.
  //    Each capital contributes 1 spawn zone, tagged with that player's race.
  capitals.forEach((coord, i) => {
    const spawnCoord = computeSpawnZoneForCapital(coord);
    const key = hexKey(spawnCoord);
    if (!hexes[key]) return; // should always exist inside the disk
    // Don't overwrite a capital or citadel hex if (unlikely) they collide.
    if (hexes[key].isCapital || hexes[key].terrain === 'citadel') return;
    hexes[key] = {
      ...hexes[key],
      terrain: 'ruins',
      isSpawnZone: true,
      spawnZoneOwnerRace: players[i].raceId,
    };
  });

  // 5. Roads: paint a path from each capital toward a map edge.
  paintRoadsForCapitals(hexes, capitals, MAP_RADIUS, roadRng);

  // 6. Roll rewards for every non-spawn ruins hex. Deterministic key-sorted
  //    iteration so the rng sequence is reproducible.
  const ruinsKeys = Object.keys(hexes)
    .filter(k => hexes[k].terrain === 'ruins' && !hexes[k].isSpawnZone)
    .sort();
  for (const k of ruinsKeys) {
    hexes[k] = { ...hexes[k], ruinsReward: rollRuinsReward(ruinsRng), ruinsLooted: false };
  }

  // 7. Place standalone forts on ~4% of eligible plain/road hexes (not capitals,
  //    not spawn zones, not citadel). Deterministic, key-sorted.
  const eligibleFortKeys = Object.keys(hexes)
    .filter(k => {
      const h = hexes[k];
      if (h.isCapital || h.isSpawnZone || h.terrain === 'citadel') return false;
      return h.terrain === 'plain' || h.terrain === 'road';
    })
    .sort();
  for (const k of eligibleFortKeys) {
    if (ruinsRng() < FORT_HEX_PROBABILITY) {
      hexes[k] = { ...hexes[k], hasFort: true };
    }
  }

  // 8. Rivers: 2–3 winding courses flowing from mountain hexes toward map edge/lake.
  const riverRng = createRng(seed + OFFSET_ERA3_RIVERS);
  paintRivers(hexes, MAP_RADIUS, riverRng, reserved);

  return { radius: MAP_RADIUS, hexes };
}

/**
 * Paint 2-3 river courses. Each starts near a mountain hex and follows a
 * winding path "downhill" (away from center) toward the edge or a lake hex,
 * replacing plain/swamp hexes with 'river'. Capitals and spawn zones are
 * never overwritten.
 */
function paintRivers(
  hexes: Record<string, Hex>,
  radius: number,
  rng: () => number,
  protectedKeys: Set<string>,
): void {
  // Find mountain hexes in the outer two-thirds of the map.
  const mountainKeys = Object.keys(hexes)
    .filter(k => {
      const h = hexes[k];
      return h.terrain === 'mountain' && !protectedKeys.has(k) && distance(h.coord, { q: 0, r: 0 }) >= 3;
    })
    .sort();

  const riverCount = 2 + Math.floor(rng() * 2); // 2–3 rivers
  const usedSources = new Set<string>();

  for (let ri = 0; ri < riverCount && mountainKeys.length > 0; ri++) {
    // Pick a random mountain source not already used, biasing toward outer ring.
    let sourceKey: string | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const k = mountainKeys[Math.floor(rng() * mountainKeys.length)];
      if (!usedSources.has(k)) { sourceKey = k; break; }
    }
    if (!sourceKey) continue;
    usedSources.add(sourceKey);
    const source = hexes[sourceKey].coord;

    // Walk outward in a winding path (up to 12 steps).
    let current = source;
    const visited = new Set<string>([hexKey(source)]);
    for (let step = 0; step < 14; step++) {
      // Candidates: neighbors that are farther from center or same distance,
      // not mountains, not capital/citadel/spawn.
      const curDist = distance(current, { q: 0, r: 0 });
      const candidates = directions
        .map(d => ({ q: current.q + d.q, r: current.r + d.r }))
        .filter(n => {
          const k = hexKey(n);
          if (!hexes[k]) return false;
          if (visited.has(k)) return false;
          const h = hexes[k];
          if (h.isCapital || h.isSpawnZone || h.terrain === 'citadel') return false;
          if (h.terrain === 'mountain') return false;
          // Prefer outward movement.
          return distance(n, { q: 0, r: 0 }) >= curDist - 1;
        });

      if (candidates.length === 0) break;

      // Pick with slight bias toward outward.
      const outward = candidates.filter(n => distance(n, { q: 0, r: 0 }) > curDist);
      const pool = outward.length > 0 && rng() < 0.7 ? outward : candidates;
      const next = pool[Math.floor(rng() * pool.length)];
      const nk = hexKey(next);
      visited.add(nk);

      // Paint as river only if plain/swamp/desert/forest (not road/ruins/lake).
      const h = hexes[nk];
      if (['plain', 'swamp', 'desert', 'forest'].includes(h.terrain)) {
        hexes[nk] = { ...h, terrain: 'river' };
      }

      current = next;
      // Stop if we've reached the edge of the map.
      if (distance(next, { q: 0, r: 0 }) >= radius - 1) break;
    }
  }
}
