import { getRaceById, calculateScoreBreakdown } from '@war-of-gods/engine';
import { useGameStore } from '../stores/gameStore.js';
import { ScoreBreakdown } from '../components/ScoreBreakdown.js';
import { useI18n } from '../i18n/index.js';

export function ScoringScreen() {
  const gameState = useGameStore(s => s.gameState);
  const setScreen = useGameStore(s => s.setScreen);
  const t = useI18n(s => s.t);

  if (!gameState) return null;

  const playerScores = gameState.players
    .map(player => ({
      player,
      race: getRaceById(player.raceId),
      breakdown: calculateScoreBreakdown(gameState, player.id),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  const totalScore = playerScores.reduce((sum, ps) => sum + ps.breakdown.total, 0);

  return (
    <div id="scoring-screen" className="min-h-screen bg-game-bg bg-radial-theme relative overflow-hidden p-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-game-gold/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-game-accent/[0.04] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/10 to-transparent" />
      <div className="max-w-lg mx-auto relative z-10">
        <h2 className="text-2xl font-bold text-game-gold text-center mb-2">
          {t.phases.complete}
        </h2>
        <p className="text-text-secondary text-center mb-6">
          {t.scoring.totalKingdom}: <span className="text-game-gold font-bold">{totalScore}</span>
        </p>

        <div className="space-y-4">
          {playerScores.map(({ player, race, breakdown }) => (
            <ScoreBreakdown
              key={player.id}
              playerName={player.name}
              raceColor={race.color}
              breakdown={breakdown}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setScreen('menu')}
          className="w-full mt-6 bg-game-surface border border-border-medium text-text-primary py-3 rounded-xl font-bold"
          aria-label={t.scoring.backToMenu}
        >
          {t.scoring.backToMenu}
        </button>
      </div>
    </div>
  );
}
