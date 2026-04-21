import type { PlayerEra2State } from '@war-of-gods/engine';
import type { Translations } from '../../i18n/es.js';

export function PointsCounter({
  era2,
  t,
}: {
  era2: PlayerEra2State;
  t: Translations;
}) {
  const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
  const remaining = budget - era2.pointsSpent;

  return (
    <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 animate-fade-in">
      <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
        {t.era2.constructionPoints}
      </div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-3xl font-bold text-game-gold tabular-nums">{remaining}</span>
        <span className="text-text-muted text-xs">/ {budget}</span>
      </div>
      <div className="h-1.5 bg-game-bg rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-game-gold to-game-gold-dark rounded-full transition-all"
          style={{ width: `${budget > 0 ? Math.max(0, (remaining / budget) * 100) : 0}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11px] text-text-secondary">
        <div className="flex justify-between">
          <span>{t.era2.pointsSpent}</span>
          <span className="tabular-nums text-text-primary">{era2.pointsSpent}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.era2.pointsReceived}</span>
          <span className="tabular-nums text-emerald-400">+{era2.pointsReceived}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.era2.pointsGiven}</span>
          <span className="tabular-nums text-red-400/80">-{era2.pointsGiven}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.era2.coins}</span>
          <span className="tabular-nums text-game-gold">{era2.goldCoins}</span>
        </div>
      </div>
    </div>
  );
}
