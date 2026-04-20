import type { GameAction } from './types/actions.js';
import type { GameState } from './types/game.js';
import { era1Reducer } from './era1/actions.js';
import { era2Reducer } from './era2/reducer.js';
import { era3Reducer } from './era3/index.js';

/**
 * Top-level game reducer. Routes actions to the appropriate era reducer
 * based on the current `state.phase`. Clients and the server should dispatch
 * through this function rather than calling era-specific reducers directly.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (state.phase) {
    case 'era1':
      return era1Reducer(state, action);
    case 'era2':
      return era2Reducer(state, action);
    case 'era3':
      return era3Reducer(state, action);
    default: {
      const _exhaustive: never = state.phase;
      throw new Error(`Unknown game phase: ${_exhaustive as string}`);
    }
  }
}
