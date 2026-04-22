import type { CombatEntry, HexCoord, Stack, Unit } from '../types/era3.js';
import { unitAttack, awardWinsToSurvivors } from './experience.js';

/**
 * Sum of `attack` stat across living units, plus a flat per-unit bonus
 * (e.g. from a War tech passive). `perUnitBonus` defaults to 0.
 */
export function stackAttackPower(stack: Stack, perUnitBonus = 0): number {
  let total = 0;
  for (const u of stack.units) if (u.currentHp > 0) total += unitAttack(u) + perUnitBonus;
  return total;
}

/**
 * Distribute `damage` HP across a stack's units, from the lowest-HP unit upward
 * (so weakened units die first). Deterministic: ties broken by unit.id asc.
 *
 * Rule: at most ONE unit dies per combat resolution. Any damage that would
 * kill a second unit is instead partially absorbed (the next unit takes wounds
 * but cannot drop below 1 HP). Damage beyond that is wasted. This makes large
 * stacks meaningfully tougher — they bleed HP but only lose one soldier per
 * exchange.
 */
function applyDamage(units: Unit[], damage: number): { units: Unit[]; unitsLost: number } {
  if (damage <= 0) {
    return { units: units.filter(u => u.currentHp > 0), unitsLost: 0 };
  }
  const sorted = [...units].sort((a, b) => {
    if (a.currentHp !== b.currentHp) return a.currentHp - b.currentHp;
    return a.id < b.id ? -1 : 1;
  });
  let remaining = damage;
  let deathsAllowed = 1;
  const updated: Unit[] = [];
  for (const u of sorted) {
    if (remaining <= 0 || u.currentHp <= 0) {
      updated.push(u);
      continue;
    }
    if (deathsAllowed > 0) {
      const absorbed = Math.min(u.currentHp, remaining);
      remaining -= absorbed;
      const newHp = u.currentHp - absorbed;
      if (newHp <= 0) deathsAllowed -= 1;
      updated.push({ ...u, currentHp: newHp });
    } else {
      // No more deaths allowed this resolution: absorb wounds but clamp at 1 HP.
      const maxWound = Math.max(0, u.currentHp - 1);
      const absorbed = Math.min(maxWound, remaining);
      remaining -= absorbed;
      updated.push({ ...u, currentHp: u.currentHp - absorbed });
    }
  }
  const survivors = updated.filter(u => u.currentHp > 0);
  const unitsLost = units.length - survivors.length;
  return { units: survivors, unitsLost };
}

export type CombatResult = {
  attackerStack: Stack;
  defenderStack: Stack;
  attackerWiped: boolean;
  defenderWiped: boolean;
  entry: CombatEntry;
};

/**
 * Resolve a single-round simultaneous combat between two stacks.
 * Kept for backwards-compat with movement-into-enemy combat; also used internally
 * by the flanking resolver when there is only one attacker.
 */
export function resolveCombat(
  attacker: Stack,
  defender: Stack,
  at: HexCoord,
  turnNumber: number,
  bonuses: {
    attackerPerUnit?: number;
    defenderPerUnit?: number;
    defenderDamageMult?: number;
    /** If true the defender deals zero retaliation damage (e.g. distance-2 ranged). */
    noRetaliation?: boolean;
  } = {},
): CombatResult {
  const attackerDamage = stackAttackPower(attacker, bonuses.attackerPerUnit ?? 0);
  const rawDefenderDamage = bonuses.noRetaliation ? 0 : stackAttackPower(defender, bonuses.defenderPerUnit ?? 0);
  // defenderDamageMult < 1 when defender is fortified/on fort (reduces incoming damage from attacker).
  const mult = bonuses.defenderDamageMult ?? 1;
  const effectiveAttackerDamage = Math.max(1, Math.floor(attackerDamage * mult));

  const a = applyDamage(attacker.units, rawDefenderDamage);
  const d = applyDamage(defender.units, effectiveAttackerDamage);

  const attackerWiped = a.units.length === 0;
  const defenderWiped = d.units.length === 0;

  // Award experience: survivors on the side that wiped the opponent gain a win.
  const aUnits = defenderWiped && !attackerWiped ? awardWinsToSurvivors(a.units) : a.units;
  const dUnits = attackerWiped && !defenderWiped ? awardWinsToSurvivors(d.units) : d.units;

  const attackerStack: Stack = { ...attacker, units: aUnits };
  const defenderStack: Stack = { ...defender, units: dUnits };

  const entry: CombatEntry = {
    turnNumber,
    at,
    attackerStackId: attacker.id,
    defenderStackId: defender.id,
    attackerOwnerId: attacker.ownerId,
    defenderOwnerId: defender.ownerId,
    attackerDamageDealt: effectiveAttackerDamage,
    defenderDamageDealt: rawDefenderDamage,
    attackerUnitsLost: a.unitsLost,
    defenderUnitsLost: d.unitsLost,
    attackerWiped,
    defenderWiped,
  };

  return { attackerStack, defenderStack, attackerWiped, defenderWiped, entry };
}

export type FlankingCombatResult = {
  /** Primary attacker stack after combat. May be wiped. */
  primaryAttacker: Stack;
  /** Flanking stacks after combat (same order as input). */
  flankingAttackers: Stack[];
  defender: Stack;
  /** True if the primary attacker was wiped. */
  primaryWiped: boolean;
  /** Per-flanker wipe flags (same index order). */
  flankersWiped: boolean[];
  defenderWiped: boolean;
  entry: CombatEntry;
};

/**
 * Resolve combat where multiple stacks owned by the same player attack a single
 * adjacent defender. All attackers damage the defender simultaneously; the
 * defender's retaliation is split across attackers proportionally to the damage
 * each contributed (so strong attackers take the heaviest retaliation).
 *
 * When `flankers` is empty, this reduces to `resolveCombat` (single attacker).
 */
export function resolveFlankingCombat(
  primary: Stack,
  flankers: Stack[],
  defender: Stack,
  at: HexCoord,
  turnNumber: number,
  bonuses: {
    attackerPerUnit?: number;
    defenderPerUnit?: number;
    flankerBonuses?: number[];
    defenderDamageMult?: number;
    noRetaliation?: boolean;
  } = {},
): FlankingCombatResult {
  const defenderBonus = bonuses.defenderPerUnit ?? 0;
  const primaryBonus = bonuses.attackerPerUnit ?? 0;
  const flankBonuses = bonuses.flankerBonuses ?? flankers.map(() => primaryBonus);
  const mult = bonuses.defenderDamageMult ?? 1;

  const primaryDamage = stackAttackPower(primary, primaryBonus);
  const flankDamages = flankers.map((s, i) => stackAttackPower(s, flankBonuses[i] ?? primaryBonus));
  const rawTotalDamage = primaryDamage + flankDamages.reduce((a, b) => a + b, 0);
  const totalAttackerDamage = Math.max(1, Math.floor(rawTotalDamage * mult));

  const defenderDamage = bonuses.noRetaliation ? 0 : stackAttackPower(defender, defenderBonus);

  // Split defender damage proportionally; round so total equals defenderDamage.
  const shares: number[] = [primaryDamage, ...flankDamages];
  const totalShare = shares.reduce((a, b) => a + b, 0);
  const retaliations: number[] = shares.map(() => 0);
  if (totalShare > 0 && defenderDamage > 0) {
    let remaining = defenderDamage;
    for (let i = 0; i < shares.length; i++) {
      const portion = i === shares.length - 1
        ? remaining
        : Math.round((shares[i] / totalShare) * defenderDamage);
      retaliations[i] = Math.max(0, Math.min(portion, remaining));
      remaining -= retaliations[i];
    }
  }

  const primaryResult = applyDamage(primary.units, retaliations[0]);
  const flankResults = flankers.map((f, i) => applyDamage(f.units, retaliations[i + 1]));
  const defenderResult = applyDamage(defender.units, totalAttackerDamage);

  const primaryWiped = primaryResult.units.length === 0;
  const flankersWiped = flankResults.map(r => r.units.length === 0);
  const defenderWiped = defenderResult.units.length === 0;

  const attackerAllWiped = primaryWiped && flankersWiped.every(w => w);

  // Award wins: surviving attackers when defender wiped, surviving defenders when
  // every attacker (primary + flankers) was wiped.
  const primaryUnits = defenderWiped && !primaryWiped
    ? awardWinsToSurvivors(primaryResult.units)
    : primaryResult.units;
  const flankUnits = flankResults.map((r, i) =>
    defenderWiped && !flankersWiped[i] ? awardWinsToSurvivors(r.units) : r.units,
  );
  const defenderUnits = attackerAllWiped && !defenderWiped
    ? awardWinsToSurvivors(defenderResult.units)
    : defenderResult.units;

  const primaryAttacker: Stack = { ...primary, units: primaryUnits };
  const flankingAttackers = flankers.map((f, i) => ({ ...f, units: flankUnits[i] }));
  const newDefender: Stack = { ...defender, units: defenderUnits };

  const attackerUnitsLost =
    primaryResult.unitsLost + flankResults.reduce((a, r) => a + r.unitsLost, 0);

  const entry: CombatEntry = {
    turnNumber,
    at,
    attackerStackId: primary.id,
    defenderStackId: defender.id,
    attackerOwnerId: primary.ownerId,
    defenderOwnerId: defender.ownerId,
    attackerDamageDealt: totalAttackerDamage,
    defenderDamageDealt: defenderDamage,
    attackerUnitsLost,
    defenderUnitsLost: defenderResult.unitsLost,
    attackerWiped: primaryWiped && flankersWiped.every(w => w),
    defenderWiped,
    flankingStackIds: flankers.map(f => f.id),
    kind: 'attack',
  };

  return {
    primaryAttacker,
    flankingAttackers,
    defender: newDefender,
    primaryWiped,
    flankersWiped,
    defenderWiped,
    entry,
  };
}
