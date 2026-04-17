import type { GameState } from '../types/game.js';
import type { RelicCard } from '../types/cards.js';
import type { TerrainType } from '../types/terrain.js';
import type { CardEffect, EffectTrigger } from './types.js';
import { relicCardDeck } from './loader.js';
import { getRaceById } from '../races/index.js';
import { createRng } from '../state/random.js';

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

    // ── Stubs — effects for Era II/III ──
    case 'free_unit':
    case 'scry_pile':
    case 'extra_relic':
    case 'preview_next_era_deck':
      // These effects are silently skipped (Era II/III not yet implemented).
      return state;

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
