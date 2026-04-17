import type { WorldCard, EraCard, RelicCard } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

type CardData = WorldCard | EraCard | RelicCard;

type Props = {
  card: CardData;
  label?: string;
  accentColor?: string;
  compact?: boolean;
};

function getCardTypeColor(card: CardData): string {
  if ('type' in card) {
    if ((card as WorldCard).type === 'world_era1') return '#8b5cf6'; // purple
    if ((card as EraCard).type === 'era1') return '#3b82f6'; // blue
  }
  return '#f59e0b'; // amber for relics
}

/** Returns locale-appropriate card fields */
function useCardText(card: CardData) {
  const locale = useI18n(s => s.locale);
  if (locale === 'en') {
    return {
      name: card.name_en || card.name,
      flavorText: card.flavorText_en || card.flavorText,
      mechanicalText: card.mechanicalText_en || card.mechanicalText,
    };
  }
  return {
    name: card.name,
    flavorText: card.flavorText,
    mechanicalText: card.mechanicalText,
  };
}

export function GameCard({ card, label, accentColor, compact = false }: Props) {
  const t = useI18n(s => s.t);
  const color = accentColor ?? getCardTypeColor(card);
  const text = useCardText(card);

  if (compact) {
    return (
      <div
        className="rounded-lg border overflow-hidden transition-all hover:shadow-gold-sm cursor-default"
        style={{
          borderColor: `${color}30`,
          background: `linear-gradient(135deg, ${color}10 0%, transparent 100%)`,
        }}
      >
        <div className="px-3 py-2.5">
          {label && (
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: `${color}bb` }}>
              {label}
            </div>
          )}
          <div className="text-text-primary text-sm font-bold leading-tight">{text.name}</div>
          <div className="text-text-primary/70 text-xs leading-snug mt-1">
            {text.mechanicalText}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border-2 overflow-hidden transition-all"
      style={{
        borderColor: `${color}40`,
        background: `linear-gradient(180deg, ${color}15 0%, ${color}05 40%, transparent 100%)`,
        boxShadow: `0 0 20px ${color}15, inset 0 1px 0 ${color}10`,
      }}
    >
      {/* Card header */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: `${color}20` }}
      >
        <div>
          {label && (
            <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: `${color}aa` }}>
              {label}
            </div>
          )}
          <h3 className="text-text-primary font-bold text-sm">{text.name}</h3>
        </div>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
        />
      </div>

      {/* Flavor text */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: `${color}10` }}>
        <p className="text-text-secondary text-xs italic leading-relaxed">
          &ldquo;{text.flavorText}&rdquo;
        </p>
      </div>

      {/* Mechanical effect */}
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: `${color}90` }}>
          {t.era1.effect}
        </div>
        <p className="text-text-primary/90 text-xs leading-relaxed font-medium">
          {text.mechanicalText}
        </p>
      </div>
    </div>
  );
}
