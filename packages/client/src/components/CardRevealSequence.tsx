import { useState, useCallback, useMemo } from 'react';
import type { WorldCard, EraCard, RelicCard } from '@war-of-gods/engine';
import { GameCard } from './GameCard.js';
import { useI18n } from '../i18n/index.js';

type RevealStep =
  | { type: 'world'; card: WorldCard }
  | { type: 'era_select'; cards: EraCard[] }
  | { type: 'relic_select'; cards: RelicCard[] };

type Props = {
  worldCard: WorldCard | null;
  /** Current player's pending era card choices (3 options) */
  pendingEraCards: EraCard[] | null;
  /** Current player's pending relic choices (3 options) */
  pendingRelics: RelicCard[] | null;
  /** Already-assigned era card (skips selection if present) */
  eraCard: EraCard | null;
  /** Already-assigned relic (skips selection if present) */
  relic: RelicCard | null;
  onEraCardChosen: (cardId: string) => void;
  onRelicChosen: (relicId: string) => void;
  onComplete: () => void;
};

const STEP_COLORS = {
  world: '#8b5cf6',
  era_select: '#3b82f6',
  relic_select: '#f59e0b',
};

const STEP_ICONS = {
  world: '🌍',
  era_select: '📜',
  relic_select: '💎',
};

// ── Floating rune particles ─────────────────────────────────────

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  angle: number;
  distance: number;
  opacity: number;
};

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 60,
    y: 50 + (Math.random() - 0.5) * 60,
    size: 2 + Math.random() * 3,
    duration: 1.2 + Math.random() * 1.5,
    delay: Math.random() * 0.8,
    angle: Math.random() * 360,
    distance: 40 + Math.random() * 100,
    opacity: 0.4 + Math.random() * 0.6,
  }));
}

function RevealBurst({ color, active }: { color: string; active: boolean }) {
  const particles = useMemo(() => generateParticles(40), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.distance;
        const ty = Math.sin(rad) * p.distance;

        return (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: color,
              boxShadow: `0 0 ${p.size * 3}px ${color}`,
              opacity: active ? 0 : p.opacity,
              transform: active
                ? `translate(${tx}px, ${ty}px) scale(0)`
                : 'translate(0, 0) scale(1)',
              transition: `all ${p.duration}s ease-out ${p.delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Light rays on reveal ────────────────────────────────────────

function LightRays({ color, active }: { color: string; active: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 origin-center"
          style={{
            width: '2px',
            height: active ? '200px' : '0px',
            background: `linear-gradient(to top, transparent, ${color}60, transparent)`,
            transform: `translate(-50%, -50%) rotate(${i * 30}deg)`,
            opacity: active ? 0.6 : 0,
            transition: `all 0.7s ease-out ${0.05 + i * 0.03}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Card Selection UI (pick 1 of 3) ─────────────────────────────

function CardSelector({
  cards,
  label,
  color,
  onSelect,
  title,
  subtitle,
}: {
  cards: (EraCard | RelicCard)[];
  label: string;
  color: string;
  onSelect: (id: string) => void;
  title: string;
  subtitle: string;
}) {
  const t = useI18n(s => s.t);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const locale = useI18n(s => s.locale);

  function getCardText(card: EraCard | RelicCard) {
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
    setTimeout(() => onSelect(selectedId), 600);
  }

  return (
    <div className="min-h-screen bg-game-bg bg-radial-theme flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none"
        style={{ width: '600px', height: '600px', backgroundColor: color, opacity: 0.08 }}
      />

      {/* Header */}
      <div className={`relative z-10 text-center mb-6 max-w-lg transition-all duration-500 ${confirmed ? 'opacity-0 -translate-y-4' : ''}`}>
        <div
          className="text-lg sm:text-xl font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {title}
        </div>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>
        <p className="text-text-secondary text-sm italic leading-relaxed">{subtitle}</p>
      </div>

      {/* Card grid */}
      <div className={`relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-4xl w-full px-2 transition-all duration-500 ${confirmed ? 'opacity-0 scale-95' : ''}`}>
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
                boxShadow: isSelected ? `0 0 30px ${color}30, 0 0 0 3px ${color}60, inset 0 1px 0 ${color}15` : `0 0 10px ${color}08`,
                animationDelay: `${i * 100}ms`,
              }}
            >
              {/* Card header */}
              <div className="px-3 sm:px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: `${color}20` }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: `${color}aa` }}>
                    {label}
                  </div>
                  <h3 className="text-text-primary font-bold text-sm">{text.name}</h3>
                </div>
                {isSelected && (
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Flavor */}
              <div className="px-3 sm:px-4 py-2 border-b" style={{ borderColor: `${color}10` }}>
                <p className="text-text-secondary text-xs italic leading-relaxed">&ldquo;{text.flavorText}&rdquo;</p>
              </div>

              {/* Mechanical effect */}
              <div className="px-3 sm:px-4 py-2.5">
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: `${color}90` }}>
                  {t.era1.effect}
                </div>
                <p className="text-text-primary/90 text-xs leading-relaxed font-medium">{text.mechanicalText}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      <div className={`relative z-10 mt-8 transition-all duration-500 ${selectedId && !confirmed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <button
          type="button"
          onClick={handleConfirm}
          className="group relative overflow-hidden border text-text-primary font-bold px-10 py-3.5 rounded-xl transition-all hover:-translate-y-1 hover:shadow-lg"
          style={{
            borderColor: `${color}40`,
            background: `linear-gradient(135deg, rgba(20,20,48,0.9), rgba(20,20,48,0.7))`,
            boxShadow: `0 0 20px ${color}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          <div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ boxShadow: `inset 0 0 20px ${color}15, 0 0 30px ${color}20` }}
          />
          <span className="relative text-sm uppercase tracking-[0.2em]">{t.era1.selectCard}</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export function CardRevealSequence({
  worldCard,
  pendingEraCards,
  pendingRelics,
  eraCard,
  relic,
  onEraCardChosen,
  onRelicChosen,
  onComplete,
}: Props) {
  const t = useI18n(s => s.t);
  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<'waiting' | 'revealing' | 'revealed' | 'exiting'>('waiting');

  const steps: RevealStep[] = [];
  if (worldCard) steps.push({ type: 'world', card: worldCard });
  // Show selection if pending choices exist, otherwise skip (bot or already chosen)
  if (pendingEraCards && pendingEraCards.length > 0) {
    steps.push({ type: 'era_select', cards: pendingEraCards });
  }
  if (pendingRelics && pendingRelics.length > 0) {
    steps.push({ type: 'relic_select', cards: pendingRelics });
  }

  if (steps.length === 0) {
    onComplete();
    return null;
  }

  const step = steps[currentStep];
  if (!step) {
    onComplete();
    return null;
  }

  const color = STEP_COLORS[step.type];
  const isRevealing = phase === 'revealing' || phase === 'revealed';
  const isRevealed = phase === 'revealed';
  const isExiting = phase === 'exiting';
  const isWaiting = phase === 'waiting';

  const labels: Record<string, string> = {
    world: t.era1.worldCardTitle,
    era_select: t.era1.eraCardTitle,
    relic_select: t.era1.relicTitle,
  };

  // For selection steps, render the CardSelector instead
  if (step.type === 'era_select') {
    return (
      <CardSelector
        cards={step.cards}
        label={t.era1.eraCardTitle}
        color={STEP_COLORS.era_select}
        title={t.era1.chooseEraCard}
        subtitle={t.era1.chooseEraCardSub}
        onSelect={(cardId) => {
          onEraCardChosen(cardId);
          // Move to next step
          if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
            setPhase('waiting');
          } else {
            onComplete();
          }
        }}
      />
    );
  }

  if (step.type === 'relic_select') {
    return (
      <CardSelector
        cards={step.cards}
        label={t.era1.relicTitle}
        color={STEP_COLORS.relic_select}
        title={t.era1.chooseRelic}
        subtitle={t.era1.chooseRelicSub}
        onSelect={(relicId) => {
          onRelicChosen(relicId);
          if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
            setPhase('waiting');
          } else {
            onComplete();
          }
        }}
      />
    );
  }

  // World card — original reveal animation
  const worldStep = step as { type: 'world'; card: WorldCard };
  const narratives: Record<string, string> = {
    world: t.era1.worldCardNarrative,
  };
  const hints: Record<string, string> = {
    world: t.era1.worldCardHint,
  };
  const icon = STEP_ICONS[step.type];

  function handleRevealClick() {
    if (phase !== 'waiting') return;
    setPhase('revealing');
    setTimeout(() => setPhase('revealed'), 900);
  }

  function handleNext() {
    setPhase('exiting');
    setTimeout(() => {
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1);
        setPhase('waiting');
      } else {
        onComplete();
      }
    }, 500);
  }

  return (
    <div id="card-reveal" className="min-h-screen bg-game-bg bg-radial-theme flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none transition-all duration-1000"
        style={{
          width: isRevealing ? '700px' : '200px',
          height: isRevealing ? '700px' : '200px',
          backgroundColor: color,
          opacity: isRevealed ? 0.1 : isRevealing ? 0.25 : 0.04,
        }}
      />

      {/* Pulsing ring — waiting state */}
      {isWaiting && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: '300px',
            height: '300px',
            border: `1px solid ${color}20`,
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
      )}

      {/* Reveal effects */}
      <RevealBurst color={color} active={isRevealing} />
      <LightRays color={color} active={isRevealing} />

      {/* Step indicator dots */}
      <div className="relative z-10 flex gap-4 mb-6">
        {steps.map((s, i) => {
          const stepColor = STEP_COLORS[s.type];
          const isCurrent = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div key={`${s.type}-${i}`} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                  isCurrent ? 'scale-110' : isDone ? '' : 'opacity-40'
                }`}
                style={{
                  borderColor: isCurrent ? stepColor : isDone ? `${stepColor}80` : `${stepColor}30`,
                  backgroundColor: isDone ? `${stepColor}20` : 'transparent',
                  boxShadow: isCurrent ? `0 0 20px ${stepColor}50` : 'none',
                }}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={stepColor} strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-base">{STEP_ICONS[s.type]}</span>
                )}
              </div>
              <span
                className="text-[9px] uppercase tracking-wider font-bold transition-opacity duration-300"
                style={{ color: isCurrent ? stepColor : `${stepColor}60` }}
              >
                {labels[s.type]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Narrative header ── */}
      <div
        className={`relative z-10 text-center mb-8 max-w-md transition-all duration-700 ${
          isExiting ? 'opacity-0 -translate-y-6 scale-95' : 'opacity-100 translate-y-0'
        }`}
      >
        <div
          className="text-lg sm:text-xl font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {labels[step.type]}
        </div>

        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>

        <p
          className="text-text-secondary text-sm italic leading-relaxed transition-all duration-500"
          style={{
            opacity: isRevealed ? 0 : 1,
            transform: isRevealed ? 'translateY(-8px)' : 'none',
          }}
        >
          {narratives[step.type] ?? ''}
        </p>
      </div>

      {/* ── Card area ── */}
      <div className="relative z-10 w-full max-w-sm" style={{ perspective: '1200px' }}>
        <div
          className={`relative ${isWaiting ? 'cursor-pointer group' : ''}`}
          onClick={handleRevealClick}
          style={{
            transformStyle: 'preserve-3d',
            transition: isExiting
              ? 'all 0.4s ease-in'
              : 'all 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* ── Card back ── */}
          <div
            className="transition-all duration-700"
            style={{
              opacity: isRevealing || isRevealed ? 0 : 1,
              transform: isRevealing ? 'rotateY(90deg) scale(0.9)' : isExiting ? 'scale(0.8)' : 'none',
              pointerEvents: isWaiting ? 'auto' : 'none',
              position: isRevealing || isRevealed ? 'absolute' : 'relative',
              inset: isRevealing || isRevealed ? 0 : undefined,
            }}
          >
            <div
              className="rounded-2xl border-2 p-10 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden"
              style={{
                borderColor: `${color}30`,
                background: `radial-gradient(ellipse at center, ${color}12 0%, rgba(10,10,26,0.99) 70%)`,
              }}
            >
              <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: `${color}25` }} />
              <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: `${color}25` }} />
              <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: `${color}25` }} />
              <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: `${color}25` }} />

              <div className="relative mb-6">
                <div
                  className="text-7xl transition-transform duration-300 group-hover:scale-110"
                  style={{ filter: `drop-shadow(0 0 30px ${color}50)` }}
                >
                  {icon}
                </div>
                <div className="absolute -inset-5 rounded-full border-2" style={{ borderColor: `${color}20`, animation: 'pulse 2s ease-in-out infinite' }} />
                <div className="absolute -inset-10 rounded-full border" style={{ borderColor: `${color}10`, animation: 'pulse 2.5s ease-in-out infinite 0.5s' }} />
                <div className="absolute -inset-16 rounded-full border" style={{ borderColor: `${color}06`, animation: 'pulse 3s ease-in-out infinite 1s' }} />
              </div>

              <div
                className="text-5xl font-black mb-4 transition-all duration-300 group-hover:scale-110"
                style={{ color: `${color}30`, textShadow: `0 0 40px ${color}25`, animation: 'pulse 2s ease-in-out infinite' }}
              >
                ?
              </div>

              <div className="text-xs font-medium transition-all duration-300 group-hover:tracking-wider" style={{ color: `${color}60` }}>
                {hints[step.type] ?? ''}
              </div>

              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  background: `linear-gradient(110deg, transparent 25%, ${color}06 40%, ${color}12 50%, ${color}06 60%, transparent 75%)`,
                  backgroundSize: '250% 100%',
                  animation: 'shimmer 4s linear infinite',
                }}
              />

              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ boxShadow: `inset 0 0 60px ${color}08, 0 0 40px ${color}15` }}
              />
            </div>
          </div>

          {/* ── Card front ── */}
          <div
            className="transition-all duration-700"
            style={{
              opacity: isRevealing || isRevealed ? 1 : 0,
              transform: isRevealing && !isRevealed
                ? 'rotateY(-90deg) scale(0.9)'
                : isRevealed
                  ? 'rotateY(0deg) scale(1)'
                  : 'scale(0.8)',
              pointerEvents: isRevealed ? 'auto' : 'none',
              position: !isRevealing && !isRevealed ? 'absolute' : 'relative',
              inset: !isRevealing && !isRevealed ? 0 : undefined,
              filter: isRevealed ? `drop-shadow(0 0 30px ${color}30)` : 'none',
            }}
          >
            <GameCard card={worldStep.card} label={labels[step.type]} accentColor={color} />
          </div>
        </div>
      </div>

      {/* Continue button */}
      <div
        className={`relative z-10 mt-10 transition-all duration-600 ${
          isRevealed && !isExiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={handleNext}
          className="group relative overflow-hidden border text-text-primary font-bold px-10 py-3.5 rounded-xl transition-all hover:-translate-y-1 hover:shadow-lg"
          style={{
            borderColor: `${color}40`,
            background: `linear-gradient(135deg, rgba(20,20,48,0.9), rgba(20,20,48,0.7))`,
            boxShadow: `0 0 20px ${color}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          <div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ boxShadow: `inset 0 0 20px ${color}15, 0 0 30px ${color}20` }}
          />
          <div
            className="absolute inset-0 opacity-30 group-hover:opacity-60 transition-opacity"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${color}20 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s linear infinite',
            }}
          />
          <span className="relative text-sm uppercase tracking-[0.2em]">
            {currentStep < steps.length - 1 ? t.actions.next : t.actions.continue}
          </span>
        </button>
      </div>

      {/* Step counter */}
      <div
        className={`relative z-10 mt-4 text-xs transition-all duration-500 ${
          phase !== 'exiting' ? 'opacity-60' : 'opacity-0'
        }`}
        style={{ color: `${color}80` }}
      >
        {currentStep + 1} / {steps.length}
      </div>
    </div>
  );
}
