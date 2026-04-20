import type { GameAction } from '../types/actions.js';
import type { GameState } from '../types/game.js';

/**
 * Era III stub reducer. Currently a no-op; real combat/unit logic lands later.
 * Accepts `ADVANCE_ERA3_PHASE` but simply returns the state unchanged for now.
 */
export function era3Reducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'ADVANCE_ERA3_PHASE') {
    return state;
  }
  return state;
}
