import { describe, it, expect } from 'vitest';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { gameReducer } from '../reducer.js';
import { spawnWroughtForCycle, DHAKHAN_OWNER_ID, hexKey, neighbors, getTerrainMoveCost } from '../era3/index.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';
import type { Stack, Unit } from '../types/era3.js';

const RACES: RaceId[] = ['elf', 'dwarf'];

function mkPlayer(id: string, raceId: RaceId): Player {
  const base: Player = {
    id, name: id, raceId, isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 25, hasTraded: false, hasPlaced: false, connected: true,
  };
  return { ...base, era2State: initPlayerEra2State(base) };
}

function era3ReadyToFight(seed = 4242): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return gameReducer(transitionEra2ToEra3(base), { type: 'START_ERA3_GAME_LOOP' });
}

/**
 * Plant a Wrought stack with the given units adjacent to `playerStack`, on a
 * passable empty neighbor. Returns updated state + the Wrought stack id + the
 * chosen hex coord.
 */
function plantWroughtAdjacent(
  state: GameState,
  playerStackId: string,
  units: Unit[],
): { state: GameState; wroughtStackId: string; at: { q: number; r: number } } {
  const playerStack = state.era3Stacks![playerStackId];
  const candidate = neighbors(playerStack.position).find(n => {
    const h = state.map!.hexes[hexKey(n)];
    if (!h || h.stackId) return false;
    const cost = getTerrainMoveCost(h.terrain);
    return cost <= playerStack.movementLeft;
  })!;
  const wroughtId = 'wrought_test_1';
  const wrought: Stack = {
    id: wroughtId,
    ownerId: DHAKHAN_OWNER_ID,
    units: units.map(u => ({ ...u, ownerId: DHAKHAN_OWNER_ID })),
    position: candidate,
    movementLeft: 0,
  };
  const stacks = { ...state.era3Stacks, [wroughtId]: wrought };
  const hexes = { ...state.map!.hexes };
  const k = hexKey(candidate);
  hexes[k] = { ...hexes[k], stackId: wroughtId };
  return {
    state: { ...state, era3Stacks: stacks, map: { ...state.map!, hexes } },
    wroughtStackId: wroughtId,
    at: candidate,
  };
}

function mkUnit(id: string, type: 'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying', hp = 1): Unit {
  return { id, type, ownerId: 'x', currentHp: hp, hasMovedThisTurn: false, hasAttackedThisTurn: false };
}

describe('MOVE_STACK into Wrought hex → combat', () => {
  it('attacking a Wrought stack resolves combat and advances on kill', () => {
    const base = era3ReadyToFight();
    const current = base.era3CurrentPlayerId!;
    const playerStack = Object.values(base.era3Stacks!).find(s => s.ownerId === current)!;
    // Plant 1 weak Wrought infantry (hp 1) — player stack (≥1 unit) should crush it.
    const { state, wroughtStackId, at } = plantWroughtAdjacent(base, playerStack.id, [mkUnit('w1', 'infantry', 1)]);

    const next = gameReducer(state, {
      type: 'MOVE_STACK', playerId: current, stackId: playerStack.id, path: [at],
    });

    // Wrought stack should be removed.
    expect(next.era3Stacks![wroughtStackId]).toBeUndefined();
    // Player stack advanced to the hex.
    expect(next.era3Stacks![playerStack.id].position).toEqual(at);
    expect(next.map!.hexes[hexKey(at)].stackId).toBe(playerStack.id);
    // Combat log has an entry.
    expect(next.era3CombatLog).toHaveLength(1);
    expect(next.era3CombatLog![0].defenderWiped).toBe(true);
  });

  it('attacking with no chance of victory wipes attacker, defender stays', () => {
    const base = era3ReadyToFight();
    const current = base.era3CurrentPlayerId!;
    const playerStack = Object.values(base.era3Stacks!).find(s => s.ownerId === current)!;
    // Plant a big Wrought force (6 flying, hp 3 each = 18 hp total, atk 6 each = 36 dmg).
    const bigUnits: Unit[] = Array.from({ length: 6 }, (_, i) => mkUnit(`w${i}`, 'flying', 3));
    const { state, wroughtStackId, at } = plantWroughtAdjacent(base, playerStack.id, bigUnits);

    const next = gameReducer(state, {
      type: 'MOVE_STACK', playerId: current, stackId: playerStack.id, path: [at],
    });

    // Attacker wiped.
    expect(next.era3Stacks![playerStack.id]).toBeUndefined();
    // Defender still there.
    expect(next.era3Stacks![wroughtStackId]).toBeTruthy();
    expect(next.map!.hexes[hexKey(at)].stackId).toBe(wroughtStackId);
    expect(next.era3CombatLog![0].attackerWiped).toBe(true);
  });

  it('rejects multi-step path through another stack', () => {
    const base = era3ReadyToFight();
    const current = base.era3CurrentPlayerId!;
    const playerStack = Object.values(base.era3Stacks!).find(s => s.ownerId === current)!;
    const { state, at } = plantWroughtAdjacent(base, playerStack.id, [mkUnit('w1', 'infantry', 1)]);
    // Attempt to path through the Wrought hex to something past it — grab a neighbor of `at`.
    const beyond = neighbors(at).find(n => {
      const h = state.map!.hexes[hexKey(n)];
      return h && hexKey(n) !== hexKey(playerStack.position) && !h.stackId && getTerrainMoveCost(h.terrain) < Infinity;
    });
    if (!beyond) return; // skip if no valid beyond hex
    expect(() =>
      gameReducer(state, {
        type: 'MOVE_STACK', playerId: current, stackId: playerStack.id, path: [at, beyond],
      }),
    ).toThrow(/passes through/i);
  });
});

describe('Dhakhan capital capture', () => {
  it('player with captured capital is marked eliminated', () => {
    let s = era3ReadyToFight();
    const order = s.era3TurnOrder!;
    // Spawn Wrought manually on a player capital hex to simulate capture.
    const target = Object.values(s.map!.hexes).find(h => h.isCapital)!;
    // Overwrite the capital's stack (the player's starting stack) with a Wrought stack.
    const wroughtId = 'wrought_capture';
    const wrought: Stack = {
      id: wroughtId,
      ownerId: DHAKHAN_OWNER_ID,
      units: [mkUnit('w1', 'flying', 3), mkUnit('w2', 'flying', 3)],
      position: { q: target.coord.q, r: target.coord.r - 1 }, // adjacent
      movementLeft: 0,
    };
    // Place adjacent, clear existing.
    const adjCoord = { q: target.coord.q, r: target.coord.r - 1 };
    const adjKey = hexKey(adjCoord);
    const newHexes = { ...s.map!.hexes };
    // Clear the capital's defender so the Wrought can walk in unopposed.
    const capKey = hexKey(target.coord);
    const capStackId = newHexes[capKey].stackId;
    newHexes[capKey] = { ...newHexes[capKey], stackId: null };
    // Clear candidate adjacent hex's stack if any.
    if (newHexes[adjKey]?.stackId) {
      newHexes[adjKey] = { ...newHexes[adjKey], stackId: null };
    }
    newHexes[adjKey] = { ...newHexes[adjKey], stackId: wroughtId };
    const newStacks: Record<string, Stack> = { ...s.era3Stacks, [wroughtId]: wrought };
    if (capStackId) delete newStacks[capStackId];
    s = { ...s, map: { ...s.map!, hexes: newHexes }, era3Stacks: newStacks };

    // End every player's turn so we trigger end-of-cycle Dhakhan movement.
    for (const pid of order) {
      s = gameReducer(s, { type: 'END_TURN', playerId: pid });
    }

    const capturedPlayer = s.players.find(p => p.id === target.capitalOwnerId)!;
    expect(capturedPlayer.era3State?.eliminated).toBe(true);
  });
});
