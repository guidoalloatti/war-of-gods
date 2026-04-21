import type { Era3Phase } from '../types/era2.js';

/**
 * Era III phase order. Session 1 only exercises the first three; the rest
 * exist as type-level placeholders for future sessions.
 */
export const ERA3_PHASE_ORDER: readonly Era3Phase[] = [
  'map_generation',
  'initial_deployment',
  'awaiting_next_session',
  'world_card_reveal',
  'era_cards_deal',
  'game_loop',
  'final_heroic_turn',
  'victory',
  'defeat',
];

export function nextEra3Phase(current: Era3Phase): Era3Phase {
  const idx = ERA3_PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= ERA3_PHASE_ORDER.length - 1) return current;
  return ERA3_PHASE_ORDER[idx + 1];
}
