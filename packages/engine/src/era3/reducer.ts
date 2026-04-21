import type { GameAction } from '../types/actions.js';
import type { GameState } from '../types/game.js';
import type { CombatEntry, HexCoord, Stack } from '../types/era3.js';
import { distance, hexKey, neighbors } from './hex.js';
import { getTerrainMoveCost, pathCost } from './pathing.js';
import { initGameLoopTurnState, nextTurn, resetStacksForTurn } from './turn.js';
import { resolveCombat, resolveFlankingCombat } from './combat.js';
import { isBossAlive, runDhakhanTurn, spawnWroughtForCycle } from './dhakhan.js';
import {
  BOSS_STACK_ID, CITADEL_COORD, DHAKHAN_OWNER_ID, MAX_STACK_SIZE,
  REST_HEAL_FRACTION, DISBAND_REFUND_FRACTION, ERA3_RECRUIT_COSTS,
  TERRAFORM_COST, BUILD_ROAD_OVERLAY_COST, DRAIN_WATER_COST, BUILD_BRIDGE_COST,
  ERA3_TECH_UPGRADE_MULTIPLIER,
} from './constants.js';
import { getIncrementalCost } from '../era2/constants.js';
import { applyCycleIncome, recruitUnit, totalAttackBonus } from './economy.js';
import { playEra3Card, drawEra3Card, clearTurnEffectsFor } from './cards.js';
import { buildRoad } from './build-road.js';
import { applyRuinsLoot } from './ruins.js';
import { assignGeneral, unassignGeneral } from './generals.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import { FORTIFY_DEFENSE_MULT, FORT_DEFENSE_MULT } from './constants.js';

/** Returns a damage multiplier (<1) when the defender is fortified or on a fort hex. */
function defenderDamageMult(state: GameState, defender: Stack): number {
  const fortified = defender.fortified ?? false;
  const hexFort = state.map?.hexes[hexKey(defender.position)]?.hasFort ?? false;
  if (fortified && hexFort) return 1 / (FORTIFY_DEFENSE_MULT * FORT_DEFENSE_MULT);
  if (fortified) return 1 / FORTIFY_DEFENSE_MULT;
  if (hexFort) return 1 / FORT_DEFENSE_MULT;
  return 1;
}

/**
 * Era III reducer. Session 2 scope: game_loop start, stack movement, end turn.
 * Session 3 scope: combat resolution when moving into an adjacent enemy hex,
 * plus Dhakhan spawn + movement at the end of each turn cycle.
 */
export function era3Reducer(state: GameState, action: GameAction): GameState {
  if (state.phase !== 'era3') return state;

  switch (action.type) {
    case 'START_ERA3_GAME_LOOP': {
      if (state.era3Phase !== 'awaiting_next_session') return state;
      return {
        ...initGameLoopTurnState(state),
        era3Phase: 'game_loop',
      };
    }

    case 'MOVE_STACK':
      return handleMoveStack(state, action);

    case 'ATTACK_STACK':
      return handleAttackStack(state, action);

    case 'END_TURN':
      return handleEndTurn(state, action);

    case 'RECRUIT_UNIT':
      return recruitUnit(state, action.playerId, action.unitType);

    case 'PLAY_ERA3_CARD':
      return playEra3Card(state, action.playerId, action.cardId, action.targetStackId);

    case 'BUILD_ROAD':
      return buildRoad(state, action.playerId, action.coord);

    case 'SPLIT_STACK':
      return handleSplitStack(state, action);

    case 'RANGED_ATTACK':
      return handleRangedAttack(state, action);

    case 'ASSIGN_GENERAL':
      return assignGeneral(state, action.playerId, action.generalId, action.stackId);

    case 'UNASSIGN_GENERAL':
      return unassignGeneral(state, action.playerId, action.stackId);

    case 'REST_STACK':
      return handleRestStack(state, action);

    case 'FORTIFY_STACK':
      return handleFortifyStack(state, action);

    case 'UNFORTIFY_STACK':
      return handleUnfortifyStack(state, action);

    case 'DISBAND_UNIT':
      return handleDisbandUnit(state, action);

    case 'TERRAFORM':
      return handleTerraform(state, action);

    case 'BUILD_ROAD_OVERLAY':
      return handleBuildRoadOverlay(state, action);

    case 'DRAIN_WATER':
      return handleDrainWater(state, action);

    case 'BUILD_BRIDGE':
      return handleBuildBridge(state, action);

    case 'ERA3_UPGRADE_TECH':
      return handleEra3UpgradeTech(state, action);

    default:
      return state;
  }
}

function handleSplitStack(
  state: GameState,
  action: Extract<GameAction, { type: 'SPLIT_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (action.unitIds.length === 0) throw new Error('Nothing to split');
  if (action.unitIds.length >= stack.units.length) {
    throw new Error('Cannot split off every unit — nothing would remain');
  }
  // All requested unit IDs must belong to this stack.
  const unitSet = new Set(action.unitIds);
  const splitting = stack.units.filter(u => unitSet.has(u.id));
  if (splitting.length !== action.unitIds.length) {
    throw new Error('Some units are not part of this stack');
  }
  const remaining = stack.units.filter(u => !unitSet.has(u.id));

  // Derive a deterministic new stack id from the source.
  const seed = state.era3Stacks ? Object.keys(state.era3Stacks).length : 0;
  const newStackId = `${stack.id}_s${seed}`;

  const newStack: Stack = {
    id: newStackId,
    ownerId: stack.ownerId,
    position: stack.position,
    movementLeft: 0,
    units: splitting,
  };
  const sourceStack: Stack = { ...stack, units: remaining };

  // Both stacks co-occupy the hex briefly; the hex pointer keeps referencing
  // the source stack (UI shows stacks at a hex by filtering). Players can
  // move either stack away next action.
  return {
    ...state,
    era3Stacks: { ...state.era3Stacks, [stack.id]: sourceStack, [newStackId]: newStack },
  };
}

function handleRangedAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'RANGED_ATTACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const attacker = state.era3Stacks[action.attackerStackId];
  if (!attacker) throw new Error(`Unknown stack ${action.attackerStackId}`);
  if (attacker.ownerId !== action.playerId) throw new Error('You do not own that stack');
  const ranged = attacker.units.filter(u => u.type === 'ranged' && !u.hasAttackedThisTurn);
  if (ranged.length === 0) throw new Error('No ranged units available to fire');

  const dist = distance(attacker.position, action.targetCoord);
  if (dist < 1 || dist > 2) throw new Error('Ranged attack range is 1–2 hexes');

  const targetHex = state.map.hexes[hexKey(action.targetCoord)];
  if (!targetHex || !targetHex.stackId) throw new Error('No target on that hex');
  const defender = state.era3Stacks[targetHex.stackId];
  if (!defender || defender.ownerId !== DHAKHAN_OWNER_ID) {
    throw new Error('Ranged attacks only target Dhakhan');
  }

  // Ranged combat: only the firing units deal damage, and defender retaliates
  // only if adjacent (distance 1). At distance 2 it's a free volley.
  const firingStack: Stack = { ...attacker, units: ranged };
  const result = resolveCombat(
    firingStack,
    defender,
    action.targetCoord,
    state.era3TurnNumber ?? 1,
    {
      attackerPerUnit: totalAttackBonus(firingStack, state),
      defenderPerUnit: dist === 1 ? totalAttackBonus(defender, state) : 0,
      defenderDamageMult: defenderDamageMult(state, defender),
    },
  );
  result.entry.kind = 'ranged';

  // Merge firing survivors back into the attacker stack; mark as attacked.
  const rangedIds = new Set(ranged.map(r => r.id));
  const survivorById = new Map(result.attackerStack.units.map(u => [u.id, u]));
  const updatedUnits = attacker.units.flatMap(u => {
    if (!rangedIds.has(u.id)) return [u];
    const survivor = survivorById.get(u.id);
    if (!survivor) return []; // died from retaliation
    return [{ ...survivor, hasAttackedThisTurn: true }];
  });

  const newStacks: Record<string, Stack> = { ...state.era3Stacks };
  if (updatedUnits.length === 0) {
    delete newStacks[attacker.id];
  } else {
    newStacks[attacker.id] = { ...attacker, units: updatedUnits };
  }

  const newHexes = { ...state.map.hexes };
  if (result.defenderWiped) {
    delete newStacks[defender.id];
    newHexes[hexKey(action.targetCoord)] = {
      ...newHexes[hexKey(action.targetCoord)],
      stackId: null,
    };
  } else {
    newStacks[defender.id] = { ...result.defenderStack, position: defender.position };
  }

  let out: GameState = {
    ...state,
    map: { ...state.map, hexes: newHexes },
    era3Stacks: newStacks,
    era3CombatLog: [...(state.era3CombatLog ?? []), result.entry],
  };
  if (defender.id === BOSS_STACK_ID && result.defenderWiped) {
    out = { ...out, era3BossKillerId: attacker.ownerId, era3Phase: 'victory' };
  }

  // Mark spawn zone as destroyed when a Dhakhan spawn-zone stack is wiped.
  if (result.defenderWiped && out.map) {
    const tk = hexKey(action.targetCoord ?? defender.position);
    const th = out.map.hexes[tk];
    if (th?.isSpawnZone && !th.spawnZoneDestroyed) {
      out = { ...out, map: { ...out.map, hexes: { ...out.map.hexes, [tk]: { ...th, spawnZoneDestroyed: true } } } };
    }
  }

  return out;
}

function handleMoveStack(
  state: GameState,
  action: Extract<GameAction, { type: 'MOVE_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) {
    throw new Error('Not your turn');
  }

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) {
    throw new Error('You do not own that stack');
  }
  if (action.path.length === 0) return state;

  // Flying stacks (all units are flying) ignore terrain cost (always 3/hex).
  const isFlying = stack.units.length > 0 && stack.units.every(u => u.type === 'flying');

  // Validate contiguity.
  let cursor: HexCoord = stack.position;
  for (const step of action.path) {
    const adj = neighbors(cursor).some(n => n.q === step.q && n.r === step.r);
    if (!adj) throw new Error('Path is not contiguous');
    const hex = state.map.hexes[hexKey(step)];
    if (!hex) throw new Error('Step off-map');
    if (!isFlying && getTerrainMoveCost(hex.terrain, hex) === Infinity) {
      throw new Error('Hex is impassable');
    }
    cursor = step;
  }

  const destination = action.path[action.path.length - 1];
  const destKey = hexKey(destination);
  const destHex = state.map.hexes[destKey];
  const destStackId = destHex.stackId;
  const destStack = destStackId ? state.era3Stacks[destStackId] : null;

  // Intermediate hexes (all but the last) must not be occupied by another stack.
  for (let i = 0; i < action.path.length - 1; i++) {
    const midKey = hexKey(action.path[i]);
    const midHex = state.map.hexes[midKey];
    const occ = midHex.stackId ? state.era3Stacks[midHex.stackId] : null;
    if (occ && occ.id !== stack.id) {
      throw new Error('Path passes through another stack');
    }
  }

  const cost = isFlying
    ? action.path.length * 3
    : pathCost(state.map, action.path);
  // Minimum-move guarantee: a single adjacent step is always allowed regardless of terrain cost,
  // as long as the stack has any movement left.
  const isMinimumMove = action.path.length === 1 && stack.movementLeft > 0;
  if (cost > stack.movementLeft && !isMinimumMove) {
    throw new Error('Not enough movement');
  }

  // Case A: destination is empty or contains our own stack → regular move.
  if (!destStack || destStack.id === stack.id) {
    return commitSimpleMove(state, stack, destination, cost);
  }

  // Case A2: destination has a friendly stack owned by the same player →
  // merge into it (respecting MAX_STACK_SIZE). The moving stack disappears.
  if (destStack.ownerId === stack.ownerId) {
    return commitMergeMove(state, stack, destStack, destination, cost);
  }

  // Case B: destination has another player's stack (not Dhakhan, not us) → blocked.
  // Combat only against Dhakhan (Wrought) for Session 3. Player-vs-player combat
  // is still disallowed — comes later with alliance / betrayal mechanics.
  if (destStack.ownerId !== DHAKHAN_OWNER_ID) {
    throw new Error('Another player\'s stack blocks that hex');
  }

  // Case C: destination has a Wrought stack → attack with this stack only
  // (multi-step attacks are allowed — we've already validated intermediates).
  return commitAttack(state, stack, destStack, action.path, cost);
}

function commitSimpleMove(
  state: GameState,
  stack: Stack,
  destination: HexCoord,
  cost: number,
): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const fromKey = hexKey(stack.position);
  const toKey = hexKey(destination);

  const newStack: Stack = {
    ...stack,
    position: destination,
    movementLeft: stack.movementLeft - cost,
    units: stack.units.map(u => ({ ...u, hasMovedThisTurn: true })),
  };
  const newStacks = { ...state.era3Stacks, [stack.id]: newStack };
  const newHexes = { ...state.map.hexes };
  if (newHexes[fromKey]?.stackId === stack.id) {
    newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
  }
  newHexes[toKey] = { ...newHexes[toKey], stackId: stack.id };

  let next: GameState = {
    ...state,
    map: { ...state.map, hexes: newHexes },
    era3Stacks: newStacks,
  };

  // Ruins loot: trigger when a player-owned stack enters an unlooted ruins
  // hex. Dhakhan stacks never loot. We run this after the base move commit so
  // `applyRuinsLoot` sees the up-to-date stack occupancy.
  if (stack.ownerId !== DHAKHAN_OWNER_ID) {
    next = applyRuinsLoot(next, stack.ownerId, stack.id, destination);
  }

  return next;
}

function commitMergeMove(
  state: GameState,
  mover: Stack,
  host: Stack,
  destination: HexCoord,
  cost: number,
): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const combined = host.units.length + mover.units.length;
  if (combined > MAX_STACK_SIZE) {
    throw new Error(`Merging would exceed max stack size (${MAX_STACK_SIZE})`);
  }
  const fromKey = hexKey(mover.position);
  const toKey = hexKey(destination);

  const mergedUnits = [
    ...host.units,
    ...mover.units.map(u => ({ ...u, hasMovedThisTurn: true })),
  ];
  // The host stack absorbs the mover. Preserve the lower movementLeft so the
  // merged force can't double-move this turn.
  const mergedStack: Stack = {
    ...host,
    units: mergedUnits,
    movementLeft: Math.min(host.movementLeft, mover.movementLeft - cost),
  };

  const newStacks: Record<string, Stack> = { ...state.era3Stacks };
  delete newStacks[mover.id];
  newStacks[host.id] = mergedStack;

  const newHexes = { ...state.map.hexes };
  if (newHexes[fromKey]?.stackId === mover.id) {
    newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
  }
  // Destination keeps the host as its visible stack.
  newHexes[toKey] = { ...newHexes[toKey], stackId: host.id };

  let next: GameState = {
    ...state,
    map: { ...state.map, hexes: newHexes },
    era3Stacks: newStacks,
  };
  if (mover.ownerId !== DHAKHAN_OWNER_ID) {
    next = applyRuinsLoot(next, mover.ownerId, host.id, destination);
  }
  return next;
}

function commitAttack(
  state: GameState,
  attacker: Stack,
  defender: Stack,
  path: HexCoord[],
  cost: number,
): GameState {
  if (!state.map || !state.era3Stacks) return state;

  const destination = path[path.length - 1];
  const fromKey = hexKey(attacker.position);
  const toKey = hexKey(destination);

  // Attacker pre-move: apply movement cost and hasMovedThisTurn flag BEFORE
  // combat so HP/attack is computed from current unit list.
  const movedAttacker: Stack = {
    ...attacker,
    movementLeft: attacker.movementLeft - cost,
    units: attacker.units.map(u => ({
      ...u,
      hasMovedThisTurn: true,
      hasAttackedThisTurn: true,
    })),
  };

  const result = resolveCombat(
    movedAttacker,
    defender,
    destination,
    state.era3TurnNumber ?? 1,
    {
      attackerPerUnit: totalAttackBonus(movedAttacker, state),
      defenderPerUnit: totalAttackBonus(defender, state),
      defenderDamageMult: defenderDamageMult(state, defender),
    },
  );
  result.entry.kind = 'move_into';

  const newStacks: Record<string, Stack> = { ...state.era3Stacks };
  const newHexes = { ...state.map.hexes };
  const combatLog: CombatEntry[] = [...(state.era3CombatLog ?? []), result.entry];

  if (result.defenderWiped) {
    delete newStacks[defender.id];
  } else {
    newStacks[defender.id] = { ...result.defenderStack, position: defender.position };
  }

  if (result.attackerWiped) {
    delete newStacks[attacker.id];
    if (newHexes[fromKey]?.stackId === attacker.id) {
      newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
    }
    // Destination retains the (possibly wounded) defender if it survived, else cleared.
    if (result.defenderWiped) {
      newHexes[toKey] = { ...newHexes[toKey], stackId: null };
    }
  } else if (result.defenderWiped) {
    // Attacker advances into the cleared hex.
    newStacks[attacker.id] = { ...result.attackerStack, position: destination };
    if (newHexes[fromKey]?.stackId === attacker.id) {
      newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
    }
    newHexes[toKey] = { ...newHexes[toKey], stackId: attacker.id };
  } else {
    // Neither wiped — both take casualties; attacker stays put.
    newStacks[attacker.id] = { ...result.attackerStack, position: attacker.position };
  }

  let out: GameState = {
    ...state,
    map: { ...state.map, hexes: newHexes },
    era3Stacks: newStacks,
    era3CombatLog: combatLog,
  };

  // Boss killed? Record killer and immediately transition to victory.
  if (defender.id === BOSS_STACK_ID && result.defenderWiped) {
    out = {
      ...out,
      era3BossKillerId: attacker.ownerId,
      era3Phase: 'victory',
    };
  }

  return out;
}

function handleEndTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'END_TURN' }>,
): GameState {
  if (state.era3Phase === 'final_heroic_turn') {
    return handleHeroicEndTurn(state, action);
  }
  if (state.era3Phase !== 'game_loop') return state;
  if (state.era3CurrentPlayerId !== action.playerId) {
    throw new Error('Not your turn');
  }
  const order = state.era3TurnOrder ?? [];
  const { nextPlayerId, nextTurnNumber } = nextTurn(
    order,
    state.era3CurrentPlayerId,
    state.era3TurnNumber ?? 1,
  );
  const wrapped = nextTurnNumber !== (state.era3TurnNumber ?? 1);

  // Draw one card for the player whose turn just ended.
  let next: GameState = drawEra3Card(state, action.playerId);

  next = {
    ...next,
    era3CurrentPlayerId: nextPlayerId,
    era3TurnNumber: nextTurnNumber,
  };

  // Detect heroic trigger: any player stack adjacent to or on the citadel while boss alive.
  if (!next.era3HeroicTurnTriggered && isBossAlive(next)) {
    const triggered = Object.values(next.era3Stacks ?? {}).some(s =>
      s.ownerId !== DHAKHAN_OWNER_ID && distance(s.position, CITADEL_COORD) <= 1,
    );
    if (triggered) next = { ...next, era3HeroicTurnTriggered: true };
  }

  // End-of-cycle: gold income → Dhakhan spawn → Dhakhan move.
  // Skip Dhakhan turn if we are about to enter the heroic phase.
  const enteringHeroic = wrapped && next.era3HeroicTurnTriggered;
  if (wrapped && !enteringHeroic) {
    next = { ...next, players: applyCycleIncome(next.players) };
    next = spawnWroughtForCycle(next);
    next = runDhakhanTurn(next);
  }

  // Defeat: all player capitals fallen.
  if (next.players.every(p => p.era3State?.eliminated)) {
    return { ...next, era3Phase: 'defeat' };
  }

  if (enteringHeroic) {
    // Jump to final heroic turn — first living player of the order starts.
    const firstHeroic = order.find(pid => {
      const p = next.players.find(pp => pp.id === pid);
      return p && !p.era3State?.eliminated;
    }) ?? null;
    next = {
      ...next,
      era3Phase: 'final_heroic_turn',
      era3CurrentPlayerId: firstHeroic,
      era3HeroicTurnsTaken: {},
    };
    if (firstHeroic) {
      next = clearTurnEffectsFor(next, firstHeroic);
      next = {
        ...next,
        players: next.players.map(p =>
          p.id === firstHeroic && p.era3State
            ? { ...p, era3State: { ...p.era3State, recruitsThisTurn: 0, roadsBuiltThisTurn: 0 } }
            : p,
        ),
        era3Stacks: resetStacksForTurn(next.era3Stacks ?? {}, firstHeroic),
      };
    }
    return next;
  }

  // Clear incoming player's per-turn card effects + reset recruit counter
  // and stacks' movement/flags.
  next = clearTurnEffectsFor(next, nextPlayerId);
  next = {
    ...next,
    players: next.players.map(p =>
      p.id === nextPlayerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, recruitsThisTurn: 0, roadsBuiltThisTurn: 0 } }
        : p,
    ),
    era3Stacks: resetStacksForTurn(next.era3Stacks ?? {}, nextPlayerId),
  };

  return next;
}

function handleHeroicEndTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'END_TURN' }>,
): GameState {
  if (state.era3CurrentPlayerId !== action.playerId) {
    throw new Error('Not your turn');
  }
  const order = state.era3TurnOrder ?? [];
  const taken: Record<string, boolean> = {
    ...(state.era3HeroicTurnsTaken ?? {}),
    [action.playerId]: true,
  };

  // Find next living player who has not yet taken their heroic turn.
  const nextId = order.find(pid => {
    if (taken[pid]) return false;
    const p = state.players.find(pp => pp.id === pid);
    return p && !p.era3State?.eliminated;
  }) ?? null;

  let next: GameState = {
    ...state,
    era3HeroicTurnsTaken: taken,
    era3CurrentPlayerId: nextId,
  };

  if (!nextId) {
    // Heroic phase complete. Resolve outcome.
    return {
      ...next,
      era3Phase: isBossAlive(next) ? 'defeat' : 'victory',
    };
  }

  // Start that player's heroic turn.
  next = clearTurnEffectsFor(next, nextId);
  next = {
    ...next,
    players: next.players.map(p =>
      p.id === nextId && p.era3State
        ? { ...p, era3State: { ...p.era3State, recruitsThisTurn: 0, roadsBuiltThisTurn: 0 } }
        : p,
    ),
    era3Stacks: resetStacksForTurn(next.era3Stacks ?? {}, nextId),
  };
  return next;
}

/**
 * ATTACK_STACK — a player's stack that sits adjacent to an enemy (Dhakhan) stack
 * attacks it without moving. All the player's *other* stacks that are also
 * adjacent to the target and have not yet attacked this turn participate as
 * flankers. Costs no movement; marks every participating stack as having
 * attacked this turn (`hasAttackedThisTurn`) — units that have already attacked
 * cannot attack again this turn.
 */
function handleAttackStack(
  state: GameState,
  action: Extract<GameAction, { type: 'ATTACK_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) {
    throw new Error('Not your turn');
  }

  const attacker = state.era3Stacks[action.attackerStackId];
  if (!attacker) throw new Error(`Unknown stack ${action.attackerStackId}`);
  if (attacker.ownerId !== action.playerId) {
    throw new Error('You do not own that stack');
  }
  if (attacker.units.some(u => u.hasAttackedThisTurn) && attacker.units.every(u => u.hasAttackedThisTurn)) {
    throw new Error('This stack has already attacked this turn');
  }

  const targetKey = hexKey(action.targetCoord);
  const targetHex = state.map.hexes[targetKey];
  if (!targetHex || !targetHex.stackId) throw new Error('No target at that hex');
  const defender = state.era3Stacks[targetHex.stackId];
  if (!defender) throw new Error('Target stack missing');
  if (defender.ownerId !== DHAKHAN_OWNER_ID) {
    throw new Error('Can only attack Dhakhan stacks');
  }

  // Siege units can fire at distance 2; otherwise require adjacency.
  const dist = distance(attacker.position, action.targetCoord);
  const hasSiege = attacker.units.some(u => u.type === 'siege' && !u.hasAttackedThisTurn);
  if (dist === 2) {
    if (!hasSiege) throw new Error('Only siege units can attack at distance 2');
  } else if (dist !== 1) {
    throw new Error('Not adjacent to target');
  }

  // Find flankers: other stacks owned by this player adjacent to the target
  // that have not yet attacked this turn.
  const flankers: Stack[] = [];
  for (const s of Object.values(state.era3Stacks)) {
    if (s.id === attacker.id) continue;
    if (s.ownerId !== action.playerId) continue;
    if (s.units.every(u => u.hasAttackedThisTurn)) continue;
    const adj = neighbors(s.position).some(
      n => n.q === action.targetCoord.q && n.r === action.targetCoord.r,
    );
    if (adj) flankers.push(s);
  }

  const markAttacked = (s: Stack): Stack => ({
    ...s,
    units: s.units.map(u => ({ ...u, hasAttackedThisTurn: true })),
  });

  // At distance 2, only siege units fire and defender cannot retaliate.
  const siegeOnly = dist === 2;
  const firingAttacker = siegeOnly
    ? { ...attacker, units: attacker.units.filter(u => u.type === 'siege' && !u.hasAttackedThisTurn) }
    : attacker;

  const markedAttacker = markAttacked(firingAttacker);
  const markedFlankers = siegeOnly ? [] : flankers.map(markAttacked);

  const result = resolveFlankingCombat(
    markedAttacker,
    markedFlankers,
    defender,
    action.targetCoord,
    state.era3TurnNumber ?? 1,
    {
      attackerPerUnit: totalAttackBonus(markedAttacker, state),
      defenderPerUnit: siegeOnly ? 0 : totalAttackBonus(defender, state),
      flankerBonuses: markedFlankers.map(f => totalAttackBonus(f, state)),
      defenderDamageMult: siegeOnly ? 1 : defenderDamageMult(state, defender),
    },
  );

  // For distance-2: merge siege survivors back + mark their units as attacked.
  // Non-siege units in the attacker stack remain untouched.
  if (siegeOnly) {
    const siegeIds = new Set(firingAttacker.units.map(u => u.id));
    const survivorById = new Map(result.primaryAttacker.units.map(u => [u.id, u]));
    const mergedUnits = attacker.units.map(u => {
      if (!siegeIds.has(u.id)) return u;
      const sur = survivorById.get(u.id);
      return sur ? { ...sur, hasAttackedThisTurn: true } : null;
    }).filter((u): u is NonNullable<typeof u> => u !== null);
    const newSts: Record<string, Stack> = { ...state.era3Stacks };
    const newHxs = { ...state.map.hexes };
    const clog: CombatEntry[] = [...(state.era3CombatLog ?? [])];
    result.entry.kind = 'ranged';
    clog.push(result.entry);
    if (mergedUnits.length === 0) {
      delete newSts[attacker.id];
      const fk = hexKey(attacker.position);
      if (newHxs[fk]?.stackId === attacker.id) newHxs[fk] = { ...newHxs[fk], stackId: null };
    } else {
      newSts[attacker.id] = { ...attacker, units: mergedUnits };
    }
    if (result.defenderWiped) {
      delete newSts[defender.id];
      const tk = hexKey(action.targetCoord);
      newHxs[tk] = { ...newHxs[tk], stackId: null };
    } else {
      newSts[defender.id] = { ...result.defender, position: defender.position };
    }
    let siegeOut: GameState = { ...state, map: { ...state.map, hexes: newHxs }, era3Stacks: newSts, era3CombatLog: clog };
    if (defender.id === BOSS_STACK_ID && result.defenderWiped) {
      siegeOut = { ...siegeOut, era3BossKillerId: attacker.ownerId, era3Phase: 'victory' };
    }
    return siegeOut;
  }

  const newStacks: Record<string, Stack> = { ...state.era3Stacks };
  const newHexes = { ...state.map.hexes };
  const combatLog: CombatEntry[] = [...(state.era3CombatLog ?? []), result.entry];

  // Primary attacker — no movement change, position unchanged.
  if (result.primaryWiped) {
    delete newStacks[markedAttacker.id];
    const fromKey = hexKey(markedAttacker.position);
    if (newHexes[fromKey]?.stackId === markedAttacker.id) {
      newHexes[fromKey] = { ...newHexes[fromKey], stackId: null };
    }
  } else {
    newStacks[markedAttacker.id] = { ...result.primaryAttacker, position: markedAttacker.position };
  }

  // Flankers — same treatment, position unchanged.
  result.flankingAttackers.forEach((f, i) => {
    if (result.flankersWiped[i]) {
      delete newStacks[f.id];
      const fk = hexKey(markedFlankers[i].position);
      if (newHexes[fk]?.stackId === f.id) {
        newHexes[fk] = { ...newHexes[fk], stackId: null };
      }
    } else {
      newStacks[f.id] = { ...f, position: markedFlankers[i].position };
    }
  });

  // Defender.
  if (result.defenderWiped) {
    delete newStacks[defender.id];
    if (newHexes[targetKey]?.stackId === defender.id) {
      newHexes[targetKey] = { ...newHexes[targetKey], stackId: null };
    }
  } else {
    newStacks[defender.id] = { ...result.defender, position: defender.position };
  }

  let out: GameState = {
    ...state,
    map: { ...state.map, hexes: newHexes },
    era3Stacks: newStacks,
    era3CombatLog: combatLog,
  };

  if (defender.id === BOSS_STACK_ID && result.defenderWiped) {
    out = {
      ...out,
      era3BossKillerId: markedAttacker.ownerId,
      era3Phase: 'victory',
    };
  }

  return out;
}

// ── REST_STACK ─────────────────────────────────────────────────────────────────

function handleRestStack(
  state: GameState,
  action: Extract<GameAction, { type: 'REST_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  const healed = stack.units.map(u => {
    if (u.hasMovedThisTurn || u.hasAttackedThisTurn) return u;
    const def = UNIT_DEFINITIONS.find(d => d.id === u.type);
    const maxHp = def ? def.defense + 2 : 3;
    if (u.currentHp >= maxHp) return u;
    const gain = Math.ceil(maxHp * REST_HEAL_FRACTION);
    return { ...u, currentHp: Math.min(u.currentHp + gain, maxHp) };
  });

  return {
    ...state,
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, units: healed, hasActedThisTurn: true },
    },
  };
}

function handleFortifyStack(
  state: GameState,
  action: Extract<GameAction, { type: 'FORTIFY_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.fortified) throw new Error('Stack is already fortified');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  return {
    ...state,
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, fortified: true, movementLeft: 0, hasActedThisTurn: true },
    },
  };
}

function handleUnfortifyStack(
  state: GameState,
  action: Extract<GameAction, { type: 'UNFORTIFY_STACK' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');

  return {
    ...state,
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, fortified: false },
    },
  };
}

function handleDisbandUnit(
  state: GameState,
  action: Extract<GameAction, { type: 'DISBAND_UNIT' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');

  const unit = stack.units.find(u => u.id === action.unitId);
  if (!unit) throw new Error(`Unit ${action.unitId} not in stack`);
  if (stack.units.length === 1) throw new Error('Cannot disband last unit in stack');

  const baseCost = ERA3_RECRUIT_COSTS[unit.type as keyof typeof ERA3_RECRUIT_COSTS] ?? 2;
  const refund = Math.floor(baseCost * DISBAND_REFUND_FRACTION);

  const newStack = { ...stack, units: stack.units.filter(u => u.id !== action.unitId) };

  return {
    ...state,
    era3Stacks: { ...state.era3Stacks, [stack.id]: newStack },
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins + refund } }
        : p,
    ),
  };
}

// ── TERRAFORM ────────────────────────────────────────────────────────────────
// desert→plain (irrigate), mountain→hill (erode), swamp→plain (drain).
// Requires an own stack on or adjacent to the target hex.

function handleTerraform(
  state: GameState,
  action: Extract<GameAction, { type: 'TERRAFORM' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  const key = hexKey(action.coord);
  const hex = state.map.hexes[key];
  if (!hex) throw new Error('Invalid hex');

  const terraformMap: Partial<Record<import('../types/era3.js').HexTerrain, import('../types/era3.js').HexTerrain>> = {
    desert: 'plain',
    mountain: 'hill',
    swamp: 'plain',
  };
  const newTerrain = terraformMap[hex.terrain];
  if (!newTerrain) throw new Error('This terrain cannot be terraformed');

  const player = state.players.find(p => p.id === action.playerId);
  if (!player?.era3State) throw new Error('No player state');
  if (player.era3State.goldCoins < TERRAFORM_COST) throw new Error('Not enough gold');

  return {
    ...state,
    map: {
      ...state.map,
      hexes: { ...state.map.hexes, [key]: { ...hex, terrain: newTerrain } },
    },
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, hasActedThisTurn: true },
    },
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins - TERRAFORM_COST } }
        : p,
    ),
  };
}

// ── BUILD_ROAD_OVERLAY ────────────────────────────────────────────────────────
// Adds a visual road overlay to a mountain or desert hex without changing terrain.

function handleBuildRoadOverlay(
  state: GameState,
  action: Extract<GameAction, { type: 'BUILD_ROAD_OVERLAY' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  const key = hexKey(action.coord);
  const hex = state.map.hexes[key];
  if (!hex) throw new Error('Invalid hex');
  if (hex.terrain !== 'mountain' && hex.terrain !== 'desert') {
    throw new Error('Road overlay only allowed on mountain or desert');
  }
  if (hex.hasRoadOverlay) throw new Error('Road already built on this hex');

  const player = state.players.find(p => p.id === action.playerId);
  if (!player?.era3State) throw new Error('No player state');
  if (player.era3State.goldCoins < BUILD_ROAD_OVERLAY_COST) throw new Error('Not enough gold');

  return {
    ...state,
    map: {
      ...state.map,
      hexes: { ...state.map.hexes, [key]: { ...hex, hasRoadOverlay: true } },
    },
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, hasActedThisTurn: true },
    },
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins - BUILD_ROAD_OVERLAY_COST } }
        : p,
    ),
  };
}

// ── DRAIN_WATER ───────────────────────────────────────────────────────────────
// Drains a lake or river hex into a plain. Requires own adjacent/on stack.

function handleDrainWater(
  state: GameState,
  action: Extract<GameAction, { type: 'DRAIN_WATER' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  const key = hexKey(action.coord);
  const hex = state.map.hexes[key];
  if (!hex) throw new Error('Invalid hex');
  if (hex.terrain !== 'lake' && hex.terrain !== 'river') throw new Error('Can only drain lake or river hexes');

  const player = state.players.find(p => p.id === action.playerId);
  if (!player?.era3State) throw new Error('No player state');
  if (player.era3State.goldCoins < DRAIN_WATER_COST) throw new Error('Not enough gold');

  return {
    ...state,
    map: {
      ...state.map,
      hexes: { ...state.map.hexes, [key]: { ...hex, terrain: 'plain', hasBridge: undefined } },
    },
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, hasActedThisTurn: true },
    },
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins - DRAIN_WATER_COST } }
        : p,
    ),
  };
}

// ── BUILD_BRIDGE ──────────────────────────────────────────────────────────────
// Builds a bridge on a river hex, making it crossable at road movement cost.
// Requires own adjacent/on stack.

function handleBuildBridge(
  state: GameState,
  action: Extract<GameAction, { type: 'BUILD_BRIDGE' }>,
): GameState {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return state;
  if (!state.map || !state.era3Stacks) return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const stack = state.era3Stacks[action.stackId];
  if (!stack) throw new Error(`Unknown stack ${action.stackId}`);
  if (stack.ownerId !== action.playerId) throw new Error('You do not own that stack');
  if (stack.hasActedThisTurn) throw new Error('Stack already used its action this turn');

  const key = hexKey(action.coord);
  const hex = state.map.hexes[key];
  if (!hex) throw new Error('Invalid hex');
  if (hex.terrain !== 'river') throw new Error('Bridges can only be built on river hexes');
  if (hex.hasBridge) throw new Error('River already has a bridge');

  const player = state.players.find(p => p.id === action.playerId);
  if (!player?.era3State) throw new Error('No player state');
  if (player.era3State.goldCoins < BUILD_BRIDGE_COST) throw new Error('Not enough gold');

  return {
    ...state,
    map: {
      ...state.map,
      hexes: { ...state.map.hexes, [key]: { ...hex, hasBridge: true } },
    },
    era3Stacks: {
      ...state.era3Stacks,
      [stack.id]: { ...stack, hasActedThisTurn: true },
    },
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins - BUILD_BRIDGE_COST } }
        : p,
    ),
  };
}

function handleEra3UpgradeTech(
  state: GameState,
  action: Extract<GameAction, { type: 'ERA3_UPGRADE_TECH' }>,
): GameState {
  const phase = state.era3Phase;
  if (phase !== 'game_loop' && phase !== 'final_heroic_turn') return state;
  if (state.era3CurrentPlayerId !== action.playerId) throw new Error('Not your turn');

  const player = state.players.find(p => p.id === action.playerId);
  if (!player?.era3State) throw new Error('No player state');
  if (player.era3State.eliminated) throw new Error('Eliminated');

  const current = player.era3State.techLevels[action.tech] ?? 0;
  const maxLevel = (state as GameState & { era3AllowLevel6?: boolean }).era3AllowLevel6 ? 6 : 5;
  if (current >= maxLevel) throw new Error('Already at max level');

  const nextLevel = current + 1;
  const baseCost = getIncrementalCost(action.tech, nextLevel);
  const goldCost = Math.ceil(baseCost * ERA3_TECH_UPGRADE_MULTIPLIER);

  if (player.era3State.goldCoins < goldCost) throw new Error('Not enough gold');

  return {
    ...state,
    players: state.players.map(p =>
      p.id === action.playerId && p.era3State
        ? {
            ...p,
            era3State: {
              ...p.era3State,
              goldCoins: p.era3State.goldCoins - goldCost,
              techLevels: { ...p.era3State.techLevels, [action.tech]: nextLevel },
            },
          }
        : p,
    ),
  };
}
