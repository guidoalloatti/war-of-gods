import type { GameAction } from '../types/actions.js';
import type { GameState } from '../types/game.js';

/**
 * Era II reducer stub. Real implementation lands in Phase C.
 * For now: returns state unchanged, unless it detects an Era II action,
 * in which case it still no-ops (so the type router compiles but nothing runs).
 */
export function era2Reducer(state: GameState, _action: GameAction): GameState {
  return state;
}
