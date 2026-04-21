import { useMemo } from 'react';
import {
  calculateEra2ScoreBreakdown,
  getRaceById,
  TECH_TYPES,
} from '@war-of-gods/engine';
import type { TechType } from '@war-of-gods/engine';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';

const TECH_ICONS: Record<TechType, string> = {
  war: '⚔️',
  science: '🔬',
  resources: '🌾',
  economy: '💰',
};

export function Era2ScoringScreen() {
  const gameState = useGameStore(s => s.gameState);
  const dispatch = useGameStore(s => s.dispatch);
  const setScreen = useGameStore(s => s.setScreen);
  const t = useI18n(s => s.t);

  const ranked = useMemo(() => {
    if (!gameState) return [];
    return gameState.players
      .map(player => ({
        player,
        race: getRaceById(player.raceId),
        breakdown: calculateEra2ScoreBreakdown(player),
      }))
      .sort((a, b) => b.breakdown.total - a.breakdown.total);
  }, [gameState]);

  if (!gameState) return null;

  return (
    <div id="era2-scoring-screen" className="min-h-screen bg-game-bg bg-radial-theme relative overflow-hidden p-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-game-gold/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-game-accent/[0.04] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10 py-8">
        <header className="text-center mb-6">
          <div className="text-5xl mb-3">🏆</div>
          <h2 className="text-2xl font-bold text-game-gold animate-title-glow mb-1">
            {t.era2.phases.complete}
          </h2>
          <p className="text-text-secondary text-sm">{t.era2.title}</p>
        </header>

        <div className="space-y-3">
          {ranked.map(({ player, race, breakdown }, idx) => (
            <div
              key={player.id}
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: `${race.color}40`,
                background: `linear-gradient(135deg, ${race.color}0a 0%, transparent 60%)`,
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: `${race.color}20` }}>
                <div className="text-xl font-bold text-text-muted tabular-nums w-6">{idx + 1}</div>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: race.color }} />
                <div className="flex-1">
                  <div className="text-text-primary font-bold">{player.name}</div>
                  <div className="text-text-muted text-xs">{t.races[player.raceId as keyof typeof t.races]}</div>
                </div>
                <div className="text-right">
                  <div className="text-text-muted text-[10px] uppercase tracking-wider">{t.scoring.total}</div>
                  <div className="text-xl font-bold text-game-gold tabular-nums">{breakdown.total}</div>
                </div>
              </div>

              <div className="px-4 py-3 grid grid-cols-4 gap-2">
                {TECH_TYPES.map(tech => (
                  <div key={tech} className="text-center">
                    <div className="text-lg">{TECH_ICONS[tech]}</div>
                    <div className="text-xs text-text-secondary">{t.tech[tech]}</div>
                    <div className="text-base font-bold text-text-primary tabular-nums">
                      {breakdown.techPoints[tech]}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-3 flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  {t.era2.coins}: <span className="text-game-gold font-bold">{breakdown.goldCoins}</span>
                </span>
                <span className="text-text-secondary">
                  {t.era3.freeUnits}: <span className="text-emerald-400 font-bold">{breakdown.freeUnitCount}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'ADVANCE_ERA2_PHASE' });
              setScreen('era3');
            }}
            className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
          >
            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            <span className="relative">{t.era2.advanceToEra3}</span>
          </button>
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="w-full bg-game-surface border border-border-medium text-text-primary py-3 rounded-xl font-bold text-base hover:bg-game-surface-light transition-colors"
          >
            {t.scoring.backToMenu}
          </button>
        </div>
      </div>
    </div>
  );
}
