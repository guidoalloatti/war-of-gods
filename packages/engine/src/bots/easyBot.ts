import type { GameState } from '../types/game.js';
import type { GameAction } from '../types/actions.js';
import type { TerrainType } from '../types/terrain.js';
import type { TechType } from '../types/era2.js';
import type { HexCoord } from '../types/era3.js';
import { TECH_TYPES } from '../types/era2.js';
import { RACIAL_BONUSES } from '../era2/constants.js';
import { calculateTechCost } from '../era2/costs.js';
import {
  distance, hexKey, neighbors,
  canEnterHex, getTerrainMoveCost,
  ERA3_RECRUIT_COSTS, validateRecruit,
  DHAKHAN_OWNER_ID,
} from '../era3/index.js';
import type { UnitType } from '../types/era2.js';
import type { Bot } from './types.js';

const TRADEABLE_TERRAINS: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

/**
 * Easy-level bot: makes simple valid decisions.
 * Era I: random legal actions. Era II: deterministic heuristic distribution.
 */
export class EasyBot implements Bot {
  private rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  decideAction(state: GameState, playerId: string): GameAction | null {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return null;

    if (state.phase === 'era2') {
      return this.decideEra2(state, playerId);
    }

    if (state.phase === 'era3') {
      return this.decideEra3(state, playerId);
    }

    switch (state.era1Phase) {
      case 'draw_tiles': {
        const tileCount = Object.values(player.tiles).reduce((a, b) => a + b, 0);
        if (tileCount === 0) {
          return { type: 'DRAW_TILES', playerId };
        }
        return null;
      }

      case 'trade': {
        if (player.hasTraded) return null;

        const otherPlayers = state.players.filter(p => p.id !== playerId);
        if (otherPlayers.length === 0) return null;

        const target = otherPlayers[Math.floor(this.rng() * otherPlayers.length)];

        const ownedTiles = TRADEABLE_TERRAINS.filter(t => player.tiles[t] > 0);
        if (ownedTiles.length === 0) return null;

        const tileOffered = ownedTiles[Math.floor(this.rng() * ownedTiles.length)];

        const targetTiles = TRADEABLE_TERRAINS.filter(t => target.tiles[t] > 0);
        if (targetTiles.length === 0) return null;

        const tileRequested = targetTiles[Math.floor(this.rng() * targetTiles.length)];

        return {
          type: 'PROPOSE_TRADE',
          fromPlayerId: playerId,
          toPlayerId: target.id,
          tileOffered,
          tileRequested,
        };
      }

      case 'placement': {
        if (!player.hasPlaced) {
          return { type: 'PLACE_TILES', playerId };
        }
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Era II decision tree. One step at a time so the outer loop can re-invoke
   * us after each state mutation (e.g. pick card → advance phase → allocate).
   */
  private decideEra2(state: GameState, playerId: string): GameAction | null {
    const player = state.players.find(p => p.id === playerId);
    if (!player?.era2State) return null;
    const era2 = player.era2State;

    switch (state.era2Phase) {
      case 'era_cards_deal': {
        const choices = era2.pendingCardChoices ?? [];
        if (choices.length === 0 || era2.chosenEra2Card) return null;
        return { type: 'CHOOSE_ERA2_CARD', playerId, cardId: choices[0].id };
      }

      case 'kings_table': {
        // Easy bot: no transfers, mark ready immediately.
        if (state.kingsTableReady?.includes(playerId)) return null;
        return { type: 'MARK_KINGS_TABLE_READY', playerId };
      }

      case 'tech_allocation': {
        if (era2.hasConfirmed) return null;
        return this.planTechAllocation(state, playerId);
      }

      case 'review': {
        if (era2.hasConfirmed) return null;
        return { type: 'CONFIRM_ALLOCATION', playerId };
      }

      case 'convert_surplus': {
        if (era2.hasConvertedSurplus) return null;
        return { type: 'CONVERT_SURPLUS', playerId };
      }

      default:
        return null;
    }
  }

  /**
   * Era III decision. One action per call — the outer loop re-invokes until
   * we return null. Priority per turn:
   *   1. Start game loop if awaiting.
   *   2. Play one card from hand if available (simple: always play the first).
   *   3. Recruit if gold allows and we haven't recruited yet.
   *   4. Attack an adjacent Dhakhan stack (Wrought or boss) if we have movement.
   *   5. Move stacks toward the citadel.
   *   6. End turn.
   *
   * Handles both `game_loop` and `final_heroic_turn` identically — the reducer
   * gates which actions are valid.
   */
  private decideEra3(state: GameState, playerId: string): GameAction | null {
    if (state.era3Phase === 'awaiting_next_session') {
      return { type: 'START_ERA3_GAME_LOOP' };
    }
    if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') return null;
    if (state.era3CurrentPlayerId !== playerId) return null;
    if (!state.map || !state.era3Stacks) return null;

    const player = state.players.find(p => p.id === playerId);
    if (!player?.era3State || player.era3State.eliminated) {
      return { type: 'END_TURN', playerId };
    }

    // 2. Play a card (once per turn).
    if (!state.era3CardPlayedThisTurn?.[playerId]) {
      const hand = state.era3Hands?.[playerId] ?? [];
      if (hand.length > 0) {
        // Heal cards need a target stack; pick our most wounded stack.
        const card = hand[0];
        const needsTarget = card.effects.some(e => e.type === 'era3_heal_stack');
        if (needsTarget) {
          const myStacks = Object.values(state.era3Stacks).filter(s => s.ownerId === playerId);
          const wounded = myStacks
            .map(s => ({ s, dmg: s.units.reduce((a, u) => a + (10 - u.currentHp), 0) }))
            .sort((a, b) => b.dmg - a.dmg)[0];
          if (wounded) {
            return { type: 'PLAY_ERA3_CARD', playerId, cardId: card.id, targetStackId: wounded.s.id };
          }
        } else {
          return { type: 'PLAY_ERA3_CARD', playerId, cardId: card.id };
        }
      }
    }

    // 3. Recruit (cheapest affordable unit, if we haven't yet).
    const unitPriority: UnitType[] = ['mounted', 'ranged', 'siege', 'flying', 'infantry'];
    for (const ut of unitPriority) {
      const v = validateRecruit(state, playerId, ut);
      if (v.ok) return { type: 'RECRUIT_UNIT', playerId, unitType: ut };
    }
    // if validation failed for all, silently move on (most likely: already recruited, no gold, or not on capital)
    void ERA3_RECRUIT_COSTS;

    const citadel: HexCoord = { q: 0, r: 0 };
    const myStacks = Object.values(state.era3Stacks).filter(s => s.ownerId === playerId);

    // 4. Attack adjacent Dhakhan stack if any of our stacks has movement.
    for (const stack of myStacks) {
      if (stack.movementLeft <= 0) continue;
      for (const n of neighbors(stack.position)) {
        const hex = state.map!.hexes[hexKey(n)];
        if (!hex) continue;
        if (getTerrainMoveCost(hex.terrain, hex) > stack.movementLeft) continue;
        if (!hex.stackId) continue;
        const occ = state.era3Stacks[hex.stackId];
        if (!occ || occ.ownerId !== DHAKHAN_OWNER_ID) continue;
        // Only attack if our stack is at least as strong as the target (naive).
        if (stack.units.length >= occ.units.length) {
          return {
            type: 'MOVE_STACK',
            playerId,
            stackId: stack.id,
            path: [n],
          };
        }
      }
    }

    // 5. Move toward citadel.
    for (const stack of myStacks) {
      if (stack.movementLeft <= 0) continue;
      const currentDist = distance(stack.position, citadel);
      const options = neighbors(stack.position)
        .map(n => ({ coord: n, key: hexKey(n), hex: state.map!.hexes[hexKey(n)] }))
        .filter(o => o.hex && canEnterHex(o.hex, state.era3Stacks!, stack.id))
        .filter(o => getTerrainMoveCost(o.hex.terrain, o.hex) <= stack.movementLeft)
        .map(o => ({ ...o, dist: distance(o.coord, citadel) }))
        .filter(o => o.dist < currentDist)
        .sort((a, b) => (a.dist - b.dist) || (a.key < b.key ? -1 : 1));

      if (options.length === 0) continue;
      return {
        type: 'MOVE_STACK',
        playerId,
        stackId: stack.id,
        path: [options[0].coord],
      };
    }

    // 6. End turn.
    return { type: 'END_TURN', playerId };
  }

  /**
   * Plan tech allocation by greedily raising cheapest next level across techs
   * until the budget is spent. Starts from baselineTechLevels and walks up one
   * level at a time, picking the cheapest tech each step.
   *
   * Returns a single SET_TECH_LEVEL action for the next tech to raise.
   * Returns CONFIRM_ALLOCATION when no profitable raise remains.
   */
  private planTechAllocation(state: GameState, playerId: string): GameAction {
    const player = state.players.find(p => p.id === playerId)!;
    const era2 = player.era2State!;
    const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
    const remaining = budget - era2.pointsSpent;

    // Bias: racial tech first, then round-robin cheapest-next.
    const racial = RACIAL_BONUSES[player.raceId]?.freeTech.tech;
    const priority: TechType[] = racial
      ? [racial, ...TECH_TYPES.filter(t => t !== racial)]
      : [...TECH_TYPES];

    for (const tech of priority) {
      const current = era2.techLevels[tech];
      if (current >= 5 && !era2.allowLevel6) continue;
      if (current >= 6) continue;
      if (era2.lockedOutTech === tech) continue;

      const target = current + 1;
      const { totalCost } = calculateTechCost(
        tech,
        current,
        target,
        era2.freeLevelsRemaining[tech],
        {
          flat: 0, // flat already applied; we only check incremental cost
          perLevel: era2.costModifiers.perLevel[tech],
          minCostPerLevel: era2.costModifiers.minCostPerLevel,
        },
        era2.allowLevel6,
      );
      if (totalCost > remaining) continue;

      return { type: 'SET_TECH_LEVEL', playerId, tech, targetLevel: target };
    }

    // No affordable upgrades — confirm.
    return { type: 'CONFIRM_ALLOCATION', playerId };
  }
}
