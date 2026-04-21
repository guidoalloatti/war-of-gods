// Base types for the card system

import type { TechType, UnitType } from '../types/era2.js';

export type TerrainType = 'plain' | 'mountain' | 'forest' | 'swamp' | 'road';

export type EffectTrigger =
  | 'on_reveal'           // When the card is revealed
  | 'on_draw'             // When drawing tiles
  | 'on_trade'            // During the trade phase
  | 'on_placement'        // When placing tiles
  | 'on_era1_close'       // When Era I closes
  | 'on_era2_start'       // When Era II starts (applied during transition)
  | 'on_era2_close'       // When Era II ends (before Era III starts)
  | 'on_era3_start'       // When Era III starts
  | 'on_era3_play'        // When a player plays an Era III era card during their turn
  | 'kings_table_open'    // When the Kings Table opens
  | 'on_tech_allocation'  // During tech allocation
  | 'on_convert_surplus'  // During surplus → gold conversion
  | 'persistent';         // Active effect for the entire era

export type CardEffect =
  // ── Era I effects ──
  | { type: 'modify_draw_count';         trigger: EffectTrigger; delta: number }
  | { type: 'modify_trade_limit';        trigger: EffectTrigger; newLimit: number }
  | { type: 'skip_trade_phase';          trigger: EffectTrigger }
  | { type: 'discard_and_redraw';        trigger: EffectTrigger; maxDiscard: number; forced?: boolean }
  | { type: 'bonus_per_terrain';         trigger: EffectTrigger; terrain: TerrainType; bonus: number }
  | { type: 'bonus_per_favorable';       trigger: EffectTrigger; bonus: number }
  | { type: 'flat_bonus';                trigger: EffectTrigger; bonus: number }
  | { type: 'free_unit';                 trigger: EffectTrigger; unit: UnitType | string; count: number; conditionTerrain?: TerrainType; conditionCount?: number }
  | { type: 'free_tech_level';           trigger: EffectTrigger; tech: TechType; level: number; bonusPoints?: number }
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
  | { type: 'swap_relic';                trigger: EffectTrigger; choices: number }

  // ── Era II effects ──
  | { type: 'allow_tech_level_6';        trigger: EffectTrigger; maxTechs: number }
  | { type: 'modify_tech_cost';          trigger: EffectTrigger; tech: TechType; delta: number; perLevel: boolean; minCost?: number }
  | { type: 'modify_tech_cost_flat';     trigger: EffectTrigger; tech: TechType; delta: number }
  | { type: 'player_choice_free_tech';   trigger: EffectTrigger; levels: number }
  | { type: 'player_choice_tech_discount'; trigger: EffectTrigger; delta: number }
  | { type: 'bonus_to_weakest';          trigger: EffectTrigger; bonus: number }
  | { type: 'allow_reallocation';        trigger: EffectTrigger; times: number }
  | { type: 'limit_tech_count';          trigger: EffectTrigger; maxTechs: number }
  | { type: 'bonus_to_highest_tech';     trigger: EffectTrigger; sourceTech: TechType; bonusTech: TechType; bonusLevels: number }
  | { type: 'modify_transfer_ratio';     trigger: EffectTrigger; ratio: number }
  | { type: 'modify_give_ratio';         trigger: EffectTrigger; ratio: number }
  | { type: 'modify_receive_ratio';      trigger: EffectTrigger; ratio: number }
  | { type: 'modify_surplus_ratio';      trigger: EffectTrigger; ratio: number }
  | { type: 'modify_doom_clock';         trigger: EffectTrigger; delta: number; modeRestriction?: 'saga' | 'chronicle' }
  | { type: 'all_techs_min_level';       trigger: EffectTrigger; minLevel: number }
  | { type: 'shared_bonus';              trigger: EffectTrigger; bonus: number }
  | { type: 'trade_tech_with_player';    trigger: EffectTrigger }
  | { type: 'allow_point_transfer';      trigger: EffectTrigger; maxPoints: number }
  | { type: 'view_opponents_cards';      trigger: EffectTrigger }
  | { type: 'bonus_per_high_tech';       trigger: EffectTrigger; minLevel: number; bonusPerTech: number; goldOnly: boolean }
  | { type: 'bonus_per_unfavorable';     trigger: EffectTrigger; bonusPerTile: number }
  | { type: 'bonus_per_favorable_ratio'; trigger: EffectTrigger; ratio: number; bonusPer: number }
  | { type: 'bonus_for_max_tech';        trigger: EffectTrigger; level: number; bonus: number; goldOnly: boolean }
  | { type: 'free_unit_per_high_tech';   trigger: EffectTrigger; minLevel: number; unit: UnitType; count: number }

  // ── Era III effects ──
  | { type: 'era3_attack_boost';         trigger: EffectTrigger; bonus: number }
  | { type: 'era3_heal_stack';           trigger: EffectTrigger }
  | { type: 'era3_free_recruit';         trigger: EffectTrigger; unit: UnitType }
  | { type: 'era3_gold_bonus';           trigger: EffectTrigger; amount: number }
  | { type: 'era3_extra_movement';       trigger: EffectTrigger; bonus: number }
  | { type: 'era3_global_passive_atk';   trigger: EffectTrigger; bonus: number };

export type Card = {
  id: string;
  name: string;
  type: 'world_era1' | 'era1' | 'world_era2' | 'era2' | 'world_era3' | 'era3';
  flavorText: string;        // Narrative (italics in UI)
  mechanicalText: string;    // Readable mechanical effect
  effects: CardEffect[];
};
