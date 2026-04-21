import { useState } from 'react';
import type { EraCard } from '@war-of-gods/engine';
import type { Translations } from '../../i18n/es.js';
import { useI18n } from '../../i18n/index.js';

type Props = {
  cards: EraCard[];
  onSelect: (cardId: string) => void;
  t: Translations;
};

export function Era2CardReveal({ cards, onSelect, t }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const locale = useI18n(s => s.locale);
  const color = '#3b82f6';

  function getCardText(card: EraCard) {
    if (locale === 'en') {
      return {
        name: card.name_en || card.name,
        flavorText: card.flavorText_en || card.flavorText,
        mechanicalText: card.mechanicalText_en || card.mechanicalText,
      };
    }
    return { name: card.name, flavorText: card.flavorText, mechanicalText: card.mechanicalText };
  }

  function handleConfirm() {
    if (!selectedId) return;
    setConfirmed(true);
    setTimeout(() => onSelect(selectedId), 400);
  }

  return (
    <div className="w-full max-w-3xl mx-auto py-4 animate-fade-in-up">
      <div className={`text-center mb-6 transition-all duration-500 ${confirmed ? 'opacity-0 -translate-y-4' : ''}`}>
        <div
          className="text-lg font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {t.era2.chooseCard}
        </div>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-all duration-500 ${confirmed ? 'opacity-0 scale-95' : ''}`}>
        {cards.map((card, i) => {
          const text = getCardText(card);
          const isSelected = selectedId === card.id;
          const isUnselected = selectedId !== null && !isSelected;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => !confirmed && setSelectedId(card.id)}
              className={`text-left rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                isSelected ? 'scale-[1.03]' : isUnselected ? 'opacity-50 scale-[0.97]' : 'hover:scale-[1.02]'
              }`}
              style={{
                borderColor: isSelected ? color : `${color}25`,
                background: `linear-gradient(180deg, ${color}${isSelected ? '20' : '10'} 0%, ${color}05 40%, transparent 100%)`,
                boxShadow: isSelected ? `0 0 30px ${color}30, 0 0 0 3px ${color}60` : `0 0 10px ${color}08`,
                animationDelay: `${i * 100}ms`,
              }}
            >
              <div className="px-3 py-2.5 border-b flex items-center justify-between" style={{ borderColor: `${color}20` }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: `${color}aa` }}>
                    {t.era2.yourCard}
                  </div>
                  <h3 className="text-text-primary font-bold text-sm">{text.name}</h3>
                </div>
                {isSelected && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="px-3 py-2 border-b" style={{ borderColor: `${color}10` }}>
                <p className="text-text-secondary text-xs italic leading-relaxed">&ldquo;{text.flavorText}&rdquo;</p>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: `${color}90` }}>
                  {t.era1.effect}
                </div>
                <p className="text-text-primary/90 text-xs leading-relaxed font-medium">{text.mechanicalText}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className={`mt-6 transition-all duration-500 ${selectedId && !confirmed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
          style={{ boxShadow: `0 0 20px ${color}20` }}
        >
          <div className="absolute inset-0 animate-shimmer pointer-events-none" />
          <span className="relative">{t.era1.selectCard}</span>
        </button>
      </div>
    </div>
  );
}
