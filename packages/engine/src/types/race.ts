import type { TerrainType } from './terrain.js';

export type RaceId = 'elf' | 'dwarf' | 'human' | 'halfelf' | 'orc' | 'giant' | 'goblin' | 'halforc';

export type RaceAbility = {
  id: string;
  effectType: string;
  params: Record<string, number | string>;
};

export type Race = {
  id: RaceId;
  name: string;
  color: string;
  terrainValues: {
    plain: number;
    mountain: number;
    forest: number;
    swamp: number;
  };
  favorableTerrain: TerrainType;
  unfavorableTerrain: TerrainType;
  era1Advantage: RaceAbility;
  era1Disadvantage: RaceAbility;
};
