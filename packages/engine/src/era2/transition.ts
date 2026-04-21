import type { GameState } from '../types/game.js';
import { initDoomClock, initPlayerEra2State } from './init.js';
import { MIN_CONSTRUCTION_POINTS } from './constants.js';
import { worldCardDeckEra2 } from '../cards/loader.js';
import { applyEffects } from '../cards/effect-dispatcher.js';
import { createRng, shuffle } from '../state/random.js';

const ROAD_PENALTY_THRESHOLD = 3;
const ROAD_PENALTY_PER_MISSING = 3;

/**
 * Apply deferred road-requirement penalty: -3 per missing road below the requirement.
 * Uses `state.roadRequirement` (default 3) so card effects that waive/modify it
 * from Era I carry through. Penalty may push raw points below the MIN floor;
 * the floor is re-applied afterward.
 */
function applyRoadPenalty(state: GameState): GameState {
  const requirement = state.roadRequirement ?? ROAD_PENALTY_THRESHOLD;
  if (requirement <= 0) return state;

  const players = state.players.map(p => {
    if (!p.era2State) return p;
    const missing = Math.max(0, requirement - p.tiles.road);
    if (missing === 0) return p;
    const penalized = p.era2State.constructionPoints - ROAD_PENALTY_PER_MISSING * missing;
    return {
      ...p,
      era2State: {
        ...p.era2State,
        constructionPoints: Math.max(MIN_CONSTRUCTION_POINTS, penalized),
      },
    };
  });

  return { ...state, players };
}

/**
 * Run the Era I → Era II transition. Called from Era I's CALCULATE_SCORES
 * after scores are finalized. Does NOT mutate state; returns a new GameState
 * with `phase: 'era2'`, `era2Phase: 'world_card_reveal'`, player Era II state,
 * and doomClock initialized.
 *
 * The Era II world card reveal and Era II card dealing happen in
 * `advanceEra2Phase`; this step only seeds per-player scaffolding.
 */
export function transitionEraIToEra2(state: GameState): GameState {
  const players = state.players.map(p => ({
    ...p,
    era2State: initPlayerEra2State(p),
  }));

  // Reveal the Era II world card immediately (like Era I's setup → world_card_reveal).
  const rng = createRng(state.seed + 7919);
  const shuffledWorld = shuffle([...worldCardDeckEra2], rng);
  const worldCardEra2 = shuffledWorld[0] ?? null;

  let seeded: GameState = {
    ...state,
    phase: 'era2',
    era2Phase: 'world_card_reveal',
    players,
    doomClock: state.doomClock ?? initDoomClock(state.mode, state.soloVariant),
    activeTransfers: [],
    kingsTableReady: [],
    pendingEra2Cards: {},
    worldCardEra2,
  };

  seeded = applyRoadPenalty(seeded);

  // Fire on_era2_start effects from the world card across all players.
  if (worldCardEra2) {
    seeded = applyEffects(seeded, worldCardEra2.effects, {
      playerId: null,
      trigger: 'on_era2_start',
    });
    seeded = applyEffects(seeded, worldCardEra2.effects, {
      playerId: null,
      trigger: 'on_reveal',
    });
  }

  return seeded;
}
