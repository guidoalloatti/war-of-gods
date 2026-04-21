import type { GameState } from '../types/game.js';
import type { Era2Phase } from '../types/era2.js';

const ORDER: readonly Era2Phase[] = [
  'world_card_reveal',
  'era_cards_deal',
  'apply_penalties',
  'apply_era1_effects',
  'kings_table',
  'tech_allocation',
  'review',
  'convert_surplus',
  'complete',
];

/**
 * Return true when the current Era II phase is ready to advance.
 * Used by ADVANCE_ERA2_PHASE to gate manual/auto progression.
 * Wait conditions (e.g. all players chose era card, all confirmed, all ready)
 * are enforced inside the reducer — this function only reports readiness.
 */
export function isEra2PhaseComplete(state: GameState): boolean {
  switch (state.era2Phase) {
    case 'world_card_reveal':
      return state.worldCardEra2 != null;
    case 'era_cards_deal':
      return state.players.every(p => p.era2State?.chosenEra2Card != null || !p.era2State?.pendingCardChoices?.length);
    case 'apply_penalties':
    case 'apply_era1_effects':
      return true; // side-effect only — advance immediately
    case 'kings_table':
      return state.players.every(p => state.kingsTableReady?.includes(p.id));
    case 'tech_allocation':
      return state.players.every(p => p.era2State?.hasConfirmed === true);
    case 'review':
      return state.players.every(p => p.era2State?.hasConfirmed === true);
    case 'convert_surplus':
      return state.players.every(p => !p.era2State || p.era2State.hasConvertedSurplus);
    case 'complete':
      return true;
    default:
      return false;
  }
}

/** Return the phase that follows `current`. Returns `current` if it's terminal. */
export function nextEra2Phase(current: Era2Phase): Era2Phase {
  const idx = ORDER.indexOf(current);
  if (idx < 0 || idx >= ORDER.length - 1) return current;
  return ORDER[idx + 1];
}
