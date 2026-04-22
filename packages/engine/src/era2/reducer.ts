import type { GameAction } from '../types/actions.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { PlayerEra2State, TechType } from '../types/era2.js';
import { TECH_TYPES } from '../types/era2.js';
import { calculateTechCost, convertSurplusToGold } from './costs.js';
import { isEra2PhaseComplete, nextEra2Phase } from './phases.js';
import {
  proposeTransfer,
  acceptTransfer,
  rejectTransfer,
  markKingsTableReady,
} from './kings-table.js';
import { eraCardDeckEra2 } from '../cards/loader.js';
import { RACE_TECH_MAX } from './constants.js';
import { applyEffects } from '../cards/effect-dispatcher.js';
import { createRng, shuffle } from '../state/random.js';
import { transitionEra2ToEra3 } from '../era3/transition.js';

function requirePlayer(state: GameState, playerId: string): [number, Player] {
  const idx = state.players.findIndex(p => p.id === playerId);
  if (idx === -1) throw new Error(`Player not found: ${playerId}`);
  return [idx, state.players[idx]];
}

function requireEra2(player: Player): PlayerEra2State {
  if (!player.era2State) throw new Error(`Player ${player.id} has no Era II state`);
  return player.era2State;
}

function updatePlayerEra2(
  state: GameState,
  playerId: string,
  patch: (s: PlayerEra2State, p: Player) => PlayerEra2State,
): GameState {
  const [idx, player] = requirePlayer(state, playerId);
  const era2 = requireEra2(player);
  const nextEra2 = patch(era2, player);
  const players = [...state.players];
  players[idx] = { ...player, era2State: nextEra2 };
  return { ...state, players };
}

/**
 * Compute the total spent across all 4 techs for a player, using their
 * current modifiers and free levels. Level-6 gating is per-player.
 */
function totalSpentForPlayer(era2: PlayerEra2State): number {
  let total = 0;
  for (const tech of TECH_TYPES) {
    const { totalCost } = calculateTechCost(
      tech,
      era2.baselineTechLevels[tech],
      era2.techLevels[tech],
      era2.freeLevelsRemaining[tech],
      {
        flat: era2.costModifiers.flat[tech],
        perLevel: era2.costModifiers.perLevel[tech],
        minCostPerLevel: era2.costModifiers.minCostPerLevel,
      },
      era2.allowLevel6,
    );
    total += totalCost;
  }
  return total;
}

/**
 * Era II reducer — handles tech allocation, surplus conversion, and phase advancement.
 * Kings Table transfers (PROPOSE/ACCEPT/REJECT/MARK_READY) are handled in `kings-table.ts`
 * and wired in Phase D.
 */
export function era2Reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ADVANCE_ERA2_PHASE':
      return advanceEra2Phase(state);
    case 'CHOOSE_ERA2_CARD':
      return chooseEra2Card(state, action.playerId, action.cardId);
    case 'SET_TECH_LEVEL':
      return setTechLevel(state, action.playerId, action.tech, action.targetLevel);
    case 'RESET_ALLOCATION':
      return resetAllocation(state, action.playerId);
    case 'CONFIRM_ALLOCATION':
      return confirmAllocation(state, action.playerId);
    case 'CONVERT_SURPLUS':
      return convertSurplus(state, action.playerId);
    case 'PROPOSE_TRANSFER':
      return proposeTransfer(state, action.fromPlayerId, action.toPlayerId, action.pointsOffered);
    case 'ACCEPT_TRANSFER':
      return acceptTransfer(state, action.transferId, action.playerId);
    case 'REJECT_TRANSFER':
      return rejectTransfer(state, action.transferId, action.playerId);
    case 'MARK_KINGS_TABLE_READY':
      return markKingsTableReady(state, action.playerId);
    case 'RESOLVE_EFFECT':
      return resolveEra2Effect(state, action.playerId, action.resolution);
    default:
      return state;
  }
}

function resolveEra2Effect(
  state: GameState,
  playerId: string,
  resolution: Record<string, unknown>,
): GameState {
  const [idx, player] = requirePlayer(state, playerId);
  const pending = player.pendingEffect;
  if (!pending) return state;
  if (pending.resolutionKind !== 'era2') return state;

  const clearPending = (s: GameState): GameState => ({
    ...s,
    players: s.players.map((p, i) => (i === idx ? { ...p, pendingEffect: undefined } : p)),
  });

  switch (pending.type) {
    case 'player_choice_free_tech': {
      const tech = resolution.tech as TechType | null | undefined;
      const levels = (pending.params.levels as number) ?? 1;
      if (!tech || !TECH_TYPES.includes(tech)) {
        // Skip / invalid pick — just clear so the game can progress.
        return clearPending(state);
      }
      const s = updatePlayerEra2(state, playerId, (e2) => ({
        ...e2,
        freeLevelsRemaining: {
          ...e2.freeLevelsRemaining,
          [tech]: e2.freeLevelsRemaining[tech] + levels,
        },
      }));
      return clearPending(s);
    }
    case 'player_choice_tech_discount': {
      const tech = resolution.tech as TechType | null | undefined;
      const delta = (pending.params.delta as number) ?? 0;
      if (!tech || !TECH_TYPES.includes(tech)) return clearPending(state);
      const s = updatePlayerEra2(state, playerId, (e2) => ({
        ...e2,
        costModifiers: {
          ...e2.costModifiers,
          flat: { ...e2.costModifiers.flat, [tech]: e2.costModifiers.flat[tech] + delta },
        },
      }));
      return clearPending(s);
    }
    case 'trade_tech_with_player':
    case 'view_opponents_cards':
      // Informational / stubbed — just dismiss.
      return clearPending(state);
    default:
      return clearPending(state);
  }
}

function advanceEra2Phase(state: GameState): GameState {
  if (!state.era2Phase) return state;
  if (!isEra2PhaseComplete(state)) return state;

  const next = nextEra2Phase(state.era2Phase);
  if (next === state.era2Phase) return state;

  let out: GameState = { ...state, era2Phase: next };

  if (next === 'era_cards_deal') {
    // Deal 3 Era II cards per player as choices.
    const rng = createRng(state.seed + 104729);
    const shuffledEra = shuffle([...eraCardDeckEra2], rng);
    const CHOICES_PER_PLAYER = 3;
    out = {
      ...out,
      players: out.players.map((p, i) => {
        if (!p.era2State) return p;
        const start = i * CHOICES_PER_PLAYER;
        const choices = shuffledEra
          .slice(start, start + CHOICES_PER_PLAYER)
          .map(c => ({ ...c }));
        return {
          ...p,
          era2State: { ...p.era2State, pendingCardChoices: choices },
        };
      }),
    };
  }

  if (next === 'apply_era1_effects') {
    // Fire chosen Era II card's on_era2_start effects for each player.
    for (const p of out.players) {
      const card = p.era2State?.chosenEra2Card;
      if (!card) continue;
      out = applyEffects(out, card.effects, {
        playerId: p.id,
        trigger: 'on_era2_start',
      });
    }
  }

  if (next === 'kings_table') {
    // Fire kings_table_open from chosen Era II cards (if any).
    for (const p of out.players) {
      const card = p.era2State?.chosenEra2Card;
      if (!card) continue;
      out = applyEffects(out, card.effects, {
        playerId: p.id,
        trigger: 'kings_table_open',
      });
    }
    // Also fire world card kings_table_open effects.
    if (out.worldCardEra2) {
      out = applyEffects(out, out.worldCardEra2.effects, {
        playerId: null,
        trigger: 'kings_table_open',
      });
    }
  }

  if (next === 'complete') {
    // Fire on_era2_close from chosen cards + world card.
    for (const p of out.players) {
      const card = p.era2State?.chosenEra2Card;
      if (!card) continue;
      out = applyEffects(out, card.effects, {
        playerId: p.id,
        trigger: 'on_era2_close',
      });
    }
    if (out.worldCardEra2) {
      out = applyEffects(out, out.worldCardEra2.effects, {
        playerId: null,
        trigger: 'on_era2_close',
      });
    }
    // Transition into Era III: generate map, place initial stacks, set
    // era3Phase='awaiting_next_session' (Session 1 scope).
    out = transitionEra2ToEra3(out);
    // Fire on_era3_start effects from Era I/II cards + world cards.
    for (const p of out.players) {
      for (const card of p.eraCards ?? []) {
        out = applyEffects(out, card.effects, { playerId: p.id, trigger: 'on_era3_start' });
      }
      const era2Card = p.era2State?.chosenEra2Card;
      if (era2Card) {
        out = applyEffects(out, era2Card.effects, { playerId: p.id, trigger: 'on_era3_start' });
      }
    }
    if (out.worldCard) {
      out = applyEffects(out, out.worldCard.effects, { playerId: null, trigger: 'on_era3_start' });
    }
    if (out.worldCardEra2) {
      out = applyEffects(out, out.worldCardEra2.effects, { playerId: null, trigger: 'on_era3_start' });
    }
  }

  if (next === 'tech_allocation' || next === 'review') {
    // hasConfirmed is reused as a per-phase gate — reset on entry.
    out = {
      ...out,
      players: out.players.map(p =>
        p.era2State ? { ...p, era2State: { ...p.era2State, hasConfirmed: false } } : p,
      ),
    };
  }

  return out;
}

function chooseEra2Card(state: GameState, playerId: string, cardId: string): GameState {
  return updatePlayerEra2(state, playerId, (era2) => {
    const choices = era2.pendingCardChoices ?? [];
    const chosen = choices.find(c => c.id === cardId);
    if (!chosen) throw new Error(`Era II card ${cardId} is not among choices for ${playerId}`);
    if (era2.chosenEra2Card) throw new Error(`Player ${playerId} already chose an Era II card`);
    return {
      ...era2,
      chosenEra2Card: { ...chosen, assignedTo: playerId },
      pendingCardChoices: [],
    };
  });
}

function setTechLevel(
  state: GameState,
  playerId: string,
  tech: TechType,
  targetLevel: number,
): GameState {
  if (state.era2Phase !== 'tech_allocation') {
    throw new Error('SET_TECH_LEVEL only allowed during tech_allocation');
  }

  return updatePlayerEra2(state, playerId, (era2) => {
    if (era2.hasConfirmed) throw new Error(`Player ${playerId} already confirmed allocation`);
    if (era2.lockedOutTech === tech) throw new Error(`Tech ${tech} is locked for ${playerId}`);
    if (targetLevel < era2.baselineTechLevels[tech]) {
      throw new Error(`Target level ${targetLevel} is below the free baseline ${era2.baselineTechLevels[tech]}`);
    }
    // Per-race max cap (4–6 depending on race profile)
    const raceMax = RACE_TECH_MAX[state.players.find(p => p.id === playerId)!.raceId as keyof typeof RACE_TECH_MAX]?.[tech] ?? 5;
    if (targetLevel > raceMax) throw new Error(`Tech ${tech} is capped at level ${raceMax} for this race`);
    if (targetLevel > 5 && !era2.allowLevel6) {
      throw new Error('Level 6 requires the "Forja del Destino" world card');
    }
    if (targetLevel > 6) throw new Error('Target level cannot exceed 6');

    const nextTechLevels: Record<TechType, number> = { ...era2.techLevels, [tech]: targetLevel };

    // Validate budget with the candidate allocation.
    let spent = 0;
    for (const t of TECH_TYPES) {
      const { totalCost } = calculateTechCost(
        t,
        era2.baselineTechLevels[t],
        nextTechLevels[t],
        era2.freeLevelsRemaining[t],
        {
          flat: era2.costModifiers.flat[t],
          perLevel: era2.costModifiers.perLevel[t],
          minCostPerLevel: era2.costModifiers.minCostPerLevel,
        },
        era2.allowLevel6,
      );
      spent += totalCost;
    }

    const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
    if (spent > budget) {
      throw new Error(
        `Not enough points: budget ${budget}, would spend ${spent}`,
      );
    }

    return {
      ...era2,
      techLevels: nextTechLevels,
      pointsSpent: spent,
    };
  });
}

function resetAllocation(state: GameState, playerId: string): GameState {
  if (state.era2Phase !== 'tech_allocation') {
    throw new Error('RESET_ALLOCATION only allowed during tech_allocation');
  }

  return updatePlayerEra2(state, playerId, (era2) => {
    if (era2.hasConfirmed) throw new Error(`Player ${playerId} already confirmed`);
    if (era2.reallocationsAllowed > 0 && era2.reallocationsUsed >= era2.reallocationsAllowed) {
      throw new Error('No more reallocations allowed');
    }

    return {
      ...era2,
      techLevels: { ...era2.baselineTechLevels },
      pointsSpent: 0,
      reallocationsUsed: era2.reallocationsUsed + 1,
    };
  });
}

function confirmAllocation(state: GameState, playerId: string): GameState {
  // Accepts on tech_allocation, review phases (used for review confirmation too).
  if (state.era2Phase !== 'tech_allocation' && state.era2Phase !== 'review') {
    throw new Error('CONFIRM_ALLOCATION only allowed during tech_allocation or review');
  }

  return updatePlayerEra2(state, playerId, (era2) => {
    if (era2.hasConfirmed) return era2; // idempotent
    // Sanity-check budget before locking in.
    const spent = totalSpentForPlayer(era2);
    const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
    if (spent > budget) {
      throw new Error(`Cannot confirm: overspent (${spent} > ${budget})`);
    }
    return { ...era2, pointsSpent: spent, hasConfirmed: true };
  });
}

function convertSurplus(state: GameState, playerId: string): GameState {
  if (state.era2Phase !== 'convert_surplus') {
    throw new Error('CONVERT_SURPLUS only allowed during convert_surplus phase');
  }

  return updatePlayerEra2(state, playerId, (era2) => {
    if (era2.hasConvertedSurplus) return era2; // idempotent — prevents double gold grant
    const surplus = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven - era2.pointsSpent;
    if (surplus <= 0) {
      return { ...era2, hasConvertedSurplus: true };
    }
    const gold = convertSurplusToGold(surplus, era2.transferModifiers.surplusRatio);
    return { ...era2, goldCoins: era2.goldCoins + gold, hasConvertedSurplus: true };
  });
}
