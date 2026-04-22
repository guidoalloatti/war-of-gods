import { describe, it, expect } from 'vitest';
import { gameReducer } from '../reducer.js';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { resolveCombat } from '../era3/combat.js';
import {
  cycleIncome,
  applyCycleIncome,
  validateRecruit,
  recruitUnit,
  warAttackBonus,
} from '../era3/economy.js';
import {
  ERA3_BASE_INCOME,
  ERA3_RECRUIT_COSTS,
  ERA3_WAR_ATTACK_BONUS,
  ERA3_WAR_ATTACK_BONUS_THRESHOLD,
} from '../era3/constants.js';
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

function era3Game(seed = 9999): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

describe('cycleIncome', () => {
  it('equals base + economy tech', () => {
    const s = era3Game();
    const p = s.players[0];
    const expected = ERA3_BASE_INCOME + p.era3State!.techLevels.economy;
    expect(cycleIncome(p)).toBe(expected);
  });

  it('returns 0 for eliminated players', () => {
    const s = era3Game();
    const p = { ...s.players[0], era3State: { ...s.players[0].era3State!, eliminated: true } };
    expect(cycleIncome(p)).toBe(0);
  });
});

describe('applyCycleIncome', () => {
  it('adds income to every active player', () => {
    const s = era3Game();
    const before = s.players.map(p => p.era3State!.goldCoins);
    const after = applyCycleIncome(s.players).map(p => p.era3State!.goldCoins);
    for (let i = 0; i < s.players.length; i++) {
      expect(after[i]).toBe(before[i] + cycleIncome(s.players[i]));
    }
  });

  it('skips eliminated players', () => {
    const s = era3Game();
    const players = [
      s.players[0],
      { ...s.players[1], era3State: { ...s.players[1].era3State!, eliminated: true } },
    ];
    const after = applyCycleIncome(players);
    expect(after[1].era3State!.goldCoins).toBe(players[1].era3State!.goldCoins);
  });
});

describe('recruitUnit', () => {
  it('validates successfully on own turn with enough gold', () => {
    let s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === pid ? { ...p, era3State: { ...p.era3State!, goldCoins: 10 } } : p,
      ),
    };
    expect(validateRecruit(s, pid, 'infantry').ok).toBe(true);
  });

  it('rejects when not player\'s turn', () => {
    const s = era3Game();
    const other = s.players.find(p => p.id !== s.era3CurrentPlayerId)!;
    const v = validateRecruit(s, other.id, 'infantry');
    expect(v.ok).toBe(false);
  });

  it('rejects when gold is insufficient', () => {
    let s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === pid ? { ...p, era3State: { ...p.era3State!, goldCoins: 0 } } : p,
      ),
    };
    expect(validateRecruit(s, pid, 'infantry').ok).toBe(false);
  });

  it('deducts gold, adds unit to capital stack, increments counter', () => {
    let s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === pid ? { ...p, era3State: { ...p.era3State!, goldCoins: 10 } } : p,
      ),
    };
    const player = s.players.find(p => p.id === pid)!;
    const capKey = `${player.era3State!.capitalCoord.q},${player.era3State!.capitalCoord.r}`;
    const capStackIdBefore = s.map!.hexes[capKey].stackId!;
    const unitsBefore = s.era3Stacks![capStackIdBefore].units.length;

    const next = gameReducer(s, { type: 'RECRUIT_UNIT', playerId: pid, unitType: 'infantry' });

    const playerAfter = next.players.find(p => p.id === pid)!;
    expect(playerAfter.era3State!.goldCoins).toBe(10 - ERA3_RECRUIT_COSTS.infantry);
    expect(playerAfter.era3State!.recruitsThisTurn).toBe(1);
    const capStackIdAfter = next.map!.hexes[capKey].stackId!;
    expect(next.era3Stacks![capStackIdAfter].units.length).toBe(unitsBefore + 1);
  });

  it('rejects a recruit beyond the war-tech limit', () => {
    let s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    // War 2 → 3 recruits/turn; Resources 5 → max stack 6; Science 5 → all units unlocked
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === pid
          ? { ...p, era3State: { ...p.era3State!, goldCoins: 40, techLevels: { war: 2, science: 5, resources: 5, economy: 0, religion: 0 } } }
          : p,
      ),
    };
    s = recruitUnit(s, pid, 'infantry');
    s = recruitUnit(s, pid, 'infantry');
    s = recruitUnit(s, pid, 'infantry');
    expect(() => recruitUnit(s, pid, 'infantry')).toThrow(/Already recruited/);
  });
});

describe('warAttackBonus', () => {
  it('returns bonus when owner has war >= threshold', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const players = s.players.map(p =>
      p.id === pid
        ? {
            ...p,
            era3State: {
              ...p.era3State!,
              techLevels: { ...p.era3State!.techLevels, war: ERA3_WAR_ATTACK_BONUS_THRESHOLD },
            },
          }
        : p,
    );
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === pid)!;
    expect(warAttackBonus(stack, players)).toBe(ERA3_WAR_ATTACK_BONUS);
  });

  it('returns 0 when owner has war below threshold', () => {
    const s = era3Game();
    const stack = Object.values(s.era3Stacks!)[0];
    expect(warAttackBonus(stack, s.players)).toBe(0);
  });

  it('returns 0 for Dhakhan stacks', () => {
    const s = era3Game();
    const dhakhanStack: Stack = {
      id: 'dk', ownerId: 'dhakhan', units: [], position: { q: 0, r: 0 }, movementLeft: 0,
    };
    expect(warAttackBonus(dhakhanStack, s.players)).toBe(0);
  });
});

describe('resolveCombat war bonus integration', () => {
  it('attacker with +1 per-unit bonus deals more damage', () => {
    const mkUnit = (id: string): Unit => ({
      id, type: 'infantry', ownerId: 'a', currentHp: 3,
      hasMovedThisTurn: false, hasAttackedThisTurn: false,
    });
    const attacker: Stack = {
      id: 'a', ownerId: 'pA',
      units: [mkUnit('a1'), mkUnit('a2')],
      position: { q: 0, r: 0 }, movementLeft: 0,
    };
    const defender: Stack = {
      id: 'd', ownerId: 'pB',
      units: [{ ...mkUnit('d1'), ownerId: 'pB' }, { ...mkUnit('d2'), ownerId: 'pB' }],
      position: { q: 1, r: 0 }, movementLeft: 0,
    };
    const plain = resolveCombat(attacker, defender, { q: 1, r: 0 }, 1);
    const bonused = resolveCombat(attacker, defender, { q: 1, r: 0 }, 1, { attackerPerUnit: 1 });
    expect(bonused.entry.attackerDamageDealt).toBe(plain.entry.attackerDamageDealt + 2);
  });
});

describe('END_TURN income + recruit reset', () => {
  it('grants income after a full cycle wraps', () => {
    let s = era3Game();
    const order = s.era3TurnOrder!;
    const before = s.players.map(p => p.era3State!.goldCoins);
    for (const pid of order) {
      s = gameReducer(s, { type: 'END_TURN', playerId: pid });
    }
    const after = s.players.map(p => p.era3State!.goldCoins);
    for (let i = 0; i < order.length; i++) {
      expect(after[i]).toBeGreaterThan(before[i]);
    }
  });

  it('resets recruitsThisTurn when a new turn starts', () => {
    let s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === pid ? { ...p, era3State: { ...p.era3State!, goldCoins: 20 } } : p,
      ),
    };
    s = recruitUnit(s, pid, 'infantry');
    expect(s.players.find(p => p.id === pid)!.era3State!.recruitsThisTurn).toBe(1);

    const order = s.era3TurnOrder!;
    for (const p of order) {
      s = gameReducer(s, { type: 'END_TURN', playerId: p });
    }
    // After a full cycle, the original player's counter is reset on their turn start.
    // Each player's counter is reset individually when their turn begins.
    expect(s.players.find(p => p.id === s.era3CurrentPlayerId)!.era3State!.recruitsThisTurn).toBe(0);
  });
});
