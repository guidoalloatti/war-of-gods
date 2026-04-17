import type { GameState } from '../types/game.js';
import type { GameAction } from '../types/actions.js';

export interface Bot {
  decideAction(state: GameState, playerId: string): GameAction | null;
}
