import { describe, it, expect } from 'vitest';
import { resolveCombat, stackAttackPower } from '../era3/combat.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import type { Stack, Unit, UnitType } from '../types/index.js';

function mkUnit(id: string, type: UnitType, ownerId: string, hpOverride?: number): Unit {
  const def = UNIT_DEFINITIONS.find(d => d.id === type)!;
  return {
    id, type, ownerId,
    currentHp: hpOverride ?? def.defense + 2,
    hasMovedThisTurn: false, hasAttackedThisTurn: false,
  };
}

function mkStack(id: string, ownerId: string, units: Unit[]): Stack {
  return { id, ownerId, units, position: { q: 0, r: 0 }, movementLeft: 0 };
}

describe('stackAttackPower', () => {
  it('sums attack stats of living units', () => {
    // infantry attack=2, mounted attack=4
    const s = mkStack('s', 'p', [
      mkUnit('u1', 'infantry', 'p'),
      mkUnit('u2', 'mounted', 'p'),
    ]);
    expect(stackAttackPower(s)).toBe(6);
  });

  it('ignores dead units (hp 0)', () => {
    const s = mkStack('s', 'p', [
      mkUnit('u1', 'infantry', 'p', 0),
      mkUnit('u2', 'infantry', 'p'),
    ]);
    expect(stackAttackPower(s)).toBe(2);
  });
});

describe('resolveCombat', () => {
  it('distributes damage, weakest first', () => {
    // Attacker: two infantry (attack 2 each = 4 total, hp 3 each → total 6 hp)
    // Defender: same. 4 dmg to 6 hp → defender loses 1 unit (3 hp absorbs 3),
    // leaves 1 dmg on the other → both sides survive 1 wounded infantry.
    const a = mkStack('A', 'p1', [
      mkUnit('a1', 'infantry', 'p1'),
      mkUnit('a2', 'infantry', 'p1'),
    ]);
    const d = mkStack('D', 'p2', [
      mkUnit('d1', 'infantry', 'p2'),
      mkUnit('d2', 'infantry', 'p2'),
    ]);
    const r = resolveCombat(a, d, { q: 0, r: 0 }, 1);
    expect(r.entry.attackerDamageDealt).toBe(4);
    expect(r.entry.defenderDamageDealt).toBe(4);
    expect(r.attackerWiped).toBe(false);
    expect(r.defenderWiped).toBe(false);
    expect(r.attackerStack.units).toHaveLength(1);
    expect(r.defenderStack.units).toHaveLength(1);
  });

  it('strong attacker survives when defender cannot kill it', () => {
    // 1 flying (atk 6, hp 5) vs 1 infantry (atk 2, hp 3).
    // Infantry takes 6 dmg → dead. Flying takes 2 dmg → hp 3, survives.
    const a = mkStack('A', 'p1', [mkUnit('a1', 'flying', 'p1')]);
    const d = mkStack('D', 'p2', [mkUnit('d1', 'infantry', 'p2')]);
    const r = resolveCombat(a, d, { q: 0, r: 0 }, 1);
    expect(r.defenderWiped).toBe(true);
    expect(r.attackerWiped).toBe(false);
    expect(r.attackerStack.units[0].currentHp).toBe(3);
  });

  it('emits a combat entry with correct metadata', () => {
    const a = mkStack('A', 'p1', [mkUnit('a1', 'infantry', 'p1')]);
    const d = mkStack('D', 'p2', [mkUnit('d1', 'infantry', 'p2')]);
    const r = resolveCombat(a, d, { q: 3, r: -2 }, 7);
    expect(r.entry.at).toEqual({ q: 3, r: -2 });
    expect(r.entry.turnNumber).toBe(7);
    expect(r.entry.attackerStackId).toBe('A');
    expect(r.entry.defenderStackId).toBe('D');
    expect(r.entry.attackerOwnerId).toBe('p1');
    expect(r.entry.defenderOwnerId).toBe('p2');
  });

  it('deterministic across repeated calls', () => {
    const a = () => mkStack('A', 'p1', [mkUnit('a1', 'mounted', 'p1'), mkUnit('a2', 'infantry', 'p1')]);
    const d = () => mkStack('D', 'p2', [mkUnit('d1', 'ranged', 'p2'), mkUnit('d2', 'infantry', 'p2')]);
    const r1 = resolveCombat(a(), d(), { q: 0, r: 0 }, 1);
    const r2 = resolveCombat(a(), d(), { q: 0, r: 0 }, 1);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
