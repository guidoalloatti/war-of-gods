import { memo } from 'react';
import type { WorldCard, EraCard, RelicCard } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

type CardData = WorldCard | EraCard | RelicCard;

type Props = {
  card: CardData;
  label?: string;
  accentColor?: string;
  compact?: boolean;
  dense?: boolean;
};

function getCardTypeColor(card: CardData): string {
  if ('type' in card) {
    if ((card as WorldCard).type === 'world_era1') return '#8b5cf6';
    if ((card as EraCard).type === 'era1') return '#3b82f6';
  }
  return '#f59e0b';
}

function getCardTypeIcon(card: CardData): string {
  if ('type' in card) {
    if ((card as WorldCard).type === 'world_era1') return '🌍';
    if ((card as EraCard).type === 'era1') return '📜';
  }
  return '💎';
}

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

export const GameCard = memo(function GameCard({ card, label, accentColor, compact = false, dense = false }: Props) {
  const t = useI18n(s => s.t);
  const color = accentColor ?? getCardTypeColor(card);
  const icon = getCardTypeIcon(card);
  const text = useCardText(card);

  if (dense) {
    return (
      <div
        className="rounded-lg overflow-hidden relative"
        style={{
          border: `1.5px solid ${color}55`,
          background: `linear-gradient(180deg, #1a1030 0%, #0d0820 100%)`,
          boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 12px ${color}15, inset 0 1px 0 ${color}22`,
        }}
      >
        {/* Header strip */}
        <div className="px-3 py-2"
          style={{ background: `linear-gradient(90deg, ${color}28 0%, transparent 100%)` }}>
          {label && (
            <div className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5"
              style={{ color: `${color}cc` }}>
              <span className="text-sm">{icon}</span>
              <span>{label}</span>
            </div>
          )}
          <h3 className="text-text-primary font-bold text-sm leading-tight mt-1" style={{ fontFamily: 'serif' }}>
            {text.name}
          </h3>
        </div>
        {/* Separator */}
        <div className="h-px mx-3" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
        {/* Effect */}
        <div className="px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: `${color}90` }}>
            {t.era1.effect}
          </div>
          <p className="text-text-primary text-sm leading-snug font-medium">
            {text.mechanicalText}
          </p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="rounded-lg border overflow-hidden transition-all hover:shadow-gold-sm cursor-default"
        style={{
          borderColor: `${color}35`,
          background: `linear-gradient(135deg, ${color}12 0%, transparent 100%)`,
        }}
      >
        <div className="px-3 py-2.5">
          {label && (
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 flex items-center gap-1"
              style={{ color: `${color}bb` }}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          )}
          <div className="text-text-primary text-sm font-bold leading-tight">{text.name}</div>
          <div className="text-text-primary/70 text-xs leading-snug mt-1">{text.mechanicalText}</div>
        </div>
      </div>
    );
  }

  // Full card — styled like a real physical card
  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{
        border: `2px solid ${color}50`,
        background: `linear-gradient(180deg, #1a1030 0%, #0d0820 100%)`,
        boxShadow: `
          0 0 0 1px ${color}18,
          0 4px 12px rgba(0,0,0,0.6),
          0 0 30px ${color}18,
          inset 0 1px 0 ${color}20,
          inset 0 -1px 0 rgba(0,0,0,0.4)
        `,
      }}
    >
      {/* Card border inner glow */}
      <div className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ boxShadow: `inset 0 0 20px ${color}12` }}
      />

      {/* Corner decorations */}
      <div className="absolute top-2 left-2 w-4 h-4 pointer-events-none opacity-40"
        style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, borderRadius: '2px 0 0 0' }}
      />
      <div className="absolute top-2 right-2 w-4 h-4 pointer-events-none opacity-40"
        style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}`, borderRadius: '0 2px 0 0' }}
      />
      <div className="absolute bottom-2 left-2 w-4 h-4 pointer-events-none opacity-40"
        style={{ borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}`, borderRadius: '0 0 0 2px' }}
      />
      <div className="absolute bottom-2 right-2 w-4 h-4 pointer-events-none opacity-40"
        style={{ borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}`, borderRadius: '0 0 2px 0' }}
      />

      {/* Card header */}
      <div className="px-5 pt-5 pb-3 relative"
        style={{ background: `linear-gradient(180deg, ${color}20 0%, transparent 100%)` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {label && (
              <div className="text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"
                style={{ color: `${color}cc` }}>
                <span className="text-sm">{icon}</span>
                <span>{label}</span>
              </div>
            )}
            <h3 className="text-text-primary font-bold text-base leading-tight" style={{ fontFamily: 'serif' }}>
              {text.name}
            </h3>
          </div>
          {/* Card type gem */}
          <div className="shrink-0 mt-0.5 flex flex-col items-center gap-0.5">
            <div className="w-3.5 h-3.5 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}80, 0 0 20px ${color}40, 0 0 0 2px ${color}80`,
              }}
            />
          </div>
        </div>
        {/* Separator line */}
        <div className="mt-3 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
      </div>

      {/* Illustration area — decorative pattern based on card type */}
      <div className="mx-5 rounded-lg overflow-hidden relative h-16"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${color}20 0%, ${color}08 60%, transparent 100%)`,
          border: `1px solid ${color}25`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl opacity-60" style={{ filter: `drop-shadow(0 0 12px ${color})` }}>
            {icon}
          </span>
        </div>
        {/* Diagonal shimmer lines */}
        <div className="absolute inset-0 overflow-hidden opacity-10"
          style={{
            background: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 6px,
              ${color}30 6px,
              ${color}30 7px
            )`,
          }}
        />
      </div>

      {/* Flavor text */}
      <div className="px-5 pt-3 pb-2">
        <div className="h-px mb-2.5" style={{ background: `linear-gradient(90deg, transparent, ${color}30, transparent)` }} />
        <p className="text-text-secondary text-xs italic leading-relaxed text-center">
          &ldquo;{text.flavorText}&rdquo;
        </p>
        <div className="h-px mt-2.5" style={{ background: `linear-gradient(90deg, transparent, ${color}20, transparent)` }} />
      </div>

      {/* Effect section */}
      <div className="px-5 pb-5">
        <div className="rounded-lg px-3 py-2.5"
          style={{
            background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.3) 100%)`,
            border: `1px solid ${color}20`,
          }}
        >
          <div className="text-[9px] uppercase tracking-widest font-bold mb-1.5" style={{ color: `${color}90` }}>
            {t.era1.effect}
          </div>
          <p className="text-text-primary text-xs leading-relaxed font-medium">
            {text.mechanicalText}
          </p>
        </div>
      </div>
    </div>
  );
});
