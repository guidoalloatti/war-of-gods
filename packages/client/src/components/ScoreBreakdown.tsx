import type { ScoreBreakdown as ScoreBreakdownType } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

type Props = {
  playerName: string;
  raceColor: string;
  breakdown: ScoreBreakdownType;
};

export function ScoreBreakdown({ playerName, raceColor, breakdown }: Props) {
  const t = useI18n(s => s.t);
  const rows = [
    { label: t.scoring.base, value: breakdown.base },
    { label: t.scoring.terrainBonus, value: breakdown.terrainBonus },
    { label: t.scoring.roadBonus, value: breakdown.roadBonus },
    { label: t.scoring.diversityBonus, value: breakdown.diversityBonus },
    { label: t.scoring.concentrationPenalty, value: breakdown.concentrationPenalty },
    { label: t.scoring.balanceBonus, value: breakdown.balanceBonus },
    { label: t.scoring.cardEffects, value: breakdown.cardEffects },
    { label: t.scoring.raceAbilityBonus, value: breakdown.raceAbilityBonus },
  ];

  return (
    <div className="bg-game-surface rounded-xl p-4 border border-border-medium">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: raceColor }} aria-hidden="true" />
        <h3 className="text-text-primary font-bold text-base">{playerName}</h3>
      </div>

      <div className="space-y-1.5 text-base">
        {rows.map(row => (
          <div key={row.label} className="flex justify-between text-text-primary/80">
            <span>{row.label}</span>
            <span className={`font-mono font-bold ${row.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {row.value >= 0 ? '+' : ''}{row.value}
            </span>
          </div>
        ))}
        <div className="border-t border-border-medium pt-1.5 flex justify-between font-bold text-game-gold text-lg">
          <span>{t.scoring.total}</span>
          <span className="font-mono tabular-nums">{breakdown.total}</span>
        </div>
      </div>
    </div>
  );
}
