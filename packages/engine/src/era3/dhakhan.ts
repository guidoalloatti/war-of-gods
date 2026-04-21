import type { GameState } from '../types/game.js';
import type { Hex, HexCoord, Stack, Unit } from '../types/era3.js';
import type { Player } from '../types/player.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import {
  BOSS_STACK_ID,
  BOSS_UNIT_HP_BONUS,
  BOSS_UNIT_HP_MULT,
  CITADEL_COORD,
  DHAKHAN_OWNER_ID,
  MAX_STACK_SIZE,
  WROUGHT_PER_SPAWN_PER_CYCLE,
} from './constants.js';
import { hexKey, distance, neighbors } from './hex.js';
import { canEnterHex, getTerrainMoveCost } from './pathing.js';
import { resolveCombat } from './combat.js';

/**
 * Sentinel counter used so Dhakhan-spawned unit and stack IDs don't collide
 * with player units. Seeded from the current turn.
 */
function spawnIds(seed: number, turnNumber: number, n: number): string {
  return `${seed}_d${turnNumber}_${n}`;
}

function defaultWroughtHp(type: Unit['type']): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

/**
 * Spawn one Wrought infantry at each spawn zone (if free). Merges into an
 * existing Wrought stack on the hex up to MAX_STACK_SIZE, otherwise creates
 * a new stack.
 */
export function spawnWroughtForCycle(state: GameState): GameState {
  if (!state.map) return state;
  const hexes = state.map.hexes;
  const stacks = { ...(state.era3Stacks ?? {}) };
  const newHexes = { ...hexes };
  const turnNumber = state.era3TurnNumber ?? 1;
  const seed = state.seed;
  let counter = 0;

  for (const hex of Object.values(hexes)) {
    if (!hex.isSpawnZone) continue;
    for (let i = 0; i < WROUGHT_PER_SPAWN_PER_CYCLE; i++) {
      const unit: Unit = {
        id: `unit_${spawnIds(seed, turnNumber, counter)}`,
        type: 'infantry',
        ownerId: DHAKHAN_OWNER_ID,
        currentHp: defaultWroughtHp('infantry'),
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
      };
      counter++;

      const existingStackId = newHexes[hexKey(hex.coord)].stackId;
      const existing = existingStackId ? stacks[existingStackId] : null;

      if (existing && existing.ownerId === DHAKHAN_OWNER_ID && existing.units.length < MAX_STACK_SIZE) {
        stacks[existing.id] = { ...existing, units: [...existing.units, unit] };
      } else if (!existing) {
        const newStackId = `stack_${spawnIds(seed, turnNumber, counter)}`;
        counter++;
        const newStack: Stack = {
          id: newStackId,
          ownerId: DHAKHAN_OWNER_ID,
          units: [unit],
          position: hex.coord,
          movementLeft: 0,
        };
        stacks[newStackId] = newStack;
        const k = hexKey(hex.coord);
        newHexes[k] = { ...newHexes[k], stackId: newStackId };
      }
      // else: spawn hex occupied by a player stack or Wrought stack is full —
      // drop the unit (Dhakhan isn't smart enough to queue yet).
    }
  }

  return { ...state, map: { ...state.map, hexes: newHexes }, era3Stacks: stacks };
}

/**
 * Pick the closest player capital hex (living player) to `from`. Returns null
 * if none exist (all players eliminated).
 */
function nearestCapital(state: GameState, from: HexCoord): HexCoord | null {
  if (!state.map) return null;
  let best: HexCoord | null = null;
  let bestDist = Infinity;
  for (const hex of Object.values(state.map.hexes)) {
    if (!hex.isCapital || !hex.capitalOwnerId) continue;
    const owner = state.players.find(p => p.id === hex.capitalOwnerId);
    if (!owner || owner.era3State?.eliminated) continue;
    const d = distance(from, hex.coord);
    if (d < bestDist || (d === bestDist && best && hexKey(hex.coord) < hexKey(best))) {
      best = hex.coord;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Pick the neighbor of `stack.position` that minimizes distance to `target`
 * and is enterable by the stack (including empty, enemy-stack hex, or capital).
 * Returns null if no forward progress possible.
 *
 * Unlike player movement, Dhakhan MAY move into enemy-occupied hexes — that
 * triggers combat. Movement cost is 1 step per turn (ignoring terrain cost
 * for Session 3 simplicity; we still respect impassable mountains).
 */
function dhakhanNextStep(
  state: GameState,
  stack: Stack,
  target: HexCoord,
): HexCoord | null {
  if (!state.map) return null;
  const currentDist = distance(stack.position, target);
  const options: Array<{ coord: HexCoord; hex: Hex; dist: number; key: string }> = [];
  for (const nb of neighbors(stack.position)) {
    const hex = state.map.hexes[hexKey(nb)];
    if (!hex) continue;
    if (getTerrainMoveCost(hex.terrain, hex) === Infinity) continue;
    // Enter own hex → no-op. Enter player stack → combat. Enter empty → fine.
    if (hex.stackId) {
      const occupant = state.era3Stacks?.[hex.stackId];
      if (occupant?.ownerId === DHAKHAN_OWNER_ID) continue; // don't stack on self
    }
    const d = distance(nb, target);
    options.push({ coord: nb, hex, dist: d, key: hexKey(nb) });
  }
  if (options.length === 0) return null;
  options.sort((a, b) => (a.dist - b.dist) || (a.key < b.key ? -1 : 1));
  const best = options[0];
  // Allow sideways moves (dist === currentDist) when a mountain blocks the
  // straight line — this prevents Wrought from being permanently stuck when
  // the geometric shortest path is impassable. Forbid retreats (dist > currentDist).
  if (best.dist > currentDist) return null;
  return best.coord;
}

/**
 * Run Dhakhan's turn: every Wrought stack moves one step toward the nearest
 * capital. Combat resolves if it steps into a player stack. Capital capture
 * sets `player.era3State.eliminated = true`.
 *
 * Returns a new GameState (pure).
 */
export function runDhakhanTurn(state: GameState): GameState {
  if (!state.map || !state.era3Stacks) return state;

  // Snapshot Wrought stack IDs up-front so we don't iterate freshly-spawned ones.
  // The boss stack at the citadel never moves — exclude it.
  const wroughtIds = Object.values(state.era3Stacks)
    .filter(s => s.ownerId === DHAKHAN_OWNER_ID && s.id !== BOSS_STACK_ID)
    .map(s => s.id)
    .sort(); // deterministic order

  let working = state;

  for (const stackId of wroughtIds) {
    const stacks = working.era3Stacks;
    if (!stacks) continue;
    const stack = stacks[stackId];
    if (!stack) continue; // destroyed in an earlier combat this turn
    if (stack.units.length === 0) continue;

    const target = nearestCapital(working, stack.position);
    if (!target) break;

    const step = dhakhanNextStep(working, stack, target);
    if (!step) continue;

    working = stepWroughtStack(working, stackId, step);
  }

  return working;
}

/**
 * Move one Wrought stack to `to`. If a player stack occupies `to`, resolve
 * combat. If the destination is a player capital and Wrought survives, mark
 * the player eliminated.
 */
function stepWroughtStack(state: GameState, stackId: string, to: HexCoord): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const stack = state.era3Stacks[stackId];
  if (!stack) return state;

  const destHex = state.map.hexes[hexKey(to)];
  if (!destHex) return state;

  const fromKey = hexKey(stack.position);
  const toKey = hexKey(to);
  let map = state.map;
  let stacks = state.era3Stacks;
  const combatLog = state.era3CombatLog ? [...state.era3CombatLog] : [];
  let players = state.players;

  if (destHex.stackId) {
    const defender = stacks[destHex.stackId];
    if (defender && defender.ownerId !== DHAKHAN_OWNER_ID) {
      // Combat.
      const result = resolveCombat(stack, defender, to, state.era3TurnNumber ?? 1);
      combatLog.push(result.entry);
      const newStacks = { ...stacks };

      if (result.defenderWiped) {
        delete newStacks[defender.id];
      } else {
        newStacks[defender.id] = result.defenderStack;
      }

      if (result.attackerWiped) {
        delete newStacks[stack.id];
        // Clear attacker's origin reference.
        const newHexes = { ...map.hexes };
        if (newHexes[fromKey]?.stackId === stack.id) {
          newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
        }
        map = { ...map, hexes: newHexes };
        stacks = newStacks;
      } else if (result.defenderWiped) {
        // Wrought advances into the cleared hex.
        newStacks[stack.id] = { ...result.attackerStack, position: to };
        const newHexes = { ...map.hexes };
        if (newHexes[fromKey]?.stackId === stack.id) {
          newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
        }
        newHexes[toKey] = { ...newHexes[toKey], stackId: stack.id };
        map = { ...map, hexes: newHexes };
        stacks = newStacks;

        // Capital capture?
        if (destHex.isCapital && destHex.capitalOwnerId) {
          players = players.map(p =>
            p.id === destHex.capitalOwnerId && p.era3State
              ? { ...p, era3State: { ...p.era3State, eliminated: true } }
              : p,
          );
        }
      } else {
        // Neither wiped — Wrought stays put, both take damage.
        newStacks[stack.id] = result.attackerStack;
        stacks = newStacks;
      }
    } else {
      // Destination has a Wrought stack — skip (shouldn't happen via dhakhanNextStep).
      return state;
    }
  } else {
    // Empty hex — move in.
    const newStacks = { ...stacks, [stack.id]: { ...stack, position: to } };
    const newHexes = { ...map.hexes };
    if (newHexes[fromKey]?.stackId === stack.id) {
      newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
    }
    newHexes[toKey] = { ...newHexes[toKey], stackId: stack.id };
    map = { ...map, hexes: newHexes };
    stacks = newStacks;

    // Capital capture on empty capital (defender has no stack there).
    if (destHex.isCapital && destHex.capitalOwnerId) {
      players = players.map(p =>
        p.id === destHex.capitalOwnerId && p.era3State
          ? { ...p, era3State: { ...p.era3State, eliminated: true } }
          : p,
      );
    }
  }

  return { ...state, map, era3Stacks: stacks, era3CombatLog: combatLog, players };
}

export function isWroughtOwner(ownerId: string): boolean {
  return ownerId === DHAKHAN_OWNER_ID;
}

/** Convenience — find living (non-eliminated) players. */
export function livingPlayers(players: Player[]): Player[] {
  return players.filter(p => !p.era3State?.eliminated);
}

function bossUnitHp(type: Unit['type']): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  const defense = def ? def.defense : 1;
  return defense * BOSS_UNIT_HP_MULT + BOSS_UNIT_HP_BONUS;
}

/**
 * Build the Dhakhan boss stack sitting on the citadel. Mix of heavy units
 * representing Dhakhan's inner guard. Deterministic id based on `BOSS_STACK_ID`
 * so lookups are easy from anywhere.
 */
export function buildBossStack(seed: number): Stack {
  const mix: Unit['type'][] = ['infantry', 'ranged', 'mounted', 'infantry', 'siege', 'flying'];
  const units: Unit[] = mix.slice(0, MAX_STACK_SIZE).map((type, i) => ({
    id: `unit_boss_${seed}_${i}`,
    type,
    ownerId: DHAKHAN_OWNER_ID,
    currentHp: bossUnitHp(type),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
  }));
  return {
    id: BOSS_STACK_ID,
    ownerId: DHAKHAN_OWNER_ID,
    units,
    position: { ...CITADEL_COORD },
    movementLeft: 0,
  };
}

export function isBossAlive(state: GameState): boolean {
  const boss = state.era3Stacks?.[BOSS_STACK_ID];
  return !!boss && boss.units.length > 0;
}
