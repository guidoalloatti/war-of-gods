// Base types for the card system

export type TerrainType = 'plain' | 'mountain' | 'forest' | 'swamp' | 'road';

export type EffectTrigger =
  | 'on_reveal'           // When the card is revealed
  | 'on_draw'             // When drawing tiles
  | 'on_trade'            // During the trade phase
  | 'on_placement'        // When placing tiles
  | 'on_era1_close'       // When Era I closes
  | 'on_era2_start'       // When Era II starts
  | 'on_era3_start'       // When Era III starts
  | 'persistent';         // Active effect for the entire era

export type CardEffect =
  | { type: 'modify_draw_count';         trigger: EffectTrigger; delta: number }
  | { type: 'modify_trade_limit';        trigger: EffectTrigger; newLimit: number }
  | { type: 'skip_trade_phase';          trigger: EffectTrigger }
  | { type: 'discard_and_redraw';        trigger: EffectTrigger; maxDiscard: number; forced?: boolean }
  | { type: 'bonus_per_terrain';         trigger: EffectTrigger; terrain: TerrainType; bonus: number }
  | { type: 'bonus_per_favorable';       trigger: EffectTrigger; bonus: number }
  | { type: 'flat_bonus';                trigger: EffectTrigger; bonus: number }
  | { type: 'free_unit';                 trigger: EffectTrigger; unit: string; count: number; conditionTerrain?: TerrainType; conditionCount?: number }
  | { type: 'free_tech_level';           trigger: EffectTrigger; tech: 'war' | 'science' | 'resources' | 'economy'; level: number; bonusPoints?: number }
  | { type: 'modify_road_requirement';   trigger: EffectTrigger; newRequirement: number }
  | { type: 'waive_road_requirement';    trigger: EffectTrigger }
  | { type: 'bonus_per_road';            trigger: EffectTrigger; bonus: number }
  | { type: 'bonus_for_all_terrains';    trigger: EffectTrigger; minPerTerrain: number; bonus: number }
  | { type: 'scry_pile';                 trigger: EffectTrigger; count: number }
  | { type: 'manual_pick';               trigger: EffectTrigger; count: number }
  | { type: 'extra_relic';               trigger: EffectTrigger; count: number }
  | { type: 'preview_next_era_deck';     trigger: EffectTrigger; count: number; keepOne: boolean }
  | { type: 'view_opponents_tiles';      trigger: EffectTrigger }
  | { type: 'double_if_positive';        trigger: EffectTrigger; clampNegativeToZero: boolean }
  | { type: 'double_favorable_tiles';    trigger: EffectTrigger; count: number }
  | { type: 'draw_two_era_cards_keep_one'; trigger: EffectTrigger }
  | { type: 'return_tiles_to_pile';      trigger: EffectTrigger; count: number; random: boolean }
  | { type: 'all_players_bonus';         trigger: EffectTrigger; bonus: number; condition?: string }
  | { type: 'grant_relic_to_all';        trigger: EffectTrigger }
  | { type: 'swap_relic';                trigger: EffectTrigger; choices: number };

export type Card = {
  id: string;
  name: string;
  type: 'world_era1' | 'era1';
  flavorText: string;        // Narrative (italics in UI)
  mechanicalText: string;    // Readable mechanical effect
  effects: CardEffect[];
};
