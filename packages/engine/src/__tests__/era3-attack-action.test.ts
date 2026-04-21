import { describe, it, expect } from 'vitest';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { gameReducer } from '../reducer.js';
import {
  DHAKHAN_OWNER_ID, hexKey, neighbors, getTerrainMoveCost,
  resolveFlankingCombat,
} from '../era3/index.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';
import type { Stack, Unit, HexCoord } from '../types/era3.js';

const RACES: RaceId[] = ['elf', 'dwarf'];

function mkPlayer(id: string, raceId: RaceId): Player {
  const base: Player = {
    id, name: id, raceId, isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 25, hasTraded: false, hasPlaced: false, connected: true,
  };
  return { ...base, era2State: initPlayerEra2State(base) };
}

function era3Ready(seed = 9999): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return gameReducer(transitionEra2ToEra3(base), { type: 'START_ERA3_GAME_LOOP' });
}

function mkUnit(id: string, type: Unit['type'], hp = 2): Unit {
  return { id, type, ownerId: 'x', currentHp: hp, hasMovedThisTurn: false, hasAttackedThisTurn: false };
}

/** Plant an enemy stack at a specific coord. */
function plantWrought(state: GameState, at: HexCoord, units: Unit[]): { state: GameState; id: string } {
  const id = `wrought_${at.q}_${at.r}`;
  const stack: Stack = {
    id,
    ownerId: DHAKHAN_OWNER_ID,
    units: units.map(u => ({ ...u, ownerId: DHAKHAN_OWNER_ID })),
    position: at,
    movementLeft: 0,
  };
  const key = hexKey(at);
  const stacks = { ...state.era3Stacks, [id]: stack };
  const hexes = { ...state.map!.hexes };
  hexes[key] = { ...hexes[key], stackId: id };
  return {
    state: { ...state, era3Stacks: stacks, map: { ...state.map!, hexes } },
    id,
  };
}

/** Move the player's starting stack to a target coord (bypass pathing). */
function relocateStack(state: GameState, stackId: string, to: HexCoord): GameState {
  const stack = state.era3Stacks![stackId];
  const fromKey = hexKey(stack.position);
  const toKey = hexKey(to);
  const hexes = { ...state.map!.hexes };
  if (hexes[fromKey]?.stackId === stackId) {
    hexes[fromKey] = { ...hexes[fromKey], stackId: null };
  }
  hexes[toKey] = { ...hexes[toKey], stackId };
  const stacks = { ...state.era3Stacks, [stackId]: { ...stack, position: to } };
  return { ...state, map: { ...state.map!, hexes }, era3Stacks: stacks };
}

describe('ATTACK_STACK action', () => {
  it('lets a player attack an adjacent Wrought without moving', () => {
    let s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(
      st => st.ownerId === current,
    )!;
    // Place a weak wrought adjacent to the player.
    const adj = neighbors(playerStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && getTerrainMoveCost(h.terrain) < Infinity && !h.stackId;
    })!;
    const planted = plantWrought(s, adj, [mkUnit('w1', 'infantry', 1)]);
    s = planted.state;

    const movementBefore = s.era3Stacks![playerStack.id].movementLeft;
    const next = gameReducer(s, {
      type: 'ATTACK_STACK',
      playerId: current,
      attackerStackId: playerStack.id,
      targetCoord: adj,
    });

    // Wrought wiped.
    expect(next.era3Stacks![planted.id]).toBeUndefined();
    // Attacker stays in place (did not advance).
    expect(next.era3Stacks![playerStack.id].position).toEqual(playerStack.position);
    // Movement untouched.
    expect(next.era3Stacks![playerStack.id].movementLeft).toBe(movementBefore);
    // Combat log has kind='attack'.
    const entry = next.era3CombatLog![next.era3CombatLog!.length - 1];
    expect(entry.kind).toBe('attack');
    expect(entry.defenderWiped).toBe(true);
    // Attacker marked as having attacked this turn.
    expect(next.era3Stacks![playerStack.id].units.every(u => u.hasAttackedThisTurn)).toBe(true);
  });

  it('rejects attacking a non-adjacent hex', () => {
    let s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    // Put a wrought 3 hexes away.
    const farCoord = { q: playerStack.position.q + 3, r: playerStack.position.r };
    if (!s.map!.hexes[hexKey(farCoord)]) return;
    const planted = plantWrought(s, farCoord, [mkUnit('w1', 'infantry', 1)]);
    s = planted.state;

    expect(() =>
      gameReducer(s, {
        type: 'ATTACK_STACK',
        playerId: current,
        attackerStackId: playerStack.id,
        targetCoord: farCoord,
      }),
    ).toThrow(/adjacent/i);
  });

  it('rejects attacking an empty hex', () => {
    const s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const adj = neighbors(playerStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.stackId;
    })!;
    expect(() =>
      gameReducer(s, {
        type: 'ATTACK_STACK',
        playerId: current,
        attackerStackId: playerStack.id,
        targetCoord: adj,
      }),
    ).toThrow(/no target/i);
  });

  it('rejects attacking when already attacked this turn', () => {
    let s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const adj = neighbors(playerStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && getTerrainMoveCost(h.terrain) < Infinity && !h.stackId;
    })!;
    // Plant two tough wrought stacks at two adjacent hexes.
    const planted1 = plantWrought(s, adj, [mkUnit('w1', 'infantry', 5)]);
    s = planted1.state;
    const adj2 = neighbors(playerStack.position).find(n =>
      hexKey(n) !== hexKey(adj) && !s.map!.hexes[hexKey(n)]?.stackId
      && getTerrainMoveCost(s.map!.hexes[hexKey(n)]?.terrain ?? 'mountain') < Infinity,
    );
    if (!adj2) return;
    const planted2 = plantWrought(s, adj2, [mkUnit('w2', 'infantry', 5)]);
    s = planted2.state;

    s = gameReducer(s, {
      type: 'ATTACK_STACK',
      playerId: current,
      attackerStackId: playerStack.id,
      targetCoord: adj,
    });
    // Stack still alive? Try to attack again.
    if (!s.era3Stacks![playerStack.id]) return;
    expect(() =>
      gameReducer(s, {
        type: 'ATTACK_STACK',
        playerId: current,
        attackerStackId: playerStack.id,
        targetCoord: adj2,
      }),
    ).toThrow(/already attacked/i);
  });
});

describe('resolveFlankingCombat', () => {
  it('reduces to single-attacker when no flankers', () => {
    const a: Stack = {
      id: 'a', ownerId: 'p1', position: { q: 0, r: 0 }, movementLeft: 0,
      units: [mkUnit('u1', 'infantry', 3), mkUnit('u2', 'infantry', 3)],
    };
    const d: Stack = {
      id: 'd', ownerId: 'p2', position: { q: 1, r: 0 }, movementLeft: 0,
      units: [mkUnit('d1', 'infantry', 3), mkUnit('d2', 'infantry', 3)],
    };
    const r = resolveFlankingCombat(a, [], d, { q: 1, r: 0 }, 1);
    // Two infantry attack 2 each = 4 damage each way.
    expect(r.entry.attackerDamageDealt).toBe(4);
    expect(r.entry.defenderDamageDealt).toBe(4);
    expect(r.flankingAttackers).toHaveLength(0);
  });

  it('sums attacker damage across all attackers (flankers included)', () => {
    const a: Stack = {
      id: 'a', ownerId: 'p1', position: { q: 0, r: 0 }, movementLeft: 0,
      units: [mkUnit('u1', 'infantry', 3)], // atk 2
    };
    const f: Stack = {
      id: 'f', ownerId: 'p1', position: { q: 0, r: 1 }, movementLeft: 0,
      units: [mkUnit('f1', 'mounted', 3)], // atk 4
    };
    const d: Stack = {
      id: 'd', ownerId: 'p2', position: { q: 1, r: 0 }, movementLeft: 0,
      units: [mkUnit('d1', 'infantry', 10)], // single tank
    };
    const r = resolveFlankingCombat(a, [f], d, { q: 1, r: 0 }, 1);
    expect(r.entry.attackerDamageDealt).toBe(6); // 2 + 4
    expect(r.entry.flankingStackIds).toEqual(['f']);
  });

  it('splits defender retaliation proportionally to attacker damage', () => {
    // Primary deals 2 (infantry), flanker deals 4 (mounted). Defender deals 6.
    // Expected split: primary takes 2 (33%), flanker takes 4 (67%).
    const a: Stack = {
      id: 'a', ownerId: 'p1', position: { q: 0, r: 0 }, movementLeft: 0,
      units: [mkUnit('u1', 'infantry', 10)],
    };
    const f: Stack = {
      id: 'f', ownerId: 'p1', position: { q: 0, r: 1 }, movementLeft: 0,
      units: [mkUnit('f1', 'mounted', 10)],
    };
    // Defender: one unit with attack=6 → easiest to get 6 retaliation is 3x infantry (atk 2 each).
    const d: Stack = {
      id: 'd', ownerId: 'p2', position: { q: 1, r: 0 }, movementLeft: 0,
      units: [
        mkUnit('d1', 'infantry', 10),
        mkUnit('d2', 'infantry', 10),
        mkUnit('d3', 'infantry', 10),
      ],
    };
    const r = resolveFlankingCombat(a, [f], d, { q: 1, r: 0 }, 1);
    // Total retaliation split between the two attackers equals defender damage.
    const primaryHpLost = 10 - r.primaryAttacker.units[0].currentHp;
    const flankerHpLost = 10 - r.flankingAttackers[0].units[0].currentHp;
    expect(primaryHpLost + flankerHpLost).toBe(r.entry.defenderDamageDealt);
    // Flanker should take equal or more than primary (since it dealt more damage).
    expect(flankerHpLost).toBeGreaterThanOrEqual(primaryHpLost);
  });

  it('attackerWiped is true only when every attacker dies', () => {
    const a: Stack = {
      id: 'a', ownerId: 'p1', position: { q: 0, r: 0 }, movementLeft: 0,
      units: [mkUnit('u1', 'infantry', 1)],
    };
    const f: Stack = {
      id: 'f', ownerId: 'p1', position: { q: 0, r: 1 }, movementLeft: 0,
      units: [mkUnit('f1', 'infantry', 50)], // huge HP
    };
    // Defender kills 100 HP total → primary dies, flanker survives.
    const d: Stack = {
      id: 'd', ownerId: 'p2', position: { q: 1, r: 0 }, movementLeft: 0,
      units: Array.from({ length: 20 }, (_, i) => mkUnit(`d${i}`, 'infantry', 1)),
    };
    const r = resolveFlankingCombat(a, [f], d, { q: 1, r: 0 }, 1);
    expect(r.primaryWiped).toBe(true);
    expect(r.flankersWiped[0]).toBe(false);
    expect(r.entry.attackerWiped).toBe(false); // at least one attacker still alive
  });
});

describe('ATTACK_STACK with flanking (end-to-end)', () => {
  it('includes adjacent own stacks as flankers automatically', () => {
    let s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    // Pick a target hex where at least two of the player's hexes could be adjacent.
    const target = neighbors(playerStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && getTerrainMoveCost(h.terrain) < Infinity && !h.stackId;
    })!;
    // Find a second hex adjacent to BOTH the target and empty.
    const flankPos = neighbors(target).find(n => {
      if (hexKey(n) === hexKey(playerStack.position)) return false;
      const h = s.map!.hexes[hexKey(n)];
      return h && getTerrainMoveCost(h.terrain) < Infinity && !h.stackId;
    });
    if (!flankPos) return;

    // Create a second player stack at flankPos.
    const flankerId = 'player_flanker';
    const flanker: Stack = {
      id: flankerId,
      ownerId: current,
      units: [mkUnit('fu1', 'mounted', 3)],
      position: flankPos,
      movementLeft: 0,
    };
    const hexes = { ...s.map!.hexes, [hexKey(flankPos)]: { ...s.map!.hexes[hexKey(flankPos)], stackId: flankerId } };
    s = {
      ...s,
      era3Stacks: { ...s.era3Stacks, [flankerId]: flanker },
      map: { ...s.map!, hexes },
    };

    // Plant a tough wrought at the target.
    const planted = plantWrought(s, target, [mkUnit('w1', 'infantry', 2), mkUnit('w2', 'infantry', 2)]);
    s = planted.state;

    const next = gameReducer(s, {
      type: 'ATTACK_STACK',
      playerId: current,
      attackerStackId: playerStack.id,
      targetCoord: target,
    });

    const entry = next.era3CombatLog![next.era3CombatLog!.length - 1];
    expect(entry.flankingStackIds).toContain(flankerId);
    // Flanker also gets marked as attacked (if it survived).
    if (next.era3Stacks![flankerId]) {
      expect(next.era3Stacks![flankerId].units.every(u => u.hasAttackedThisTurn)).toBe(true);
    }
  });

  it('excludes non-adjacent own stacks from flanking', () => {
    let s = era3Ready();
    const current = s.era3CurrentPlayerId!;
    const playerStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const target = neighbors(playerStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && getTerrainMoveCost(h.terrain) < Infinity && !h.stackId;
    })!;
    // Put a far-away own stack that is NOT adjacent to the target.
    const far = Object.values(s.map!.hexes).find(h =>
      !h.stackId
      && getTerrainMoveCost(h.terrain) < Infinity
      && !neighbors(h.coord).some(n => n.q === target.q && n.r === target.r),
    );
    if (!far) return;
    const farStackId = 'player_far';
    const farStack: Stack = {
      id: farStackId,
      ownerId: current,
      units: [mkUnit('fs1', 'infantry', 3)],
      position: far.coord,
      movementLeft: 0,
    };
    const hexes = { ...s.map!.hexes, [hexKey(far.coord)]: { ...s.map!.hexes[hexKey(far.coord)], stackId: farStackId } };
    s = {
      ...s,
      era3Stacks: { ...s.era3Stacks, [farStackId]: farStack },
      map: { ...s.map!, hexes },
    };
    const planted = plantWrought(s, target, [mkUnit('w1', 'infantry', 1)]);
    s = planted.state;

    const next = gameReducer(s, {
      type: 'ATTACK_STACK',
      playerId: current,
      attackerStackId: playerStack.id,
      targetCoord: target,
    });
    const entry = next.era3CombatLog![next.era3CombatLog!.length - 1];
    expect(entry.flankingStackIds ?? []).not.toContain(farStackId);
  });
});

// Touch unused import to keep CI quiet if future tests use it.
void relocateStack;
