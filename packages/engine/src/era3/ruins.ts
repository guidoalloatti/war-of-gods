import type { Hex, RuinsReward, Stack, Unit, HexCoord } from '../types/era3.js';
import type { UnitType } from '../types/era2.js';
import type { GameState } from '../types/game.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import { hexKey } from './hex.js';
import { drawEra3Card } from './cards.js';
import { MAX_STACK_SIZE } from './constants.js';
import {
  RUINS_REWARD_WEIGHTS,
  RUINS_GOLD_MIN,
  RUINS_GOLD_MAX,
  RUINS_UNIT_POOL,
} from './constants.js';

function baseMaxHp(type: UnitType): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

function pickWeighted<T>(items: ReadonlyArray<{ weight: number }> & ReadonlyArray<T>, rng: () => number): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Roll a deterministic reward for a ruins hex. Called once at map-gen time.
 * Spawn-zone ruins should NOT call this — they're Dhakhan territory.
 */
export function rollRuinsReward(rng: () => number): RuinsReward {
  const entries = [
    { kind: 'gold' as const,   weight: 0.35 },
    { kind: 'unit' as const,   weight: 0.18 },
    { kind: 'card' as const,   weight: 0.15 },
    { kind: 'tech' as const,   weight: 0.12 },
    { kind: 'heal' as const,   weight: 0.10 },
    { kind: 'fortify' as const, weight: 0.05 },
    { kind: 'empty' as const,  weight: 0.05 },
  ];
  const pick = pickWeighted(entries, rng);

  switch (pick.kind) {
    case 'gold': {
      const span = RUINS_GOLD_MAX - RUINS_GOLD_MIN + 1;
      const amount = RUINS_GOLD_MIN + Math.floor(rng() * span);
      return { kind: 'gold', amount };
    }
    case 'unit': {
      const unit = pickWeighted(RUINS_UNIT_POOL, rng).unit as UnitType;
      return { kind: 'unit', unit };
    }
    case 'card':
      return { kind: 'card' };
    case 'tech': {
      const techs = ['war', 'science', 'resources', 'economy'] as const;
      const tech = techs[Math.floor(rng() * techs.length)];
      return { kind: 'tech', tech };
    }
    case 'heal': {
      const amount = 2 + Math.floor(rng() * 3); // 2–4 HP per unit
      return { kind: 'heal', amount };
    }
    case 'fortify':
      return { kind: 'fortify' };
    case 'empty':
      return { kind: 'empty' };
  }
}

/** Convenience: is this hex an eligible ruins that still has loot to hand out? */
export function isLootableRuins(hex: Hex): boolean {
  return (
    hex.terrain === 'ruins' &&
    !hex.isSpawnZone &&
    !hex.ruinsLooted &&
    hex.ruinsReward !== undefined &&
    hex.ruinsReward.kind !== 'empty'
  );
}

/**
 * Apply the loot for a ruins hex that was just entered by `playerId`'s stack
 * landing at `coord`. Marks the hex as looted regardless of reward kind (even
 * `empty` consumes the ruins, so revisits don't re-roll).
 *
 * Appends a `RuinsLootEntry` to `state.era3RuinsLog` so the UI can announce it.
 * `movingStackId` is the stack that triggered the event — needed for 'unit'
 * rewards (the new unit joins that stack if there's room).
 *
 * Returns the state unchanged if the hex isn't ruins / already looted / has no
 * reward (back-compat for maps generated before reward rolling).
 */
export function applyRuinsLoot(
  state: GameState,
  playerId: string,
  movingStackId: string,
  coord: HexCoord,
): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const key = hexKey(coord);
  const hex = state.map.hexes[key];
  if (!hex || hex.terrain !== 'ruins' || hex.isSpawnZone) return state;
  if (hex.ruinsLooted || !hex.ruinsReward) return state;

  const reward = hex.ruinsReward;
  let next: GameState = state;

  // Mark hex as looted regardless of reward type.
  next = {
    ...next,
    map: {
      ...next.map!,
      hexes: { ...next.map!.hexes, [key]: { ...hex, ruinsLooted: true } },
    },
  };

  switch (reward.kind) {
    case 'gold': {
      next = {
        ...next,
        players: next.players.map(p =>
          p.id === playerId && p.era3State
            ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins + reward.amount } }
            : p,
        ),
      };
      break;
    }
    case 'card': {
      next = drawEra3Card(next, playerId);
      break;
    }
    case 'unit': {
      const stack = next.era3Stacks![movingStackId];
      // If the stack is full, the reward is forfeited (log still gets the entry).
      if (stack && stack.units.length < MAX_STACK_SIZE) {
        const unitSeq = (next.era3UnitSeq ?? 0) + 1;
        const unit: Unit = {
          id: `unit_${next.seed}_ru_${unitSeq}`,
          type: reward.unit,
          ownerId: playerId,
          currentHp: baseMaxHp(reward.unit),
          hasMovedThisTurn: true,
          hasAttackedThisTurn: true,
        };
        const updated: Stack = { ...stack, units: [...stack.units, unit] };
        next = {
          ...next,
          era3Stacks: { ...next.era3Stacks!, [movingStackId]: updated },
          era3UnitSeq: unitSeq,
        };
      }
      break;
    }
    case 'tech': {
      // Increment one tech level (capped at 6).
      next = {
        ...next,
        players: next.players.map(p => {
          if (p.id !== playerId || !p.era3State) return p;
          const current = p.era3State.techLevels[reward.tech] ?? 0;
          return {
            ...p,
            era3State: {
              ...p.era3State,
              techLevels: { ...p.era3State.techLevels, [reward.tech]: Math.min(current + 1, 6) },
            },
          };
        }),
      };
      break;
    }
    case 'heal': {
      // Restore HP to all units in the entering stack.
      const stack = next.era3Stacks![movingStackId];
      if (stack) {
        const healed: typeof stack = {
          ...stack,
          units: stack.units.map(u => {
            const def = UNIT_DEFINITIONS.find(d => d.id === u.type);
            const maxHp = def ? def.defense + 2 : 3;
            return { ...u, currentHp: Math.min(u.currentHp + reward.amount, maxHp) };
          }),
        };
        next = { ...next, era3Stacks: { ...next.era3Stacks!, [movingStackId]: healed } };
      }
      break;
    }
    case 'fortify': {
      // Instantly fortify the entering stack (defense doubled until unfortified).
      const stack = next.era3Stacks![movingStackId];
      if (stack) {
        next = {
          ...next,
          era3Stacks: { ...next.era3Stacks!, [movingStackId]: { ...stack, fortified: true, movementLeft: 0 } },
        };
      }
      break;
    }
    case 'empty':
      // No state change, just the looted flag + log entry.
      break;
  }

  const logEntry = {
    turnNumber: next.era3TurnNumber ?? 1,
    at: coord,
    playerId,
    reward,
  };
  return {
    ...next,
    era3RuinsLog: [...(next.era3RuinsLog ?? []), logEntry],
  };
}
