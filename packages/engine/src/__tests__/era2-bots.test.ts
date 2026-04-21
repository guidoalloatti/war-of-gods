import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { EasyBot } from '../bots/easyBot.js';
import { era2Reducer } from '../era2/reducer.js';
import { initPlayerEra2State } from '../era2/init.js';
import { createRng } from '../state/random.js';
import type { GameState } from '../types/game.js';
import type { Era2Phase } from '../types/era2.js';

function buildEra2State(phase: Era2Phase, pts = 40): GameState {
  const base = createGame({
    mode: 'solo_bots',
    seed: 123,
    playerConfigs: [
      { name: 'Bot1', raceId: 'human', isBot: true, botDifficulty: 'easy' },
      { name: 'Bot2', raceId: 'elf', isBot: true, botDifficulty: 'easy' },
    ],
  });
  const players = base.players.map(p => ({
    ...p,
    score: pts,
    era2State: initPlayerEra2State({ ...p, score: pts }),
  }));
  return {
    ...base,
    phase: 'era2',
    era2Phase: phase,
    players,
    doomClock: 12,
    activeTransfers: [],
    kingsTableReady: [],
    pendingEra2Cards: {},
  };
}

describe('EasyBot — Era II decisions', () => {
  it('picks the first available pending era card', () => {
    let s = buildEra2State('era_cards_deal');
    const botId = s.players[0].id;
    // Simulate dealt choices.
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              era2State: {
                ...p.era2State!,
                pendingCardChoices: [
                  { ...s.players[0].eraCards[0] ?? { id: 'era2_01', name: 'X', name_en: 'X', type: 'era2', flavorText: '', flavorText_en: '', mechanicalText: '', mechanicalText_en: '', effects: [{ type: 'free_tech_level', trigger: 'on_era2_start', tech: 'war', level: 1 }], assignedTo: null } },
                ],
              },
            }
          : p,
      ),
    };
    const bot = new EasyBot(createRng(1));
    const action = bot.decideAction(s, botId);
    expect(action?.type).toBe('CHOOSE_ERA2_CARD');
  });

  it('marks ready immediately at kings_table', () => {
    const s = buildEra2State('kings_table');
    const botId = s.players[0].id;
    const bot = new EasyBot(createRng(1));
    const action = bot.decideAction(s, botId);
    expect(action).toEqual({ type: 'MARK_KINGS_TABLE_READY', playerId: botId });
  });

  it('returns null at kings_table once already ready', () => {
    const s = { ...buildEra2State('kings_table'), kingsTableReady: [] as string[] };
    const botId = s.players[0].id;
    s.kingsTableReady!.push(botId);
    const bot = new EasyBot(createRng(1));
    expect(bot.decideAction(s, botId)).toBeNull();
  });

  it('allocates tech by raising levels until budget is spent, then confirms', () => {
    let s = buildEra2State('tech_allocation', 40);
    const botId = s.players[0].id;
    const bot = new EasyBot(createRng(1));

    // Drive until bot confirms.
    for (let i = 0; i < 20; i++) {
      const action = bot.decideAction(s, botId);
      if (!action) break;
      s = era2Reducer(s, action);
      if (action.type === 'CONFIRM_ALLOCATION') break;
    }

    const era2 = s.players[0].era2State!;
    expect(era2.hasConfirmed).toBe(true);
    // Should have spent something.
    expect(era2.pointsSpent).toBeGreaterThan(0);
    // No overspend.
    const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
    expect(era2.pointsSpent).toBeLessThanOrEqual(budget);
  });

  it('confirms at review phase', () => {
    const s = buildEra2State('review');
    const botId = s.players[0].id;
    const bot = new EasyBot(createRng(1));
    const action = bot.decideAction(s, botId);
    expect(action).toEqual({ type: 'CONFIRM_ALLOCATION', playerId: botId });
  });

  it('converts surplus when available', () => {
    let s = buildEra2State('convert_surplus', 30);
    const botId = s.players[0].id;
    // pointsSpent = 0 means there's surplus to convert.
    const bot = new EasyBot(createRng(1));
    const action = bot.decideAction(s, botId);
    expect(action).toEqual({ type: 'CONVERT_SURPLUS', playerId: botId });

    // After conversion, no more action.
    s = era2Reducer(s, action!);
    expect(bot.decideAction(s, botId)).toBeNull();
  });

  it('completes tech allocation for two bots under 200 steps (no infinite loop)', () => {
    let s = buildEra2State('tech_allocation', 40);
    const bots = s.players.map(p => new EasyBot(createRng(p.id.charCodeAt(0))));

    let steps = 0;
    const MAX = 200;
    while (steps < MAX) {
      let progressed = false;
      for (let i = 0; i < s.players.length; i++) {
        if (s.players[i].era2State!.hasConfirmed) continue;
        const action = bots[i].decideAction(s, s.players[i].id);
        if (action) {
          s = era2Reducer(s, action);
          progressed = true;
        }
      }
      if (!progressed) break;
      steps++;
    }

    expect(steps).toBeLessThan(MAX);
    for (const p of s.players) {
      expect(p.era2State!.hasConfirmed).toBe(true);
    }
  });
});
