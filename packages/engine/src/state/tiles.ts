import type { TerrainType } from '../types/terrain.js';
import { INITIAL_TILE_COUNTS } from '../types/terrain.js';
import { shuffle } from './random.js';

/** Creates the initial pile of 150 terrain tiles */
export function createTilePile(rng: () => number): TerrainType[] {
  const tiles: TerrainType[] = [];
  for (const [terrain, count] of Object.entries(INITIAL_TILE_COUNTS)) {
    for (let i = 0; i < count; i++) {
      tiles.push(terrain as TerrainType);
    }
  }
  return shuffle(tiles, rng);
}

/** Draws N tiles from the pile. Returns [drawn tiles, remaining pile] */
export function drawFromPile(
  pile: TerrainType[],
  count: number,
): [TerrainType[], TerrainType[]] {
  const drawn = pile.slice(0, count);
  const remaining = pile.slice(count);
  return [drawn, remaining];
}

/** Converts a tile array into counts by type */
export function tilesToCounts(tiles: TerrainType[]): Record<TerrainType, number> {
  const counts: Record<TerrainType, number> = {
    plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0,
  };
  for (const tile of tiles) {
    counts[tile]++;
  }
  return counts;
}
