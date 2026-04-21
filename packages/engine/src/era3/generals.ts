import type { GameState } from '../types/game.js';
import type { General, Stack } from '../types/era3.js';
import type { RaceId } from '../types/race.js';
import { GENERAL_ATTACK_BONUS, GENERAL_DEFENSE_BONUS, GENERAL_MIN_STACK_SIZE } from './constants.js';

/**
 * Default starting general names per race. Players begin Era III with exactly
 * one of these in reserve; additional generals are unlocked by Era III cards.
 */
const RACE_GENERAL_NAMES: Record<RaceId, string> = {
  elf: 'Aelindra Silvermoon',
  dwarf: 'Thrain Stoneheart',
  human: 'Marcus Valerius',
  halfelf: 'Lyra Duskborn',
  orc: 'Grull Ironfang',
  giant: 'Kormag Earthshaker',
  goblin: 'Zrik the Cunning',
  halforc: 'Varn Bloodoath',
};

/**
 * Create the starting general for a given player. Called during the Era II →
 * Era III transition so every active player has one commander ready to assign.
 */
export function createStartingGeneral(
  playerId: string,
  raceId: RaceId,
  seed: number,
  index: number,
): General {
  return {
    id: `general_${seed}_${index}`,
    name: RACE_GENERAL_NAMES[raceId],
    ownerId: playerId,
    attackBonus: GENERAL_ATTACK_BONUS,
    defenseBonus: GENERAL_DEFENSE_BONUS,
    assignedStackId: null,
  };
}

/**
 * Assign one of the player's unassigned generals to a stack. The stack must
 * meet GENERAL_MIN_STACK_SIZE and already not have a general. Returns the new
 * state (immutable). Throws on invalid preconditions.
 */
export function assignGeneral(
  state: GameState,
  playerId: string,
  generalId: string,
  stackId: string,
): GameState {
  if (!state.era3Stacks) return state;
  const stack = state.era3Stacks[stackId];
  if (!stack) throw new Error(`Unknown stack ${stackId}`);
  if (stack.ownerId !== playerId) throw new Error('You do not own that stack');
  if (stack.units.length < GENERAL_MIN_STACK_SIZE) {
    throw new Error(`Stack needs ≥${GENERAL_MIN_STACK_SIZE} units for a general`);
  }
  if (stack.generalId) throw new Error('Stack already has a general');

  const players = state.players.map(p => {
    if (p.id !== playerId || !p.era3State) return p;
    const generals = p.era3State.generals ?? [];
    const general = generals.find(g => g.id === generalId);
    if (!general) throw new Error(`General ${generalId} not in player roster`);
    if (general.assignedStackId) throw new Error('General already assigned elsewhere');
    return {
      ...p,
      era3State: {
        ...p.era3State,
        generals: generals.map(g =>
          g.id === generalId ? { ...g, assignedStackId: stackId } : g,
        ),
      },
    };
  });

  return {
    ...state,
    players,
    era3Stacks: {
      ...state.era3Stacks,
      [stackId]: { ...stack, generalId },
    },
  };
}

/** Unassign the general from a stack, returning it to the player's reserve. */
export function unassignGeneral(state: GameState, playerId: string, stackId: string): GameState {
  if (!state.era3Stacks) return state;
  const stack = state.era3Stacks[stackId];
  if (!stack) throw new Error(`Unknown stack ${stackId}`);
  if (stack.ownerId !== playerId) throw new Error('You do not own that stack');
  if (!stack.generalId) return state;

  const generalId = stack.generalId;
  const players = state.players.map(p => {
    if (p.id !== playerId || !p.era3State) return p;
    const generals = p.era3State.generals ?? [];
    return {
      ...p,
      era3State: {
        ...p.era3State,
        generals: generals.map(g =>
          g.id === generalId ? { ...g, assignedStackId: null } : g,
        ),
      },
    };
  });

  return {
    ...state,
    players,
    era3Stacks: {
      ...state.era3Stacks,
      [stackId]: { ...stack, generalId: null },
    },
  };
}

/** Find the general leading the given stack (if any), across all players. */
export function getGeneralForStack(state: GameState, stack: Stack): General | null {
  if (!stack.generalId) return null;
  for (const p of state.players) {
    const g = p.era3State?.generals?.find(g => g.id === stack.generalId);
    if (g) return g;
  }
  return null;
}

/**
 * Grant an additional general to the player (triggered by Era III cards or
 * other narrative events). Auto-generates a unique id from the roster size.
 */
export function grantExtraGeneral(
  state: GameState,
  playerId: string,
  name: string,
  bonuses: { attackBonus?: number; defenseBonus?: number } = {},
): GameState {
  const players = state.players.map(p => {
    if (p.id !== playerId || !p.era3State) return p;
    const generals = p.era3State.generals ?? [];
    const newGeneral: General = {
      id: `general_${state.seed}_${playerId}_${generals.length}`,
      name,
      ownerId: playerId,
      attackBonus: bonuses.attackBonus ?? GENERAL_ATTACK_BONUS,
      defenseBonus: bonuses.defenseBonus ?? GENERAL_DEFENSE_BONUS,
      assignedStackId: null,
    };
    return {
      ...p,
      era3State: { ...p.era3State, generals: [...generals, newGeneral] },
    };
  });
  return { ...state, players };
}
