import type { GameState } from '../types/game.js';
import type { RelicCard } from '../types/cards.js';
import type { TerrainType } from '../types/terrain.js';
import type { CardEffect, EffectTrigger } from './types.js';
import { relicCardDeck } from './loader.js';
import { getRaceById } from '../races/index.js';
import { createRng } from '../state/random.js';
import { TECH_TYPES } from '../types/era2.js';
import { RACIAL_BONUSES } from '../era2/constants.js';

export class NotImplementedError extends Error {
  constructor(effectType: string) {
    super(`Effect "${effectType}" is not yet implemented`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Additional context that some effects need to resolve.
 * Expanded as more effects are implemented.
 */
export type EffectContext = {
  /** ID of the affected player (for era cards / personal relics) */
  playerId: string | null;
  /** Current trigger firing the effects */
  trigger: EffectTrigger;
  /** Optional target stack id — set when an Era III era card is played with a target. */
  targetStackId?: string;
};

/**
 * Applies a CardEffect to the GameState and returns the new state.
 * Effects that apply to all players (world cards) use playerId = null
 * and the dispatcher iterates over all players.
 */
export function applyEffect(
  state: GameState,
  effect: CardEffect,
  ctx: EffectContext,
): GameState {
  // Only execute if the trigger matches
  if (effect.trigger !== ctx.trigger) return state;

  switch (effect.type) {
    case 'modify_draw_count':
      return applyModifyDrawCount(state, effect, ctx);
    case 'modify_trade_limit':
      return applyModifyTradeLimit(state, effect, ctx);
    case 'skip_trade_phase':
      return applySkipTradePhase(state, effect, ctx);
    case 'bonus_per_terrain':
      return applyBonusPerTerrain(state, effect, ctx);
    case 'flat_bonus':
      return applyFlatBonus(state, effect, ctx);
    case 'free_tech_level':
      return applyFreeTechLevel(state, effect, ctx);
    case 'swap_relic':
      return applySwapRelic(state, effect, ctx);
    case 'grant_relic_to_all':
      return applyGrantRelicToAll(state, ctx);
    case 'draw_two_era_cards_keep_one':
      // Auto-resolve: keep the first dealt card (no interactive UI yet)
      return state;

    // ── Newly implemented effects ──
    case 'bonus_per_favorable':
      return applyBonusPerFavorable(state, effect, ctx);
    case 'bonus_per_road':
      return applyBonusPerRoad(state, effect, ctx);
    case 'bonus_for_all_terrains':
      return applyBonusForAllTerrains(state, effect, ctx);
    case 'all_players_bonus':
      return applyAllPlayersBonus(state, effect, ctx);
    case 'double_if_positive':
      return applyDoubleIfPositive(state, effect, ctx);
    case 'modify_road_requirement':
      // Stored on state for scoring to read
      return { ...state, roadRequirement: effect.newRequirement };
    case 'waive_road_requirement':
      return { ...state, roadRequirement: 0 };

    // ── Era I interactive/auto effects ──
    case 'discard_and_redraw':
      return applyDiscardAndRedraw(state, effect, ctx);
    case 'manual_pick':
      return applyManualPick(state, effect, ctx);
    case 'view_opponents_tiles':
      return applyViewOpponentsTiles(state, effect, ctx);
    case 'double_favorable_tiles':
      return applyDoubleFavorableTiles(state, effect, ctx);
    case 'return_tiles_to_pile':
      return applyReturnTilesToPile(state, effect, ctx);

    // ── Era I effects (completed in Phase E) ──
    case 'free_unit':
      return applyFreeUnit(state, effect, ctx);
    case 'scry_pile':
      return applyScryPile(state, effect, ctx);
    case 'extra_relic':
      return applyExtraRelic(state, effect, ctx);
    case 'preview_next_era_deck':
      return applyPreviewNextEraDeck(state, effect, ctx);

    // ── Era II effects ──
    case 'allow_tech_level_6':
      return applyAllowTechLevel6(state, effect, ctx);
    case 'modify_tech_cost':
      return applyModifyTechCost(state, effect, ctx);
    case 'modify_tech_cost_flat':
      return applyModifyTechCostFlat(state, effect, ctx);
    case 'player_choice_free_tech':
      return applyPlayerChoiceFreeTech(state, effect, ctx);
    case 'player_choice_tech_discount':
      return applyPlayerChoiceTechDiscount(state, effect, ctx);
    case 'bonus_to_weakest':
      return applyBonusToWeakest(state, effect, ctx);
    case 'allow_reallocation':
      return applyAllowReallocation(state, effect, ctx);
    case 'limit_tech_count':
      return applyLimitTechCount(state, effect, ctx);
    case 'bonus_to_highest_tech':
      return applyBonusToHighestTech(state, effect, ctx);
    case 'modify_transfer_ratio':
      return applyModifyTransferRatio(state, effect, ctx);
    case 'modify_give_ratio':
      return applyModifyGiveRatio(state, effect, ctx);
    case 'modify_receive_ratio':
      return applyModifyReceiveRatio(state, effect, ctx);
    case 'modify_surplus_ratio':
      return applyModifySurplusRatio(state, effect, ctx);
    case 'modify_doom_clock':
      return applyModifyDoomClock(state, effect, ctx);
    case 'all_techs_min_level':
      return applyAllTechsMinLevel(state, effect, ctx);
    case 'shared_bonus':
      return applySharedBonus(state, effect);
    case 'trade_tech_with_player':
      return applyTradeTechWithPlayer(state, effect, ctx);
    case 'allow_point_transfer':
      return applyAllowPointTransfer(state, effect, ctx);
    case 'view_opponents_cards':
      return applyViewOpponentsCards(state, effect, ctx);
    case 'bonus_per_high_tech':
      return applyBonusPerHighTech(state, effect, ctx);
    case 'bonus_per_unfavorable':
      return applyBonusPerUnfavorable(state, effect, ctx);
    case 'bonus_per_favorable_ratio':
      return applyBonusPerFavorableRatio(state, effect, ctx);
    case 'bonus_for_max_tech':
      return applyBonusForMaxTech(state, effect, ctx);
    case 'free_unit_per_high_tech':
      return applyFreeUnitPerHighTech(state, effect, ctx);

    // ── Era III effects ──
    case 'era3_attack_boost':
      return applyEra3AttackBoost(state, effect, ctx);
    case 'era3_heal_stack':
      return applyEra3HealStack(state, ctx);
    case 'era3_free_recruit':
      return applyEra3FreeRecruit(state, effect, ctx);
    case 'era3_gold_bonus':
      return applyEra3GoldBonus(state, effect, ctx);
    case 'era3_extra_movement':
      return applyEra3ExtraMovement(state, effect, ctx);
    case 'era3_global_passive_atk':
      return applyEra3GlobalPassiveAtk(state, effect);

    default: {
      // Exhaustive check — if TypeScript adds a new type, this fails at compile time
      const _exhaustive: never = effect;
      throw new Error(`Unknown effect type: ${(_exhaustive as CardEffect).type}`);
    }
  }
}

/**
 * Applies all effects from a list filtered by trigger.
 */
export function applyEffects(
  state: GameState,
  effects: CardEffect[],
  ctx: EffectContext,
): GameState {
  let s = state;
  for (const effect of effects) {
    s = applyEffect(s, effect, ctx);
  }
  return s;
}

// ── Implementations ──────────────────────────────────────────────

/**
 * modify_draw_count: adjusts how many tiles a player draws.
 * Stored as a modifier on the player for drawTiles to read.
 */
function applyModifyDrawCount(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_draw_count' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    return {
      ...p,
      drawCountModifier: (p.drawCountModifier ?? 0) + effect.delta,
    };
  });
  return { ...state, players };
}

/**
 * modify_trade_limit: changes the max number of tradeable tiles.
 * Stored on the player for the trade phase to read.
 */
function applyModifyTradeLimit(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_trade_limit' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    return {
      ...p,
      tradeLimit: effect.newLimit,
    };
  });
  return { ...state, players };
}

/**
 * skip_trade_phase: marks the trade phase as skipped entirely.
 */
function applySkipTradePhase(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'skip_trade_phase' }>,
  _ctx: EffectContext,
): GameState {
  return { ...state, skipTradePhase: true };
}

/**
 * bonus_per_terrain: grants extra points per tile of a given terrain.
 * Accumulated on the player as cardBonusPoints for scoring to read.
 */
function applyBonusPerTerrain(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_terrain' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const bonusPoints = p.tiles[effect.terrain] * effect.bonus;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + bonusPoints,
    };
  });
  return { ...state, players };
}

/**
 * flat_bonus: grants a fixed amount of extra points.
 */
function applyFlatBonus(
  state: GameState,
  effect: Extract<CardEffect, { type: 'flat_bonus' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + effect.bonus,
    };
  });
  return { ...state, players };
}

/**
 * free_tech_level: grants a free tech level + optional bonus points.
 * Stored for Era II to read at startup.
 */
function applyFreeTechLevel(
  state: GameState,
  effect: Extract<CardEffect, { type: 'free_tech_level' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const freeTechLevels = [...(p.freeTechLevels ?? []), { tech: effect.tech, level: effect.level }];
    const bonusPoints = (p.cardBonusPoints ?? 0) + (effect.bonusPoints ?? 0);
    return {
      ...p,
      freeTechLevels,
      cardBonusPoints: bonusPoints,
    };
  });
  return { ...state, players };
}

/**
 * swap_relic: the player swaps their relic for a random one from the deck.
 * Auto-resolved: picks the first available relic not already assigned.
 */
function applySwapRelic(
  state: GameState,
  effect: Extract<CardEffect, { type: 'swap_relic' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const assignedRelicIds = new Set(
    state.players.map(p => p.relic?.id).filter(Boolean),
  );
  const availableRelics = relicCardDeck.filter(r => !assignedRelicIds.has(r.id));
  if (availableRelics.length === 0) return state;

  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    // Pick from available relics (up to `choices` count, take the first)
    const newRelic = availableRelics[0];
    if (!newRelic) return p;
    return { ...p, relic: { ...newRelic, assignedTo: p.id } };
  });
  return { ...state, players };
}

/**
 * grant_relic_to_all: gives every player a relic from the deck.
 * Used by world cards to override the 4-player relic limit.
 */
function applyGrantRelicToAll(
  state: GameState,
  ctx: EffectContext,
): GameState {
  const assignedRelicIds = new Set(
    state.players.map(p => p.relic?.id).filter(Boolean),
  );
  const availableRelics = relicCardDeck.filter(r => !assignedRelicIds.has(r.id));

  let relicIndex = 0;
  const players = state.players.map(p => {
    if (p.relic) return p; // already has one
    const relic = availableRelics[relicIndex];
    if (!relic) return p;
    relicIndex++;
    return { ...p, relic: { ...relic, assignedTo: p.id } };
  });
  return { ...state, players };
}

/**
 * bonus_per_favorable: grants bonus points per tile of the player's favorable terrain.
 */
function applyBonusPerFavorable(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_favorable' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const race = getRaceById(p.raceId);
    const favorableCount = p.tiles[race.favorableTerrain as keyof typeof p.tiles] ?? 0;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + (favorableCount * effect.bonus),
    };
  });
  return { ...state, players };
}

/**
 * bonus_per_road: grants bonus points per road tile.
 */
function applyBonusPerRoad(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_road' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + (p.tiles.road * effect.bonus),
    };
  });
  return { ...state, players };
}

/**
 * bonus_for_all_terrains: grants bonus if all 4 productive terrains have >= minPerTerrain tiles.
 */
function applyBonusForAllTerrains(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_for_all_terrains' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const terrains = ['plain', 'mountain', 'forest', 'swamp'] as const;
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const allMet = terrains.every(t => p.tiles[t] >= effect.minPerTerrain);
    if (!allMet) return p;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + effect.bonus,
    };
  });
  return { ...state, players };
}

/**
 * all_players_bonus: grants flat bonus to ALL players (typically from world cards).
 * Respects the optional `condition` field (e.g., "any_player_has_relic").
 */
function applyAllPlayersBonus(
  state: GameState,
  effect: Extract<CardEffect, { type: 'all_players_bonus' }>,
  _ctx: EffectContext,
): GameState {
  // Check condition if present
  if (effect.condition) {
    switch (effect.condition) {
      case 'any_player_has_relic':
        if (!state.players.some(p => p.relic !== null)) return state;
        break;
      case 'all_players_same_terrain':
        // All players have the same favorable terrain — unlikely, skip bonus if not met
        {
          const favTerrains = new Set(state.players.map(p => getRaceById(p.raceId).favorableTerrain));
          if (favTerrains.size > 1) return state;
        }
        break;
      // Unknown conditions are treated as always-true for forwards compatibility
      default:
        break;
    }
  }

  const players = state.players.map(p => ({
    ...p,
    cardBonusPoints: (p.cardBonusPoints ?? 0) + effect.bonus,
  }));
  return { ...state, players };
}

/**
 * double_if_positive: doubles the player's terrain bonus if positive.
 * If clampNegativeToZero is true and terrain bonus is negative, sets the bonus to 0.
 * The terrain bonus is (favorable tiles - unfavorable tiles).
 * We store the extra as cardBonusPoints since terrainBonus is computed at scoring time.
 */
function applyDoubleIfPositive(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'double_if_positive' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const race = getRaceById(p.raceId);
    const favorableCount = p.tiles[race.favorableTerrain as keyof typeof p.tiles] ?? 0;
    const unfavorableCount = p.tiles[race.unfavorableTerrain as keyof typeof p.tiles] ?? 0;
    const terrainBonus = favorableCount - unfavorableCount;
    if (terrainBonus <= 0) {
      // Clamp negative to zero: add negative terrainBonus as bonus to cancel it out
      if (_effect.clampNegativeToZero && terrainBonus < 0) {
        return { ...p, cardBonusPoints: (p.cardBonusPoints ?? 0) + Math.abs(terrainBonus) };
      }
      return p;
    }
    // Double: add the terrain bonus again as card bonus (scoring already adds it once)
    return { ...p, cardBonusPoints: (p.cardBonusPoints ?? 0) + terrainBonus };
  });
  return { ...state, players };
}

// ── Era I interactive/auto effect implementations ────────────────

/**
 * discard_and_redraw: Player discards up to maxDiscard tiles and draws the same number.
 * - If forced: auto-discard random non-favorable, non-road tiles (no player choice)
 * - If not forced: set pendingEffect for player to choose which tiles to discard
 * - For world cards (playerId=null): applies to all players (forced auto-resolve)
 */
function applyDiscardAndRedraw(
  state: GameState,
  effect: Extract<CardEffect, { type: 'discard_and_redraw' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);

  if (effect.forced) {
    // Auto-resolve: randomly discard non-favorable, non-road tiles
    let s = state;
    for (const pid of targetIds) {
      s = autoDiscardAndRedraw(s, pid, effect.maxDiscard);
    }
    return s;
  }

  // Interactive: set pendingEffect on each target player
  // Bots auto-resolve; humans get a pending effect
  let s = state;
  for (const pid of targetIds) {
    const player = s.players.find(p => p.id === pid);
    if (!player) continue;

    if (player.isBot) {
      s = autoDiscardAndRedraw(s, pid, effect.maxDiscard);
    } else {
      const players = s.players.map(p =>
        p.id === pid
          ? { ...p, pendingEffect: { type: 'discard_and_redraw', params: { maxDiscard: effect.maxDiscard } } }
          : p,
      );
      s = { ...s, players };
    }
  }
  return s;
}

/** Auto-resolve discard and redraw: discard worst tiles, draw from pile */
function autoDiscardAndRedraw(state: GameState, playerId: string, maxDiscard: number): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  const player = state.players[playerIndex];
  const race = getRaceById(player.raceId);
  const rng = createRng(state.seed + 900 + playerIndex);

  // Build list of tile types to discard, preferring unfavorable terrain
  const terrainPriority: TerrainType[] = [
    race.unfavorableTerrain as TerrainType,
    ...(['plain', 'mountain', 'forest', 'swamp'] as const).filter(
      t => t !== race.favorableTerrain && t !== race.unfavorableTerrain,
    ),
  ];

  const tilesToDiscard: TerrainType[] = [];
  const tempTiles = { ...player.tiles };
  for (const terrain of terrainPriority) {
    while (tilesToDiscard.length < maxDiscard && tempTiles[terrain] > 0) {
      tilesToDiscard.push(terrain);
      tempTiles[terrain]--;
    }
  }

  if (tilesToDiscard.length === 0) return state;

  // Remove discarded tiles from player, add to pile
  const newTiles = { ...player.tiles };
  for (const t of tilesToDiscard) {
    newTiles[t]--;
  }

  // Draw from pile (random selection)
  let pile = [...state.tilePile, ...tilesToDiscard];
  const drawn: TerrainType[] = [];
  for (let i = 0; i < tilesToDiscard.length && pile.length > 0; i++) {
    const idx = Math.floor(rng() * pile.length);
    drawn.push(pile[idx]);
    pile.splice(idx, 1);
  }

  for (const t of drawn) {
    newTiles[t]++;
  }

  const players = [...state.players];
  players[playerIndex] = { ...player, tiles: newTiles, pendingEffect: undefined };
  return { ...state, players, tilePile: pile };
}

/**
 * manual_pick: Player manually picks N tiles from the top of the pile.
 * Sets pendingEffect with revealed tiles for the player to choose from.
 * Bots auto-pick the best tiles (favorable terrain first).
 */
function applyManualPick(
  state: GameState,
  effect: Extract<CardEffect, { type: 'manual_pick' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;

  for (const pid of targetIds) {
    const player = s.players.find(p => p.id === pid);
    if (!player) continue;

    // Reveal top N * 2 tiles from pile (player picks N from these)
    const revealCount = Math.min(effect.count * 2, s.tilePile.length);
    const revealed = s.tilePile.slice(0, revealCount);

    if (player.isBot) {
      // Bot picks best tiles: favorable terrain first
      const race = getRaceById(player.raceId);
      const sorted = [...revealed].sort((a, b) => {
        const va = a === race.favorableTerrain ? 10 : (race.terrainValues[a as keyof typeof race.terrainValues] ?? 0);
        const vb = b === race.favorableTerrain ? 10 : (race.terrainValues[b as keyof typeof race.terrainValues] ?? 0);
        return vb - va;
      });
      const picked = sorted.slice(0, effect.count);
      const remaining = [...revealed];
      for (const t of picked) {
        const idx = remaining.indexOf(t);
        if (idx !== -1) remaining.splice(idx, 1);
      }

      const newTiles = { ...player.tiles };
      for (const t of picked) {
        newTiles[t]++;
      }

      const newPile = [...remaining, ...s.tilePile.slice(revealCount)];
      const players = s.players.map(p =>
        p.id === pid ? { ...p, tiles: newTiles } : p,
      );
      s = { ...s, players, tilePile: newPile };
    } else {
      // Human: set pendingEffect with revealed tiles
      const players = s.players.map(p =>
        p.id === pid
          ? {
              ...p,
              pendingEffect: {
                type: 'manual_pick',
                params: { revealedTiles: revealed, pickCount: effect.count },
              },
            }
          : p,
      );
      s = { ...s, players };
    }
  }
  return s;
}

/**
 * view_opponents_tiles: Shows the player all opponents' tile distributions.
 * Sets pendingEffect with opponent data (dismiss to resolve).
 * Bots auto-dismiss.
 */
function applyViewOpponentsTiles(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'view_opponents_tiles' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;

  for (const pid of targetIds) {
    const player = s.players.find(p => p.id === pid);
    if (!player) continue;

    if (player.isBot) continue; // Bots don't need to see this

    const opponentData = s.players
      .filter(p => p.id !== pid)
      .map(p => ({ id: p.id, name: p.name, raceId: p.raceId, tiles: { ...p.tiles } }));

    const players = s.players.map(p =>
      p.id === pid
        ? { ...p, pendingEffect: { type: 'view_opponents_tiles', params: { opponents: opponentData } } }
        : p,
    );
    s = { ...s, players };
  }
  return s;
}

/**
 * double_favorable_tiles: N of the player's favorable terrain tiles count double.
 * Auto-resolve: add bonus = count * race terrain value for favorable terrain.
 */
function applyDoubleFavorableTiles(
  state: GameState,
  effect: Extract<CardEffect, { type: 'double_favorable_tiles' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const race = getRaceById(p.raceId);
    const favorableValue = race.terrainValues[race.favorableTerrain as keyof typeof race.terrainValues] ?? 0;
    const favorableCount = p.tiles[race.favorableTerrain as keyof typeof p.tiles] ?? 0;
    const doubleTiles = Math.min(effect.count, favorableCount);
    const bonus = doubleTiles * favorableValue;
    return {
      ...p,
      cardBonusPoints: (p.cardBonusPoints ?? 0) + bonus,
    };
  });
  return { ...state, players };
}

/**
 * return_tiles_to_pile: Remove N tiles from the player and return to pile.
 * Auto-resolve when random=true: pick random non-road tiles.
 */
function applyReturnTilesToPile(
  state: GameState,
  effect: Extract<CardEffect, { type: 'return_tiles_to_pile' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;

  for (const pid of targetIds) {
    const playerIndex = s.players.findIndex(p => p.id === pid);
    if (playerIndex === -1) continue;

    const player = s.players[playerIndex];
    const rng = createRng(s.seed + 950 + playerIndex);

    // Build flat list of removable tiles (non-road)
    const removable: TerrainType[] = [];
    for (const terrain of ['plain', 'mountain', 'forest', 'swamp'] as const) {
      for (let i = 0; i < player.tiles[terrain]; i++) {
        removable.push(terrain);
      }
    }

    // Randomly select tiles to remove
    const toRemove: TerrainType[] = [];
    const pool = [...removable];
    for (let i = 0; i < effect.count && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      toRemove.push(pool[idx]);
      pool.splice(idx, 1);
    }

    const newTiles = { ...player.tiles };
    for (const t of toRemove) {
      newTiles[t]--;
    }

    const players = [...s.players];
    players[playerIndex] = { ...player, tiles: newTiles };
    s = { ...s, players, tilePile: [...s.tilePile, ...toRemove] };
  }
  return s;
}

// ── Era I stub completions ───────────────────────────────────────

/**
 * free_unit: grants the player a free unit for Era III.
 * If `conditionTerrain`/`conditionCount` present, only grants if the player has enough of that terrain.
 */
function applyFreeUnit(
  state: GameState,
  effect: Extract<CardEffect, { type: 'free_unit' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    if (effect.conditionTerrain && effect.conditionCount != null) {
      const have = p.tiles[effect.conditionTerrain as keyof typeof p.tiles] ?? 0;
      if (have < effect.conditionCount) return p;
    }
    const unit = effect.unit as import('../types/era2.js').UnitType;
    const existing = p.freeUnits ?? [];
    const match = existing.find(g => g.unit === unit);
    const nextUnits = match
      ? existing.map(g => (g.unit === unit ? { ...g, count: g.count + effect.count } : g))
      : [...existing, { unit, count: effect.count }];
    return { ...p, freeUnits: nextUnits };
  });
  return { ...state, players };
}

/**
 * scry_pile: sets a pendingEffect showing the top N tiles of the pile so the player can peek.
 * Bots auto-dismiss (no strategic use at Easy/Medium).
 */
function applyScryPile(
  state: GameState,
  effect: Extract<CardEffect, { type: 'scry_pile' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;
  for (const pid of targetIds) {
    const player = s.players.find(p => p.id === pid);
    if (!player || player.isBot) continue;
    const revealed = s.tilePile.slice(0, Math.min(effect.count, s.tilePile.length));
    const players = s.players.map(p =>
      p.id === pid
        ? { ...p, pendingEffect: { type: 'scry_pile', params: { revealedTiles: revealed } } }
        : p,
    );
    s = { ...s, players };
  }
  return s;
}

/**
 * extra_relic: allow the player to pick extra relics beyond the default 1.
 * Stored on the player; the relics_deal phase honors this count when setting up choices.
 */
function applyExtraRelic(
  state: GameState,
  effect: Extract<CardEffect, { type: 'extra_relic' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    return { ...p, extraRelicsAllowed: (p.extraRelicsAllowed ?? 0) + effect.count };
  });
  return { ...state, players };
}

/**
 * preview_next_era_deck: shows the player N Era II cards they can peek at.
 * Informational — sets a pendingEffect the player can dismiss. The Era II deck
 * reveal itself happens in Phase E loader; we just stash a flag here.
 */
function applyPreviewNextEraDeck(
  state: GameState,
  effect: Extract<CardEffect, { type: 'preview_next_era_deck' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;
  for (const pid of targetIds) {
    const player = s.players.find(p => p.id === pid);
    if (!player || player.isBot) continue;
    const players = s.players.map(p =>
      p.id === pid
        ? {
            ...p,
            pendingEffect: {
              type: 'preview_next_era_deck',
              params: { count: effect.count, keepOne: effect.keepOne },
            },
          }
        : p,
    );
    s = { ...s, players };
  }
  return s;
}

// ── Era II handlers ──────────────────────────────────────────────

function mutateEra2(
  state: GameState,
  targetIds: string[],
  patch: (e2: NonNullable<GameState['players'][number]['era2State']>) => NonNullable<GameState['players'][number]['era2State']>,
): GameState {
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id) || !p.era2State) return p;
    return { ...p, era2State: patch(p.era2State) };
  });
  return { ...state, players };
}

function applyAllowTechLevel6(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'allow_tech_level_6' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({ ...e2, allowLevel6: true }));
}

function applyModifyTechCost(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_tech_cost' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => {
    const next = { ...e2 };
    const mods = { ...e2.costModifiers };
    if (effect.perLevel) {
      mods.perLevel = { ...mods.perLevel, [effect.tech]: mods.perLevel[effect.tech] + effect.delta };
    } else {
      mods.flat = { ...mods.flat, [effect.tech]: mods.flat[effect.tech] + effect.delta };
    }
    if (effect.minCost != null) mods.minCostPerLevel = effect.minCost;
    next.costModifiers = mods;
    return next;
  });
}

function applyModifyTechCostFlat(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_tech_cost_flat' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    costModifiers: {
      ...e2.costModifiers,
      flat: { ...e2.costModifiers.flat, [effect.tech]: e2.costModifiers.flat[effect.tech] + effect.delta },
    },
  }));
}

function applyPlayerChoiceFreeTech(
  state: GameState,
  effect: Extract<CardEffect, { type: 'player_choice_free_tech' }>,
  ctx: EffectContext,
): GameState {
  // Sets a pendingEffect asking which tech to receive N free levels in.
  // Bots: auto-pick the tech matching their racial bonus.
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;
  for (const pid of targetIds) {
    const pIdx = s.players.findIndex(p => p.id === pid);
    if (pIdx === -1) continue;
    const player = s.players[pIdx];
    if (player.isBot) {
      const tech = RACIAL_BONUSES[player.raceId]?.freeTech.tech ?? 'war';
      s = mutateEra2(s, [pid], e2 => ({
        ...e2,
        freeLevelsRemaining: { ...e2.freeLevelsRemaining, [tech]: e2.freeLevelsRemaining[tech] + effect.levels },
      }));
    } else {
      s = {
        ...s,
        players: s.players.map((p, i) =>
          i === pIdx
            ? { ...p, pendingEffect: { type: 'player_choice_free_tech', params: { levels: effect.levels }, resolutionKind: 'era2' as const } }
            : p,
        ),
      };
    }
  }
  return s;
}

function applyPlayerChoiceTechDiscount(
  state: GameState,
  effect: Extract<CardEffect, { type: 'player_choice_tech_discount' }>,
  ctx: EffectContext,
): GameState {
  // Bots: apply to their racial tech; humans get pendingEffect.
  const targetIds = getTargetPlayerIds(state, ctx);
  let s = state;
  for (const pid of targetIds) {
    const pIdx = s.players.findIndex(p => p.id === pid);
    if (pIdx === -1) continue;
    const player = s.players[pIdx];
    if (player.isBot) {
      const tech = RACIAL_BONUSES[player.raceId]?.freeTech.tech ?? 'war';
      s = mutateEra2(s, [pid], e2 => ({
        ...e2,
        costModifiers: {
          ...e2.costModifiers,
          flat: { ...e2.costModifiers.flat, [tech]: e2.costModifiers.flat[tech] + effect.delta },
        },
      }));
    } else {
      s = {
        ...s,
        players: s.players.map((p, i) =>
          i === pIdx
            ? { ...p, pendingEffect: { type: 'player_choice_tech_discount', params: { delta: effect.delta }, resolutionKind: 'era2' as const } }
            : p,
        ),
      };
    }
  }
  return s;
}

function applyBonusToWeakest(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_to_weakest' }>,
  _ctx: EffectContext,
): GameState {
  // Find the player with the fewest constructionPoints + pointsReceived - pointsGiven.
  const scored = state.players
    .filter(p => p.era2State)
    .map(p => {
      const e2 = p.era2State!;
      return { id: p.id, total: e2.constructionPoints + e2.pointsReceived - e2.pointsGiven };
    });
  if (scored.length === 0) return state;
  const min = Math.min(...scored.map(s => s.total));
  const weakestIds = scored.filter(s => s.total === min).map(s => s.id);
  return mutateEra2(state, weakestIds, e2 => ({ ...e2, constructionPoints: e2.constructionPoints + effect.bonus }));
}

function applyAllowReallocation(
  state: GameState,
  effect: Extract<CardEffect, { type: 'allow_reallocation' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    reallocationsAllowed: e2.reallocationsAllowed + effect.times,
  }));
}

function applyLimitTechCount(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'limit_tech_count' }>,
  _ctx: EffectContext,
): GameState {
  // Enforcement happens in the UI (tech allocation chooser disables extra techs).
  // The engine-level limit would require a proper locked-set field; deferred to Phase G.
  return state;
}

function applyBonusToHighestTech(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_to_highest_tech' }>,
  ctx: EffectContext,
): GameState {
  // If the player has `sourceTech` at the highest level across all players, grant +bonusLevels in `bonusTech`.
  const targetIds = getTargetPlayerIds(state, ctx);
  const maxSource = Math.max(
    0,
    ...state.players.map(p => p.era2State?.techLevels[effect.sourceTech] ?? 0),
  );
  return mutateEra2(state, targetIds, e2 => {
    if (e2.techLevels[effect.sourceTech] < maxSource) return e2;
    return {
      ...e2,
      techLevels: {
        ...e2.techLevels,
        [effect.bonusTech]: Math.min(5, e2.techLevels[effect.bonusTech] + effect.bonusLevels),
      },
      baselineTechLevels: {
        ...e2.baselineTechLevels,
        [effect.bonusTech]: Math.min(5, e2.baselineTechLevels[effect.bonusTech] + effect.bonusLevels),
      },
    };
  });
}

function applyModifyTransferRatio(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_transfer_ratio' }>,
  ctx: EffectContext,
): GameState {
  // Shorthand for "set give + receive both to this ratio".
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    transferModifiers: { ...e2.transferModifiers, giveRatio: effect.ratio, receiveRatio: effect.ratio },
  }));
}

function applyModifyGiveRatio(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_give_ratio' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    transferModifiers: { ...e2.transferModifiers, giveRatio: e2.transferModifiers.giveRatio * effect.ratio },
  }));
}

function applyModifyReceiveRatio(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_receive_ratio' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    transferModifiers: { ...e2.transferModifiers, receiveRatio: e2.transferModifiers.receiveRatio * effect.ratio },
  }));
}

function applyModifySurplusRatio(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_surplus_ratio' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => ({
    ...e2,
    transferModifiers: { ...e2.transferModifiers, surplusRatio: effect.ratio },
  }));
}

function applyModifyDoomClock(
  state: GameState,
  effect: Extract<CardEffect, { type: 'modify_doom_clock' }>,
  _ctx: EffectContext,
): GameState {
  if (effect.modeRestriction && effect.modeRestriction === 'chronicle') {
    // Chronicle mode not implemented yet — no-op.
    return state;
  }
  const current = state.doomClock ?? 0;
  if (current === 0) return state; // disabled
  return { ...state, doomClock: Math.max(0, current + effect.delta) };
}

function applyAllTechsMinLevel(
  state: GameState,
  effect: Extract<CardEffect, { type: 'all_techs_min_level' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => {
    const techLevels = { ...e2.techLevels };
    const baseline = { ...e2.baselineTechLevels };
    for (const t of TECH_TYPES) {
      if (techLevels[t] < effect.minLevel) techLevels[t] = effect.minLevel;
      if (baseline[t] < effect.minLevel) baseline[t] = effect.minLevel;
    }
    return { ...e2, techLevels, baselineTechLevels: baseline };
  });
}

function applySharedBonus(
  state: GameState,
  effect: Extract<CardEffect, { type: 'shared_bonus' }>,
): GameState {
  // Grants bonus constructionPoints to all players.
  const targetIds = state.players.map(p => p.id);
  return mutateEra2(state, targetIds, e2 => ({ ...e2, constructionPoints: e2.constructionPoints + effect.bonus }));
}

function applyTradeTechWithPlayer(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'trade_tech_with_player' }>,
  ctx: EffectContext,
): GameState {
  // Interactive effect — for now stash a pending marker. UI/bots pick counterparty + tech.
  if (!ctx.playerId) return state;
  const players = state.players.map(p =>
    p.id === ctx.playerId
      ? { ...p, pendingEffect: { type: 'trade_tech_with_player', params: {}, resolutionKind: 'era2' as const } }
      : p,
  );
  return { ...state, players };
}

function applyAllowPointTransfer(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'allow_point_transfer' }>,
  _ctx: EffectContext,
): GameState {
  // In current model everyone already can transfer freely; this is a no-op marker
  // (kept for future variants where transfers are gated).
  return state;
}

function applyViewOpponentsCards(
  state: GameState,
  _effect: Extract<CardEffect, { type: 'view_opponents_cards' }>,
  ctx: EffectContext,
): GameState {
  if (!ctx.playerId) return state;
  const viewer = state.players.find(p => p.id === ctx.playerId);
  if (!viewer || viewer.isBot) return state;
  const opponents = state.players
    .filter(p => p.id !== ctx.playerId)
    .map(p => ({
      id: p.id,
      name: p.name,
      chosenEra2Card: p.era2State?.chosenEra2Card ?? null,
      eraCards: p.eraCards.map(c => ({ id: c.id, name: c.name })),
    }));
  const players = state.players.map(p =>
    p.id === ctx.playerId
      ? { ...p, pendingEffect: { type: 'view_opponents_cards', params: { opponents }, resolutionKind: 'era2' as const } }
      : p,
  );
  return { ...state, players };
}

function applyBonusPerHighTech(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_high_tech' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => {
    const count = TECH_TYPES.filter(t => e2.techLevels[t] >= effect.minLevel).length;
    const amount = count * effect.bonusPerTech;
    if (effect.goldOnly) return { ...e2, goldCoins: e2.goldCoins + amount };
    return { ...e2, constructionPoints: e2.constructionPoints + amount };
  });
}

function applyBonusPerUnfavorable(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_unfavorable' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const race = getRaceById(p.raceId);
    const count = p.tiles[race.unfavorableTerrain as keyof typeof p.tiles] ?? 0;
    return { ...p, cardBonusPoints: (p.cardBonusPoints ?? 0) + count * effect.bonusPerTile };
  });
  return { ...state, players };
}

function applyBonusPerFavorableRatio(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_per_favorable_ratio' }>,
  ctx: EffectContext,
): GameState {
  const targetIds = getTargetPlayerIds(state, ctx);
  const players = state.players.map(p => {
    if (!targetIds.includes(p.id)) return p;
    const race = getRaceById(p.raceId);
    const fav = p.tiles[race.favorableTerrain as keyof typeof p.tiles] ?? 0;
    const units = Math.floor(fav / Math.max(1, effect.ratio));
    return { ...p, cardBonusPoints: (p.cardBonusPoints ?? 0) + units * effect.bonusPer };
  });
  return { ...state, players };
}

function applyBonusForMaxTech(
  state: GameState,
  effect: Extract<CardEffect, { type: 'bonus_for_max_tech' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => {
    const hasMax = TECH_TYPES.some(t => e2.techLevels[t] >= effect.level);
    if (!hasMax) return e2;
    if (effect.goldOnly) return { ...e2, goldCoins: e2.goldCoins + effect.bonus };
    return { ...e2, constructionPoints: e2.constructionPoints + effect.bonus };
  });
}

function applyFreeUnitPerHighTech(
  state: GameState,
  effect: Extract<CardEffect, { type: 'free_unit_per_high_tech' }>,
  ctx: EffectContext,
): GameState {
  return mutateEra2(state, getTargetPlayerIds(state, ctx), e2 => {
    const count = TECH_TYPES.filter(t => e2.techLevels[t] >= effect.minLevel).length;
    if (count === 0) return e2;
    const totalUnits = count * effect.count;
    const existing = e2.freeUnitsForEra3;
    const match = existing.find(g => g.unit === effect.unit);
    const next = match
      ? existing.map(g => (g.unit === effect.unit ? { ...g, count: g.count + totalUnits } : g))
      : [...existing, { unit: effect.unit, count: totalUnits }];
    return { ...e2, freeUnitsForEra3: next };
  });
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * If playerId is null (world card), applies to all players.
 * If it's a specific ID, applies only to that player.
 */
function getTargetPlayerIds(state: GameState, ctx: EffectContext): string[] {
  if (ctx.playerId === null) {
    return state.players.map(p => p.id);
  }
  return [ctx.playerId];
}

// ── Era III effect implementations ───────────────────────────────
//
// All Era III effects fire with trigger 'on_era3_play' (era cards, self-target)
// or 'on_era3_start' (world cards, all-players broadcast). The dispatcher's
// trigger guard has already matched at this point.

function ensureTurnEffects(state: GameState): GameState {
  if (state.era3TurnEffects) return state;
  return {
    ...state,
    era3TurnEffects: { attackBoost: {}, movementBonus: {} },
  };
}

function applyEra3AttackBoost(
  state: GameState,
  effect: Extract<CardEffect, { type: 'era3_attack_boost' }>,
  ctx: EffectContext,
): GameState {
  const s = ensureTurnEffects(state);
  const te = s.era3TurnEffects!;
  const targets = getTargetPlayerIds(state, ctx);
  const next = { ...te.attackBoost };
  for (const pid of targets) next[pid] = (next[pid] ?? 0) + effect.bonus;
  return { ...s, era3TurnEffects: { ...te, attackBoost: next } };
}

function applyEra3ExtraMovement(
  state: GameState,
  effect: Extract<CardEffect, { type: 'era3_extra_movement' }>,
  ctx: EffectContext,
): GameState {
  const s = ensureTurnEffects(state);
  const te = s.era3TurnEffects!;
  const targets = getTargetPlayerIds(state, ctx);
  const next = { ...te.movementBonus };
  for (const pid of targets) next[pid] = (next[pid] ?? 0) + effect.bonus;

  // Immediately boost currently-owned stacks' movementLeft for the acting
  // player so the bonus is usable this turn.
  const stacks = { ...(s.era3Stacks ?? {}) };
  for (const pid of targets) {
    for (const [sid, stack] of Object.entries(stacks)) {
      if (stack.ownerId !== pid) continue;
      stacks[sid] = { ...stack, movementLeft: stack.movementLeft + effect.bonus };
    }
  }
  return { ...s, era3TurnEffects: { ...te, movementBonus: next }, era3Stacks: stacks };
}

function applyEra3FreeRecruit(
  state: GameState,
  effect: Extract<CardEffect, { type: 'era3_free_recruit' }>,
  ctx: EffectContext,
): GameState {
  // Inline recruitment with gold=free semantics, so we don't recurse into the
  // recruitUnit validator (which would reject due to the per-turn cap).
  const targets = getTargetPlayerIds(state, ctx);
  let s = ensureTurnEffects(state);
  for (const pid of targets) {
    s = freeRecruitFor(s, pid, effect.unit);
  }
  return s;
}

function freeRecruitFor(
  state: GameState,
  playerId: string,
  unitType: Extract<CardEffect, { type: 'era3_free_recruit' }>['unit'],
): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const player = state.players.find(p => p.id === playerId);
  if (!player?.era3State || player.era3State.eliminated) return state;
  const capCoord = player.era3State.capitalCoord;
  const capKey = `${capCoord.q},${capCoord.r}`;
  const capHex = state.map.hexes[capKey];
  if (!capHex) return state;

  const newStacks = { ...state.era3Stacks };
  const newHexes = { ...state.map.hexes };
  // Reuse existing stack if owned by this player and not full; else create new.
  let stackId = capHex.stackId;
  const counters = countAllUnits(newStacks);
  const newUnit = {
    id: `unit_${state.seed}_c_${counters}`,
    type: unitType,
    ownerId: playerId,
    // defense + 2 baseline HP (kept consistent with init.ts)
    currentHp: unitMaxHp(unitType),
    hasMovedThisTurn: true,
    hasAttackedThisTurn: true,
  };

  if (stackId && newStacks[stackId]?.ownerId === playerId && newStacks[stackId].units.length < 6) {
    const existing = newStacks[stackId];
    newStacks[stackId] = { ...existing, units: [...existing.units, newUnit] };
  } else if (!stackId || !newStacks[stackId]) {
    const sidx = Object.keys(newStacks).length;
    stackId = `stack_${state.seed}_c_${sidx}`;
    newStacks[stackId] = {
      id: stackId,
      ownerId: playerId,
      units: [newUnit],
      position: capCoord,
      movementLeft: 0,
    };
    newHexes[capKey] = { ...capHex, stackId };
  } else {
    // Capital hex is held by another player's/Wrought stack, or full — skip.
    return state;
  }

  return { ...state, era3Stacks: newStacks, map: { ...state.map, hexes: newHexes } };
}

function unitMaxHp(type: Extract<CardEffect, { type: 'era3_free_recruit' }>['unit']): number {
  // Local copy of the HP rule (defense + 2). Matches era3/init.ts.
  switch (type) {
    case 'infantry': return 3;
    case 'ranged':   return 4;
    case 'mounted':  return 4;
    case 'siege':    return 4;
    case 'flying':   return 5;
  }
}

function countAllUnits(stacks: NonNullable<GameState['era3Stacks']>): number {
  let n = 0;
  for (const s of Object.values(stacks)) n += s.units.length;
  return n;
}

function applyEra3HealStack(state: GameState, ctx: EffectContext): GameState {
  if (!state.era3Stacks) return state;
  const targetId = ctx.targetStackId;
  // If a target is specified, heal that stack if owned by ctx.playerId.
  // Else heal every stack owned by targets.
  const stacks = { ...state.era3Stacks };
  const owners = getTargetPlayerIds(state, ctx);
  if (targetId) {
    const stack = stacks[targetId];
    if (stack && owners.includes(stack.ownerId)) {
      stacks[targetId] = {
        ...stack,
        units: stack.units.map(u => ({ ...u, currentHp: unitMaxHp(u.type as never) })),
      };
    }
  } else {
    for (const [sid, stack] of Object.entries(stacks)) {
      if (!owners.includes(stack.ownerId)) continue;
      stacks[sid] = {
        ...stack,
        units: stack.units.map(u => ({ ...u, currentHp: unitMaxHp(u.type as never) })),
      };
    }
  }
  return { ...state, era3Stacks: stacks };
}

function applyEra3GoldBonus(
  state: GameState,
  effect: Extract<CardEffect, { type: 'era3_gold_bonus' }>,
  ctx: EffectContext,
): GameState {
  const targets = getTargetPlayerIds(state, ctx);
  return {
    ...state,
    players: state.players.map(p => {
      if (!targets.includes(p.id) || !p.era3State) return p;
      return {
        ...p,
        era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins + effect.amount },
      };
    }),
  };
}

function applyEra3GlobalPassiveAtk(
  state: GameState,
  effect: Extract<CardEffect, { type: 'era3_global_passive_atk' }>,
): GameState {
  // Stacks additively with any prior world_era3 bonus (there's only one world
  // card per game, but a future card could stack — keep it additive).
  return {
    ...state,
    era3PassiveAttackBonus: (state.era3PassiveAttackBonus ?? 0) + effect.bonus,
  };
}
