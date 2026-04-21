import type { Unit } from '../types/era3.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';

export const VETERAN_WIN_THRESHOLD = 3;
export const VETERAN_ATK_BONUS = 1;
export const VETERAN_DEF_BONUS = 1;
export const VETERAN_HP_BONUS = 1;

export function isVeteran(u: Unit): boolean {
  return (u.wins ?? 0) >= VETERAN_WIN_THRESHOLD;
}

/** Same formula used elsewhere in the engine: HP = defense + 2. */
function baseMaxHp(type: Unit['type']): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

export function unitMaxHp(u: Unit): number {
  return baseMaxHp(u.type) + (isVeteran(u) ? VETERAN_HP_BONUS : 0);
}

export function unitAttack(u: Unit): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === u.type);
  const base = def?.attack ?? 1;
  return base + (isVeteran(u) ? VETERAN_ATK_BONUS : 0);
}

export function unitDefense(u: Unit): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === u.type);
  const base = def?.defense ?? 1;
  return base + (isVeteran(u) ? VETERAN_DEF_BONUS : 0);
}

/**
 * After combat resolves, increment wins for each surviving unit on the
 * winning side. "Winning" = the opposing stack was wiped in this combat.
 * Returns a new array — never mutates.
 */
export function awardWinsToSurvivors(units: Unit[]): Unit[] {
  return units.map(u => (u.currentHp > 0 ? { ...u, wins: (u.wins ?? 0) + 1 } : u));
}
