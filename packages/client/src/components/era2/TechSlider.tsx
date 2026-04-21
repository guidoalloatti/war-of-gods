import { useState } from 'react';
import {
  TECH_BENEFITS,
  calculateTechCost,
  getIncrementalCost,
} from '@war-of-gods/engine';
import type { PlayerEra2State, TechType } from '@war-of-gods/engine';
import type { Translations } from '../../i18n/es.js';

const TECH_ICONS: Record<TechType, string> = {
  war: '⚔️',
  science: '🔬',
  resources: '🌾',
  economy: '💰',
};

const TECH_COLORS: Record<TechType, string> = {
  war: '#e94560',
  science: '#3b82f6',
  resources: '#10b981',
  economy: '#f5c518',
};

type Props = {
  tech: TechType;
  era2: PlayerEra2State;
  isRacial: boolean;
  disabled: boolean;
  onChange: (targetLevel: number) => void;
  t: Translations;
};

export function TechSlider({ tech, era2, isRacial, disabled, onChange, t }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = era2.techLevels[tech];
  const baseline = era2.baselineTechLevels[tech];
  const maxLevel = era2.allowLevel6 ? 6 : 5;
  const color = TECH_COLORS[tech];
  const benefits = TECH_BENEFITS[tech];

  const displayLevel = hovered ?? current;
  const benefitValue = benefits.values[Math.min(displayLevel, benefits.values.length - 1)];

  // Preview cost from current → hovered (if hovered > current) else 0
  let previewCost = 0;
  if (hovered != null && hovered > current) {
    const { totalCost } = calculateTechCost(
      tech,
      baseline,
      hovered,
      era2.freeLevelsRemaining[tech],
      {
        flat: era2.costModifiers.flat[tech],
        perLevel: era2.costModifiers.perLevel[tech],
        minCostPerLevel: era2.costModifiers.minCostPerLevel,
      },
      era2.allowLevel6,
    );
    // subtract what we've already paid for (current > baseline)
    const { totalCost: paid } = calculateTechCost(
      tech,
      baseline,
      current,
      era2.freeLevelsRemaining[tech],
      {
        flat: era2.costModifiers.flat[tech],
        perLevel: era2.costModifiers.perLevel[tech],
        minCostPerLevel: era2.costModifiers.minCostPerLevel,
      },
      era2.allowLevel6,
    );
    previewCost = totalCost - paid;
  }

  return (
    <div
      className="rounded-xl border p-3 transition-all"
      style={{
        borderColor: disabled ? '#3a3a4e' : `${color}40`,
        background: `linear-gradient(180deg, ${color}0a 0%, transparent 100%)`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{TECH_ICONS[tech]}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-text-primary font-bold text-sm">{t.tech[tech]}</h3>
            {isRacial && (
              <span className="text-[10px] text-game-gold bg-game-gold/10 border border-game-gold/30 px-1.5 py-0.5 rounded">
                {t.era2.racialBonus}
              </span>
            )}
          </div>
          <div className="text-text-muted text-[11px]">{t.tech.descriptions[tech]}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-muted">{t.tech.level}</div>
          <div className="text-lg font-bold tabular-nums" style={{ color }}>
            {current}
          </div>
        </div>
      </div>

      {/* Level buttons */}
      <div className="flex items-center gap-1 mb-2">
        {Array.from({ length: 7 }, (_, lvl) => {
          const isBaseline = lvl <= baseline;
          const isOwned = lvl <= current;
          const isLockedByLevel6 = lvl === 6 && !era2.allowLevel6;
          const canClick = !disabled && !isLockedByLevel6 && lvl >= baseline;
          return (
            <button
              key={lvl}
              type="button"
              disabled={!canClick}
              onMouseEnter={() => setHovered(lvl)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange(lvl)}
              className="flex-1 h-8 rounded-md text-xs font-bold transition-all tabular-nums relative"
              style={{
                background: isOwned ? color : isBaseline ? `${color}30` : '#1a1a2a',
                color: isOwned || isBaseline ? '#0a0a1a' : '#6b6b7a',
                border: `1px solid ${isOwned ? color : '#2a2a3a'}`,
                cursor: canClick ? 'pointer' : 'not-allowed',
                opacity: isLockedByLevel6 ? 0.3 : 1,
              }}
              title={isLockedByLevel6 ? t.tech.level6Locked : `${t.tech.level} ${lvl}`}
            >
              {lvl}
              {isBaseline && lvl > 0 && (
                <span className="absolute top-0 right-0.5 text-[8px] text-game-gold/80">★</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Benefit row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {benefits.label}: <span className="text-text-primary font-bold">{benefitValue}</span>
        </span>
        {hovered != null && hovered > current && previewCost > 0 && (
          <span className="text-game-gold">
            {t.tech.cost}: <span className="font-bold">+{previewCost}</span>
          </span>
        )}
        {hovered == null && current < maxLevel && (
          <span className="text-text-muted">
            {t.tech.nextLevelCost}: {getIncrementalCost(tech, current + 1)}
          </span>
        )}
      </div>
    </div>
  );
}
