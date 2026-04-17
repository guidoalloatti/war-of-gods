import type { Race, RaceId } from '../types/race.js';

/** The 8 game races with their construction values per terrain */
const RACES: Race[] = [
  {
    id: 'elf', name: 'Rey Elfo', color: '#FF8FAA',
    terrainValues: { plain: 1, mountain: 0, forest: 3, swamp: 1 },
    favorableTerrain: 'forest', unfavorableTerrain: 'mountain',
    era1Advantage: {
      id: 'elf_advantage_era1',
      effectType: 'extra_favorable_guarantee',
      params: { guaranteedFavorable: 3 },
    },
    era1Disadvantage: {
      id: 'elf_disadvantage_era1',
      effectType: 'terrain_ignores_diversity',
      params: { terrain: 'mountain' },
    },
  },
  {
    id: 'dwarf', name: 'Rey Enano', color: '#FFD700',
    terrainValues: { plain: 0, mountain: 4, forest: 0, swamp: 1 },
    favorableTerrain: 'mountain', unfavorableTerrain: 'forest',
    era1Advantage: {
      id: 'dwarf_advantage_era1',
      effectType: 'group_bonus',
      params: { terrain: 'mountain', groupSize: 3, bonusPerGroup: 2 },
    },
    era1Disadvantage: {
      id: 'dwarf_disadvantage_era1',
      effectType: 'reduced_draw',
      params: { modifier: -1 },
    },
  },
  {
    id: 'human', name: 'Rey Humano', color: '#4A90E2',
    terrainValues: { plain: 3, mountain: 0, forest: 1, swamp: 1 },
    favorableTerrain: 'plain', unfavorableTerrain: 'mountain',
    era1Advantage: {
      id: 'human_advantage_era1',
      effectType: 'extra_trade',
      params: { tradeLimit: 2 },
    },
    era1Disadvantage: {
      id: 'human_disadvantage_era1',
      effectType: 'no_balance_bonus',
      params: {},
    },
  },
  {
    id: 'halfelf', name: 'Rey Semielfo', color: '#9B59B6',
    terrainValues: { plain: 2, mountain: 1, forest: 2, swamp: 0 },
    favorableTerrain: 'plain', unfavorableTerrain: 'swamp',
    era1Advantage: {
      id: 'halfelf_advantage_era1',
      effectType: 'dual_favorable',
      params: { secondFavorable: 'forest' },
    },
    era1Disadvantage: {
      id: 'halfelf_disadvantage_era1',
      effectType: 'concentration_threshold_reduction',
      params: { threshold: 6 },
    },
  },
  {
    id: 'orc', name: 'Rey Orco', color: '#E74C3C',
    terrainValues: { plain: 1, mountain: 0, forest: 1, swamp: 3 },
    favorableTerrain: 'swamp', unfavorableTerrain: 'mountain',
    era1Advantage: {
      id: 'orc_advantage_era1',
      effectType: 'no_concentration_penalty',
      params: { terrain: 'swamp' },
    },
    era1Disadvantage: {
      id: 'orc_disadvantage_era1',
      effectType: 'halved_road_bonus',
      params: {},
    },
  },
  {
    id: 'giant', name: 'Rey Gigante', color: '#5A8AAA',
    terrainValues: { plain: 0, mountain: 3, forest: 1, swamp: 1 },
    favorableTerrain: 'mountain', unfavorableTerrain: 'plain',
    era1Advantage: {
      id: 'giant_advantage_era1',
      effectType: 'terrain_value_bonus',
      params: { terrain: 'mountain', bonus: 1 },
    },
    era1Disadvantage: {
      id: 'giant_disadvantage_era1',
      effectType: 'terrain_penalty',
      params: { terrain: 'plain', penaltyPerTile: -1 },
    },
  },
  {
    id: 'goblin', name: 'Rey Goblin', color: '#27AE60',
    terrainValues: { plain: 1, mountain: 1, forest: 2, swamp: 1 },
    favorableTerrain: 'forest', unfavorableTerrain: 'swamp',
    era1Advantage: {
      id: 'goblin_advantage_era1',
      effectType: 'double_diversity_bonus',
      params: {},
    },
    era1Disadvantage: {
      id: 'goblin_disadvantage_era1',
      effectType: 'concentration_threshold_reduction',
      params: { threshold: 6 },
    },
  },
  {
    id: 'halforc', name: 'Rey Semiorco', color: '#8FA4AD',
    terrainValues: { plain: 2, mountain: 1, forest: 0, swamp: 2 },
    favorableTerrain: 'swamp', unfavorableTerrain: 'forest',
    era1Advantage: {
      id: 'halforc_advantage_era1',
      effectType: 'enhanced_balance_bonus',
      params: { bonus: 6 },
    },
    era1Disadvantage: {
      id: 'halforc_disadvantage_era1',
      effectType: 'terrain_value_override',
      params: { terrain: 'forest', value: 0 },
    },
  },
];

export function getAllRaces(): readonly Race[] {
  return RACES;
}

export function getRaceById(id: RaceId): Race {
  const race = RACES.find(r => r.id === id);
  if (!race) throw new Error(`Race not found: ${id}`);
  return race;
}
