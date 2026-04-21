import { describe, it, expect } from 'vitest';
import {
  isVeteran, unitAttack, unitDefense, unitMaxHp,
  VETERAN_WIN_THRESHOLD, VETERAN_ATK_BONUS, VETERAN_DEF_BONUS, VETERAN_HP_BONUS,
  resolveCombat,
} from '../era3/index.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import type { Unit, Stack } from '../types/era3.js';

function mkUnit(id: string, ownerId: string, wins = 0): Unit {
  const def = UNIT_DEFINITIONS.find(d => d.id === 'infantry')!;
  return {
    id, type: 'infantry', ownerId,
    currentHp: def.defense + 2, // engine formula (see economy.ts / init.ts)
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    wins,
  };
}

function mkStack(id: string, ownerId: string, unitCount: number, wins = 0): Stack {
  return {
    id, ownerId,
    units: Array.from({ length: unitCount }, (_, i) => mkUnit(`${id}_u${i}`, ownerId, wins)),
    position: { q: 0, r: 0 },
    movementLeft: 3,
  };
}

describe('veteran system', () => {
  it('unit with wins < threshold is not veteran', () => {
    const u = mkUnit('u1', 'p1', VETERAN_WIN_THRESHOLD - 1);
    expect(isVeteran(u)).toBe(false);
  });

  it('unit with wins >= threshold is veteran', () => {
    const u = mkUnit('u1', 'p1', VETERAN_WIN_THRESHOLD);
    expect(isVeteran(u)).toBe(true);
  });

  it('veteran stats are buffed', () => {
    const rookie = mkUnit('r', 'p1', 0);
    const vet = mkUnit('v', 'p1', VETERAN_WIN_THRESHOLD);
    expect(unitAttack(vet)).toBe(unitAttack(rookie) + VETERAN_ATK_BONUS);
    expect(unitDefense(vet)).toBe(unitDefense(rookie) + VETERAN_DEF_BONUS);
    expect(unitMaxHp(vet)).toBe(unitMaxHp(rookie) + VETERAN_HP_BONUS);
  });

  it('surviving winners gain +1 win after combat', () => {
    // Attacker stack (3 units) overwhelms defender (1 unit).
    const atk = mkStack('atk', 'p1', 3);
    const def = mkStack('def', 'p2', 1);
    const result = resolveCombat(atk, def, { q: 0, r: 0 }, 1);
    expect(result.defenderWiped).toBe(true);
    expect(result.attackerWiped).toBe(false);
    for (const u of result.attackerStack.units) {
      expect(u.wins ?? 0).toBe(1);
    }
  });

  it('losing side survivors do not gain wins', () => {
    // Even if some defenders survive (stalemate), only the side that wiped
    // the opponent gets wins.
    const atk = mkStack('atk', 'p1', 1);
    const def = mkStack('def', 'p2', 3);
    const result = resolveCombat(atk, def, { q: 0, r: 0 }, 1);
    // Defender should wipe attacker (outnumbered 3-to-1).
    expect(result.attackerWiped).toBe(true);
    for (const u of result.defenderStack.units) {
      expect(u.wins ?? 0).toBe(1);
    }
  });

  it('a unit becomes veteran after exactly threshold wins', () => {
    let u = mkUnit('u', 'p1', VETERAN_WIN_THRESHOLD - 1);
    expect(isVeteran(u)).toBe(false);
    u = { ...u, wins: (u.wins ?? 0) + 1 };
    expect(isVeteran(u)).toBe(true);
  });
});
