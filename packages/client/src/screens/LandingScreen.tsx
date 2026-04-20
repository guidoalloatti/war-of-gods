import { useRef, useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';

type Props = {
  onSkip: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
};

/** Intersection Observer hook: returns true when element enters viewport */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/** Animated counter */
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setDisplay(Math.round(value * progress));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value, duration]);

  return <span ref={ref} className="tabular-nums">{display}</span>;
}

/** Floating particles in hero */
function HeroParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-game-gold/30"
          style={{
            left: `${8 + (i * 37) % 84}%`,
            top: `${12 + (i * 53) % 76}%`,
            animation: `float-${(i % 3) + 1} ${6 + (i % 5) * 2}s ease-in-out infinite`,
            animationDelay: `${(i * 0.7) % 4}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Decorative hex grid SVG background */
function HexGridBg({ className = '' }: { className?: string }) {
  const size = 30;
  const w = Math.sqrt(3) * size;
  const h = size * 2;
  return (
    <svg className={`absolute inset-0 w-full h-full opacity-[0.025] ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="hex-bg" width={w} height={h * 0.75} patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
          <polygon
            points={`${w / 2},0 ${w},${h / 4} ${w},${h * 3 / 4} ${w / 2},${h} 0,${h * 3 / 4} 0,${h / 4}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-bg)" className="text-game-gold" />
    </svg>
  );
}

export function LandingScreen({ onSkip, onLogin, onRegister }: Props) {
  const t = useI18n(s => s.t);

  const heroSection = useInView(0.1);
  const statsSection = useInView(0.3);
  const featuresSection = useInView(0.15);
  const racesSection = useInView(0.15);
  const strategySection = useInView(0.15);
  const ctaSection = useInView(0.2);

  return (
    <div id="landing-screen" className="min-h-screen bg-game-bg relative overflow-x-hidden">

      {/* ═══ HERO ═══ */}
      <section id="landing-hero" ref={heroSection.ref} className="relative min-h-[85vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Layered background effects */}
        <div className="absolute inset-0 bg-radial-theme" />
        <HexGridBg />
        <HeroParticles />

        {/* Central glow orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-radial-gold pointer-events-none opacity-70" />
        <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[200px] rounded-full pointer-events-none opacity-30"
          style={{ background: 'radial-gradient(ellipse, rgba(233,69,96,0.15), transparent 70%)' }} />

        <div className={`relative z-10 text-center max-w-2xl mx-auto transition-all duration-1000 ease-out ${heroSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          {/* Era badge */}
          <div className="inline-flex items-center gap-2 bg-game-surface/60 backdrop-blur-md border border-game-gold/20 rounded-full px-5 py-2 mb-6">
            <svg className="w-4 h-4 text-game-gold" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <span className="text-game-gold text-xs font-bold tracking-[0.2em] uppercase">ERA I</span>
          </div>

          {/* Title with text shadow effect */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-game-gold to-game-gold-dark tracking-tight uppercase leading-[0.85]"
            style={{ textShadow: '0 0 80px rgba(245,197,24,0.3)' }}>
            {t.landing.heroTitle}
          </h1>

          <p className="text-text-secondary text-lg sm:text-xl mt-5 max-w-lg mx-auto leading-relaxed font-light">
            {t.landing.heroSubtitle}
          </p>

          <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">
            {t.landing.heroDescription}
          </p>

          {/* CTA — inline compact */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onLogin && (
              <button
                id="hero-login-btn"
                type="button"
                onClick={onLogin}
                className="relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold px-10 py-3.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 hover:shadow-lg transition-all shadow-accent group"
              >
                <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                <span className="relative flex items-center gap-2">
                  {t.auth.login}
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            )}

            {onRegister && (
              <button
                id="hero-register-btn"
                type="button"
                onClick={onRegister}
                className="bg-game-surface/80 backdrop-blur-sm border border-border-medium text-text-primary font-bold px-8 py-3.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 hover:border-game-gold/40 transition-all"
              >
                {t.auth.register}
              </button>
            )}

            <button
              type="button"
              onClick={onSkip}
              className="text-text-faint hover:text-text-muted text-xs transition-colors underline underline-offset-4 decoration-text-faint/30"
            >
              {t.auth.playAsGuest}
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-fade-in" style={{ animationDelay: '1.5s' }}>
          <div className="w-5 h-8 border-2 border-text-faint/50 rounded-full flex items-start justify-center p-1">
            <div className="w-1 h-2 bg-game-gold/60 rounded-full animate-float-1" />
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ═══ */}
      <section id="landing-stats" ref={statsSection.ref} className="relative py-6 px-6 border-y border-border-subtle bg-game-surface/30 backdrop-blur-sm">
        <div className={`max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 text-center transition-all duration-700 ${statsSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {[
            { value: 8, label: t.landing.featureRaces.replace(/\d+\s*/, ''), suffix: '' },
            { value: 37, label: 'Hexagons', suffix: '' },
            { value: 57, label: t.landing.featureCards.split('&')[0].trim(), suffix: '+' },
            { value: 6, label: 'Players', suffix: '' },
          ].map((stat, i) => (
            <div key={i} className="py-1">
              <div className="text-2xl sm:text-3xl font-black font-display text-game-gold">
                <AnimatedNumber value={stat.value} />{stat.suffix}
              </div>
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="landing-features" ref={featuresSection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-4xl mx-auto">
          <div className={`text-center mb-8 transition-all duration-700 ${featuresSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <h2 className="text-xl sm:text-2xl font-black font-display text-text-primary uppercase tracking-wide">
              {t.landing.sectionStrategy}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: '⬡', key: 'featureBoard', delay: 0, color: '#f5c518' },
              { icon: '👑', key: 'featureRaces', delay: 100, color: '#e94560' },
              { icon: '🃏', key: 'featureCards', delay: 200, color: '#8b5cf6' },
              { icon: '🌐', key: 'featureMultiplayer', delay: 300, color: '#22d3ee' },
            ].map(({ icon, key, delay, color }) => (
              <div
                key={key}
                id={`landing-feature-${key}`}
                className={`group relative bg-game-surface/50 backdrop-blur-sm border border-border-subtle rounded-xl p-5 text-center hover:border-game-gold/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden ${
                  featuresSection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{ animationDelay: `${delay}ms` }}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle at 50% 30%, ${color}10, transparent 70%)` }} />
                <div className="relative">
                  <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-200">{icon}</div>
                  <h3 className="text-text-primary font-bold text-sm mb-1.5 font-display">
                    {t.landing[key as keyof typeof t.landing]}
                  </h3>
                  <p className="text-text-muted text-[11px] leading-relaxed">
                    {t.landing[`${key}Desc` as keyof typeof t.landing]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ RACES SHOWCASE ═══ */}
      <section id="landing-races" ref={racesSection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        {/* Subtle hex bg for this section */}
        <HexGridBg className="opacity-[0.015]" />

        <div className="max-w-4xl mx-auto relative z-10">
          <div className={`text-center mb-8 transition-all duration-700 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <h2 className="text-xl sm:text-2xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold to-game-ember uppercase tracking-wide">
              {t.landing.sectionRaces}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">{t.landing.sectionRacesDesc}</p>
          </div>

          {/* Race cards — 2x2 grid with large icons and rich hover */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 transition-all duration-700 delay-100 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {([
              { id: 'elf', emoji: '🏡', color: '#4aad6a', key: 'raceElf', terrain: '🌲' },
              { id: 'dwarf', emoji: '⛏️', color: '#8a9bae', key: 'raceDwarf', terrain: '⛰️' },
              { id: 'human', emoji: '🏰', color: '#d4b95a', key: 'raceHuman', terrain: '🌾' },
              { id: 'orc', emoji: '⚔️', color: '#E74C3C', key: 'raceOrc', terrain: '🌿' },
            ] as const).map((race, i) => (
              <div
                key={race.id}
                className={`group relative bg-game-surface/40 border border-border-subtle rounded-xl p-4 hover:-translate-y-1 transition-all duration-300 overflow-hidden ${
                  racesSection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{ animationDelay: `${i * 80}ms`, borderColor: `${race.color}15` }}
              >
                {/* Hover radial */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle at 50% 20%, ${race.color}12, transparent 70%)` }} />
                {/* Decorative terrain badge */}
                <div className="absolute top-2 right-2 text-xs opacity-30 group-hover:opacity-50 transition-opacity">{race.terrain}</div>
                <div className="relative">
                  <div className="text-3xl mb-2">{race.emoji}</div>
                  <div className="font-black text-sm mb-1 font-display" style={{ color: race.color }}>
                    {t.races[race.id as keyof typeof t.races]}
                  </div>
                  <p className="text-text-muted text-[11px] leading-relaxed line-clamp-3">
                    {t.landing[race.key as keyof typeof t.landing]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STRATEGY PILLARS ═══ */}
      <section id="landing-strategy" ref={strategySection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-3xl mx-auto">
          <div className={`text-center mb-8 transition-all duration-700 ${strategySection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <h2 className="text-xl sm:text-2xl font-black font-display text-text-primary uppercase tracking-wide">
              {t.landing.sectionStrategy}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">{t.landing.sectionStrategyDesc}</p>
          </div>

          <div className={`space-y-3 transition-all duration-700 delay-200 ${strategySection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {[
              { icon: '⬡', key: 'stratTile', color: '#f5c518', num: '37' },
              { icon: '🤝', key: 'stratTrade', color: '#e94560', num: '6' },
              { icon: '✨', key: 'stratCards', color: '#8b5cf6', num: '57' },
            ].map((item, i) => (
              <div
                key={item.key}
                id={`landing-strat-${item.key}`}
                className={`group flex items-center gap-4 bg-game-surface/40 border border-border-subtle rounded-xl px-5 py-4 hover:-translate-y-0.5 transition-all duration-300 ${
                  strategySection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{ animationDelay: `${i * 100}ms`, borderColor: `${item.color}10` }}
              >
                {/* Number accent */}
                <div className="w-12 h-12 flex items-center justify-center rounded-xl text-xl font-black font-display shrink-0"
                  style={{ backgroundColor: `${item.color}10`, color: item.color }}>
                  {item.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-text-primary font-bold text-sm" style={{ color: item.color }}>
                    {t.landing[item.key as keyof typeof t.landing]}
                  </h4>
                  <p className="text-text-muted text-xs mt-0.5 leading-relaxed">
                    {t.landing[`${item.key}Desc` as keyof typeof t.landing]}
                  </p>
                </div>
                <svg className="w-5 h-5 text-text-faint group-hover:text-text-muted transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section id="landing-cta" ref={ctaSection.ref} className="relative py-16 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-radial-gold pointer-events-none opacity-50" />

        <div className={`relative z-10 text-center max-w-lg mx-auto transition-all duration-700 ${ctaSection.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          {/* Decorative divider */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-game-gold/30" />
            <svg className="w-5 h-5 text-game-gold/50" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-game-gold/30" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold to-game-gold-dark uppercase tracking-wide">
            {t.landing.sectionCta}
          </h2>
          <p className="text-text-muted text-sm mt-3 mb-8">
            {t.landing.sectionCtaDesc}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onLogin && (
              <button
                id="cta-login-btn"
                type="button"
                onClick={onLogin}
                className="relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold px-10 py-3.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 hover:shadow-lg transition-all shadow-accent group"
              >
                <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                <span className="relative flex items-center gap-2">
                  {t.auth.login}
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            )}

            {onRegister && (
              <button
                id="cta-register-btn"
                type="button"
                onClick={onRegister}
                className="bg-game-surface/80 backdrop-blur-sm border border-border-medium text-text-primary font-bold px-8 py-3.5 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-0.5 hover:border-game-gold/40 transition-all"
              >
                {t.auth.register}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer line */}
      <div className="h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
    </div>
  );
}
