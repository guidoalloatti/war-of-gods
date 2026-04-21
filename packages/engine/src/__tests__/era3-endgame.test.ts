import { describe, it, expect } from 'vitest';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { gameReducer } from '../reducer.js';
import {
  BOSS_STACK_ID, CITADEL_COORD, DHAKHAN_OWNER_ID,
  isBossAlive, buildBossStack,
} from '../era3/index.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';
import type { Stack } from '../types/era3.js';

const RACES: RaceId[] = ['elf', 'dwarf'];

function mkPlayer(id: string, raceId: RaceId): Player {
  const base: Player = {
    id, name: id, raceId, isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 25, hasTraded: false, hasPlaced: false, connected: true,
  };
  return { ...base, era2State: initPlayerEra2State(base) };
}

function mkState(seed = 7777): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

describe('Dhakhan boss stack', () => {
  it('is placed on the citadel at transition', () => {
    const s = mkState();
    const boss = s.era3Stacks?.[BOSS_STACK_ID];
    expect(boss).toBeTruthy();
    expect(boss!.ownerId).toBe(DHAKHAN_OWNER_ID);
    expect(boss!.position).toEqual({ q: 0, r: 0 });
    expect(boss!.units.length).toBe(6);

    const citadelHex = s.map!.hexes['0,0'];
    expect(citadelHex.stackId).toBe(BOSS_STACK_ID);
  });

  it('boss units use defense*2+3 HP (beefier than Wrought)', () => {
    const boss = buildBossStack(42);
    for (const u of boss.units) {
      expect(u.currentHp).toBeGreaterThanOrEqual(5);
    }
    // At least some units should have > 5 HP (non-infantry defense stat).
    expect(boss.units.some(u => u.currentHp > 5)).toBe(true);
  });

  it('isBossAlive tracks boss stack presence', () => {
    const s = mkState();
    expect(isBossAlive(s)).toBe(true);
    const withoutBoss: GameState = {
      ...s,
      era3Stacks: Object.fromEntries(
        Object.entries(s.era3Stacks ?? {}).filter(([id]) => id !== BOSS_STACK_ID),
      ),
    };
    expect(isBossAlive(withoutBoss)).toBe(false);
  });
});

describe('victory — killing the boss in game_loop', () => {
  it('wiping the boss stack flips phase to victory and records killer', () => {
    // With the 1-death-per-combat cap, killing the boss requires chipping
    // through its 6-unit stack. We fast-forward by trimming the boss down to
    // a single unit and then delivering the killing blow.
    const s = mkState();
    const p0 = s.players[0];
    const adj = { q: 1, r: 0 };
    const strongStack: Stack = {
      id: 'strong_p0',
      ownerId: p0.id,
      position: adj,
      movementLeft: 3,
      units: Array.from({ length: 6 }, (_, i) => ({
        id: `u_strong_${i}`,
        type: 'siege' as const,
        ownerId: p0.id,
        currentHp: 100,
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
      })),
    };
    const boss = s.era3Stacks![BOSS_STACK_ID];
    const weakenedBoss: Stack = {
      ...boss,
      units: [{ ...boss.units[0], currentHp: 1 }],
    };
    const newHexes = { ...s.map!.hexes };
    newHexes['1,0'] = { ...newHexes['1,0'], stackId: 'strong_p0' };
    const s2: GameState = {
      ...s,
      era3CurrentPlayerId: p0.id,
      map: { ...s.map!, hexes: newHexes },
      era3Stacks: { ...s.era3Stacks, strong_p0: strongStack, [BOSS_STACK_ID]: weakenedBoss },
    };

    const next = gameReducer(s2, {
      type: 'MOVE_STACK', playerId: p0.id, stackId: 'strong_p0', path: [CITADEL_COORD],
    });

    expect(next.era3Phase).toBe('victory');
    expect(next.era3BossKillerId).toBe(p0.id);
    expect(next.era3Stacks?.[BOSS_STACK_ID]).toBeUndefined();
  });
});

describe('final heroic turn trigger', () => {
  it('sets era3HeroicTurnTriggered when a player stack becomes adjacent to the citadel', () => {
    const s = mkState();
    // Fabricate a state where p0 has a stack at (1,0) and boss is still alive.
    const p0 = s.players[0];
    const hitman: Stack = {
      id: 'hitman',
      ownerId: p0.id,
      position: { q: 1, r: 0 },
      movementLeft: 0,
      units: [{
        id: 'u_h',
        type: 'infantry',
        ownerId: p0.id,
        currentHp: 3,
        hasMovedThisTurn: true,
        hasAttackedThisTurn: false,
      }],
    };
    const s2: GameState = {
      ...s,
      era3CurrentPlayerId: p0.id,
      era3Stacks: { ...s.era3Stacks, hitman },
    };

    const next = gameReducer(s2, { type: 'END_TURN', playerId: p0.id });
    expect(next.era3HeroicTurnTriggered).toBe(true);
  });

  it('enters final_heroic_turn phase on cycle wrap after trigger', () => {
    let s = mkState();
    const p0 = s.players[0];
    const hitman: Stack = {
      id: 'hitman',
      ownerId: p0.id,
      position: { q: 1, r: 0 },
      movementLeft: 0,
      units: [{
        id: 'u_h',
        type: 'infantry',
        ownerId: p0.id,
        currentHp: 3,
        hasMovedThisTurn: true,
        hasAttackedThisTurn: false,
      }],
    };
    s = { ...s, era3Stacks: { ...s.era3Stacks, hitman } };

    // Complete the full cycle: every player ends turn.
    for (const pid of s.era3TurnOrder!) {
      s = gameReducer(s, { type: 'END_TURN', playerId: pid });
    }

    expect(s.era3Phase).toBe('final_heroic_turn');
    expect(s.era3HeroicTurnsTaken).toEqual({});
  });
});

describe('final heroic turn flow', () => {
  it('every living player takes one turn; no-win → defeat', () => {
    let s = mkState();
    s = { ...s, era3Phase: 'final_heroic_turn', era3HeroicTurnsTaken: {}, era3HeroicTurnTriggered: true };

    for (const pid of s.era3TurnOrder!) {
      s = { ...s, era3CurrentPlayerId: pid };
      s = gameReducer(s, { type: 'END_TURN', playerId: pid });
    }

    // No one killed the boss → defeat.
    expect(s.era3Phase).toBe('defeat');
  });
});

describe('defeat — all capitals captured', () => {
  it('transitions to defeat when every player is eliminated', () => {
    let s = mkState();
    s = {
      ...s,
      players: s.players.map(p => ({
        ...p,
        era3State: p.era3State ? { ...p.era3State, eliminated: true } : p.era3State,
      })),
    };
    // Any END_TURN detects defeat.
    const first = s.era3CurrentPlayerId!;
    const next = gameReducer(s, { type: 'END_TURN', playerId: first });
    expect(next.era3Phase).toBe('defeat');
  });
});
