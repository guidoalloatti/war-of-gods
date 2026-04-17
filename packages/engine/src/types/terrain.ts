export type TerrainType = 'plain' | 'mountain' | 'forest' | 'swamp' | 'road';

export const TERRAIN_TYPES: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

/** Initial terrain tile pile composition (150 tiles total) */
export const INITIAL_TILE_COUNTS: Record<TerrainType, number> = {
  plain: 30,
  mountain: 30,
  forest: 30,
  swamp: 30,
  road: 30,
};

export const TILES_PER_PLAYER = 18;

/** Road bonus table by number of road tiles */
export const ROAD_BONUS_TABLE: Record<number, number> = {
  0: -9,
  1: -6,
  2: -3,
  3: 0,
  4: 1,
  5: 3,
  6: 5,
};
// 7+ roads = +6
export const ROAD_BONUS_MAX = 6;
export const ROAD_BONUS_MAX_THRESHOLD = 7;

export function getRoadBonus(roadCount: number): number {
  if (roadCount >= ROAD_BONUS_MAX_THRESHOLD) return ROAD_BONUS_MAX;
  return ROAD_BONUS_TABLE[roadCount] ?? ROAD_BONUS_MAX;
}
