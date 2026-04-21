import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { EraCard, WorldCard } from '../types/cards.js';
import type { Stack, HexCoord } from '../types/era3.js';
import { generateMap, computeCapitalPositions } from './map-gen.js';
import { hexKey } from './hex.js';
import { buildInitialStack, initPlayerEra3State } from './init.js';
import { buildBossStack } from './dhakhan.js';
import { createStartingGeneral } from './generals.js';
import { createRng } from '../state/random.js';
import { BOSS_STACK_ID, CITADEL_COORD, OFFSET_ERA3_CAPITAL_ROTATION } from './constants.js';
import { initGameLoopTurnState } from './turn.js';
import { worldCardDeckEra3, eraCardDeckEra3 } from '../cards/loader.js';
import { applyEffects } from '../cards/effect-dispatcher.js';

const OFFSET_ERA3_WORLD_CARD = 864_197;
const OFFSET_ERA3_DECK_SHUFFLE = 271_828_183;
const ERA3_STARTING_HAND_SIZE = 3;

/**
 * Transition from Era II 'complete' → Era III. Generates the hex map,
 * initializes per-player era3State, and places one initial stack per
 * player on their capital from their accumulated `freeUnitsForEra3`.
 *
 * Sets phase='era3' and era3Phase='awaiting_next_session' (Session 1 scope).
 * Future sessions will advance through world_card_reveal, game_loop, etc.
 */
export function transitionEra2ToEra3(state: GameState): GameState {
  // Only run once — if already in era3 or map exists, skip.
  if (state.phase === 'era3' || state.map) return state;

  const players = state.players;
  const map = generateMap(state.seed, players);

  // Re-derive capital coords in the same order as generateMap assigned them,
  // so player[i] maps to capitals[i].
  const rotationRng = createRng(state.seed + OFFSET_ERA3_CAPITAL_ROTATION);
  const capitals = computeCapitalPositions(players.length, rotationRng);

  const era3Stacks: Record<string, Stack> = {};
  const nextHexes = { ...map.hexes };

  const updatedPlayers: Player[] = players.map((player, i) => {
    const capitalCoord: HexCoord = capitals[i];
    const era3State = initPlayerEra3State(player, capitalCoord);

    const stackCounter = Object.keys(era3Stacks).length;
    const unitCounter = sumUnitsBuilt(era3Stacks);
    const { stack, overflow } = buildInitialStack(
      player,
      capitalCoord,
      state.seed,
      stackCounter,
      unitCounter,
    );

    if (stack) {
      era3Stacks[stack.id] = stack;
      const key = hexKey(capitalCoord);
      const hex = nextHexes[key];
      if (hex) nextHexes[key] = { ...hex, stackId: stack.id };
    }

    const startingGeneral = createStartingGeneral(player.id, player.raceId, state.seed, i);
    const era3StateWithExtras = {
      ...era3State,
      generals: [startingGeneral],
      ...(overflow.length > 0 ? { initialDeploymentOverflow: overflow } : {}),
    };

    return { ...player, era3State: era3StateWithExtras };
  });

  // ── Session 5: place the Dhakhan boss stack on the citadel ──
  const boss = buildBossStack(state.seed);
  era3Stacks[boss.id] = boss;
  const citadelKey = hexKey(CITADEL_COORD);
  const citadelHex = nextHexes[citadelKey];
  if (citadelHex) nextHexes[citadelKey] = { ...citadelHex, stackId: BOSS_STACK_ID };

  // ── Session 4b: pick and reveal world card, shuffle deck, deal hands ──
  const worldRng = createRng(state.seed + OFFSET_ERA3_WORLD_CARD);
  const pickedWorld: WorldCard | null = worldCardDeckEra3.length > 0
    ? worldCardDeckEra3[Math.floor(worldRng() * worldCardDeckEra3.length)]
    : null;

  const deckRng = createRng(state.seed + OFFSET_ERA3_DECK_SHUFFLE);
  const fullDeck: EraCard[] = shuffleDeterministic(eraCardDeckEra3, deckRng)
    .map(c => ({ ...c, assignedTo: null }));

  const hands: Record<string, EraCard[]> = {};
  let deckIdx = 0;
  for (const p of updatedPlayers) {
    const hand: EraCard[] = [];
    for (let i = 0; i < ERA3_STARTING_HAND_SIZE && deckIdx < fullDeck.length; i++) {
      hand.push({ ...fullDeck[deckIdx], assignedTo: p.id });
      deckIdx++;
    }
    hands[p.id] = hand;
  }
  const remainingDeck = fullDeck.slice(deckIdx);

  let midState: GameState = {
    ...state,
    phase: 'era3',
    era3Phase: 'game_loop',
    players: updatedPlayers,
    map: { ...map, hexes: nextHexes },
    era3Stacks,
    worldCardEra3: pickedWorld,
    era3Deck: remainingDeck,
    era3Hands: hands,
    era3PassiveAttackBonus: 0,
    era3CardPlayedThisTurn: {},
  };

  // Apply world card `on_era3_start` effects (global → playerId null).
  if (pickedWorld) {
    midState = applyEffects(midState, pickedWorld.effects, {
      playerId: null,
      trigger: 'on_era3_start',
    });
  }

  return initGameLoopTurnState(midState);
}

function shuffleDeterministic<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sumUnitsBuilt(stacks: Record<string, Stack>): number {
  let total = 0;
  for (const s of Object.values(stacks)) total += s.units.length;
  return total;
}
