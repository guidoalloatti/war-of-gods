import { TECH_TYPES, TECH_BENEFITS, SCIENCE_UNLOCK_ORDER } from '@war-of-gods/engine';
import type { Player, PlayerEra2State, TechType, UnitType } from '@war-of-gods/engine';
import type { Translations } from '../../i18n/es.js';

const TECH_ICONS: Record<TechType, string> = {
  war: '⚔️',
  science: '🔬',
  resources: '🌾',
  economy: '💰',
  religion: '✨',
};

const TECH_COLORS: Record<TechType, string> = {
  war: '#e94560',
  science: '#3b82f6',
  resources: '#10b981',
  economy: '#f5c518',
  religion: '#c084fc',
};

type Props = {
  player: Player;
  era2: PlayerEra2State;
  onConfirm: () => void;
  t: Translations;
};

export function TechSummaryReview({ player, era2, onConfirm, t }: Props) {
  const scienceLvl = era2.techLevels.science;
  const unlockedUnits: UnitType[] = SCIENCE_UNLOCK_ORDER.slice(0, Math.max(1, scienceLvl)) as UnitType[];
  const totalSpent = era2.pointsSpent;
  const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
  const surplus = budget - totalSpent;

  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-5 animate-fade-in-up">
      <header className="text-center">
        <div className="text-5xl mb-2">🔍</div>
        <h2 className="text-2xl font-bold text-game-gold mb-1">{t.era2.reviewTitle}</h2>
        <p className="text-text-secondary text-sm">{player.name}</p>
      </header>

      {/* Tech breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {TECH_TYPES.map(tech => {
          const lvl = era2.techLevels[tech];
          const benefits = TECH_BENEFITS[tech];
          const value = benefits.values[Math.min(lvl, benefits.values.length - 1)];
          const color = TECH_COLORS[tech];
          return (
            <div
              key={tech}
              className="rounded-xl border p-3"
              style={{ borderColor: `${color}30`, background: `${color}0a` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{TECH_ICONS[tech]}</span>
                <span className="text-text-primary font-bold text-sm flex-1">{t.tech[tech]}</span>
                <span className="text-2xl font-bold tabular-nums" style={{ color }}>
                  {lvl}
                </span>
              </div>
              <div className="text-text-secondary text-xs">
                {benefits.label}: <span className="text-text-primary font-bold">{value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unlocked units */}
      <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
        <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
          {t.units.infantry} / {t.units.ranged} …
        </div>
        <div className="flex flex-wrap gap-2">
          {(['infantry', 'ranged', 'mounted', 'siege', 'flying'] as UnitType[]).map(unit => {
            const isUnlocked = unlockedUnits.includes(unit);
            return (
              <span
                key={unit}
                className={`text-xs px-2 py-1 rounded-lg border ${
                  isUnlocked
                    ? 'bg-game-gold/10 border-game-gold/30 text-game-gold'
                    : 'bg-game-bg border-border-subtle text-text-muted'
                }`}
              >
                {t.units[unit]}
                {!isUnlocked && ' 🔒'}
              </span>
            );
          })}
        </div>
      </div>

      {/* Free units for Era III */}
      {era2.freeUnitsForEra3.length > 0 && (
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
          <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
            {t.era3.freeUnits}
          </div>
          <div className="flex flex-wrap gap-2">
            {era2.freeUnitsForEra3.map((g, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-400"
              >
                {g.count}× {t.units[g.unit]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 text-center">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">
            {t.era2.pointsSpent}
          </div>
          <div className="text-xl font-bold text-text-primary tabular-nums">{totalSpent}</div>
        </div>
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 text-center">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">
            {t.era2.surplus}
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{surplus}</div>
        </div>
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 text-center">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">
            {t.era2.coins}
          </div>
          <div className="text-xl font-bold text-game-gold tabular-nums">{era2.goldCoins}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
      >
        <div className="absolute inset-0 animate-shimmer pointer-events-none" />
        <span className="relative">{t.era2.continueToConvert}</span>
      </button>
    </div>
  );
}
