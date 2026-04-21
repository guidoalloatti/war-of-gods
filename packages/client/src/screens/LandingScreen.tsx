import { useRef, useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';

type Props = {
  onSkip: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
};

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

/** Mini hex map showing a fragment of an Era III disc. Purely decorative. */
function MiniHexMap() {
  const SIZE = 22;
  const SQRT3 = Math.sqrt(3);
  const RADIUS = 4;
  const hexes: { q: number; r: number; terrain: string }[] = [];
  const palette: Record<string, { fill: string; stroke: string }> = {
    plain:    { fill: '#4f8763', stroke: '#2d4f37' },
    forest:   { fill: '#2f6340', stroke: '#153325' },
    mountain: { fill: '#727274', stroke: '#3d3d3f' },
    swamp:    { fill: '#5f3e72', stroke: '#3a2445' },
    road:     { fill: '#b89059', stroke: '#8b6c42' },
    ruins:    { fill: '#c76236', stroke: '#9c4820' },
    citadel:  { fill: '#1a1a2e', stroke: '#f5c518' },
  };
  const patternSeed = (q: number, r: number) => {
    // Deterministic decorative terrain. Center = citadel; ring(2) = road; corners biased to specific terrains.
    if (q === 0 && r === 0) return 'citadel';
    const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
    if (dist === 2 && (q === 2 || q === -2 || r === 2 || r === -2)) return 'road';
    if (dist === 3) return 'ruins';
    const terrains = ['plain', 'forest', 'mountain', 'swamp'] as const;
    return terrains[(q * 5 + r * 7 + 13) & 3];
  };
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
      hexes.push({ q, r, terrain: patternSeed(q, r) });
    }
  }
  const toPixel = (q: number, r: number) => ({
    x: SIZE * SQRT3 * (q + r / 2),
    y: SIZE * 1.5 * r,
  });
  const points = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => {
    const ang = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + SIZE * Math.cos(ang)).toFixed(1)},${(cy + SIZE * Math.sin(ang)).toFixed(1)}`;
  }).join(' ');

  const capitals: [number, number, string][] = [
    [-3, 3, '#10b981'],
    [3, -3, '#3b82f6'],
    [0, -3, '#a855f7'],
    [0, 3, '#ec4899'],
  ];
  const capitalSet = new Set(capitals.map(([q, r]) => `${q},${r}`));

  return (
    <svg
      viewBox={`-${SIZE * SQRT3 * (RADIUS + 1)} -${SIZE * (RADIUS + 1.5)} ${SIZE * SQRT3 * (2 * RADIUS + 2)} ${SIZE * (2 * RADIUS + 3)}`}
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }}
    >
      {hexes.map(({ q, r, terrain }) => {
        const { x, y } = toPixel(q, r);
        const key = `${q},${r}`;
        const isCapital = capitalSet.has(key);
        const capColor = isCapital ? capitals.find(([cq, cr]) => cq === q && cr === r)![2] : null;
        const pal = palette[isCapital ? 'plain' : terrain];
        const isCitadel = terrain === 'citadel';
        return (
          <g key={key}>
            <polygon
              points={points(x, y)}
              fill={pal.fill}
              stroke={isCapital ? capColor! : isCitadel ? palette.citadel.stroke : pal.stroke}
              strokeWidth={isCapital || isCitadel ? 2 : 0.6}
            />
            {isCitadel && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#f5c518" pointerEvents="none">💀</text>
            )}
            {isCapital && (
              <circle cx={x} cy={y} r={SIZE * 0.38} fill={capColor!} stroke="#0a0a1a" strokeWidth={1.5} />
            )}
            {isCapital && (
              <text x={x} y={y + 3} textAnchor="middle" fontSize="10" fill="#fef3c7" fontWeight="bold" pointerEvents="none">♚</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function LandingScreen({ onSkip, onLogin, onRegister }: Props) {
  const t = useI18n(s => s.t);

  const heroSection = useInView(0.1);
  const statsSection = useInView(0.3);
  const erasSection = useInView(0.1);
  const mapSection = useInView(0.1);
  const unitsSection = useInView(0.15);
  const bossSection = useInView(0.15);
  const featuresSection = useInView(0.15);
  const racesSection = useInView(0.1);
  const strategySection = useInView(0.15);
  const ctaSection = useInView(0.2);

  return (
    <div id="landing-screen" className="min-h-screen bg-game-bg relative overflow-x-hidden">

      {/* ═══ HERO ═══ */}
      <section id="landing-hero" ref={heroSection.ref} className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="absolute inset-0 bg-radial-theme" />
        <HexGridBg />
        <HeroParticles />

        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-radial-gold pointer-events-none opacity-70" />
        <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[200px] rounded-full pointer-events-none opacity-30"
          style={{ background: 'radial-gradient(ellipse, rgba(233,69,96,0.15), transparent 70%)' }} />

        <div className={`relative z-10 text-center max-w-2xl mx-auto transition-all duration-1000 ease-out ${heroSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="inline-flex items-center gap-2 bg-game-surface/60 backdrop-blur-md border border-game-gold/20 rounded-full px-5 py-2 mb-6">
            <svg className="w-4 h-4 text-game-gold" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <span className="text-game-gold text-xs font-bold tracking-[0.2em] uppercase">{t.landing.heroBadge}</span>
          </div>

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

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-fade-in" style={{ animationDelay: '1.5s' }}>
          <div className="w-5 h-8 border-2 border-text-faint/50 rounded-full flex items-start justify-center p-1">
            <div className="w-1 h-2 bg-game-gold/60 rounded-full animate-float-1" />
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ═══ */}
      <section id="landing-stats" ref={statsSection.ref} className="relative py-6 px-6 border-y border-border-subtle bg-game-surface/30 backdrop-blur-sm">
        <div className={`max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 text-center transition-all duration-700 ${statsSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {[
            { value: 3, label: t.landing.statEras, suffix: '' },
            { value: 8, label: t.landing.statRaces, suffix: '' },
            { value: 331, label: t.landing.statHexes, suffix: '' },
            { value: 57, label: t.landing.statCards, suffix: '+' },
            { value: 6, label: t.landing.statPlayers, suffix: '' },
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

      {/* ═══ ERAS TIMELINE ═══ */}
      <section id="landing-eras" ref={erasSection.ref} className="relative py-16 px-6">
        <HexGridBg className="opacity-[0.02]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-10 transition-all duration-700 ${erasSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/70 text-[11px] font-bold tracking-[0.25em] uppercase mb-3">
              <span className="h-px w-6 bg-game-gold/40" />
              {t.landing.erasEyebrow}
              <span className="h-px w-6 bg-game-gold/40" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold via-game-ember to-game-accent uppercase tracking-wide">
              {t.landing.erasTitle}
            </h2>
            <p className="text-text-muted text-sm mt-3 max-w-lg mx-auto">{t.landing.erasDesc}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { num: 'I',   key: 'era1', icon: '⬡', color: '#4f8763', accent: '#10b981' },
              { num: 'II',  key: 'era2', icon: '♚', color: '#d4b95a', accent: '#f5c518' },
              { num: 'III', key: 'era3', icon: '⚔', color: '#e94560', accent: '#ef4444' },
            ] as const).map((era, i) => (
              <div
                key={era.key}
                className={`group relative bg-game-surface/50 backdrop-blur-sm border rounded-2xl p-6 overflow-hidden transition-all duration-500 hover:-translate-y-1 ${
                  erasSection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{
                  animationDelay: `${i * 120}ms`,
                  borderColor: `${era.accent}25`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at top, ${era.accent}18, transparent 65%)` }}
                />
                <div className="absolute -top-3 -right-3 text-7xl font-black font-display opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"
                  style={{ color: era.accent }}>
                  {era.num}
                </div>

                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-xl font-black font-display"
                      style={{ backgroundColor: `${era.accent}15`, color: era.accent }}
                    >
                      {era.icon}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: era.accent }}>
                        {t.landing.eraLabel} {era.num}
                      </div>
                      <h3 className="text-text-primary font-black text-base font-display leading-tight">
                        {t.landing[`${era.key}Title` as keyof typeof t.landing]}
                      </h3>
                    </div>
                  </div>

                  <p className="text-text-muted text-xs leading-relaxed mb-4">
                    {t.landing[`${era.key}Desc` as keyof typeof t.landing]}
                  </p>

                  <div className="space-y-1.5">
                    {(t.landing[`${era.key}Bullets` as keyof typeof t.landing] as unknown as string[]).map((bullet, j) => (
                      <div key={j} className="flex items-start gap-2 text-[11px] text-text-secondary">
                        <span className="mt-0.5 shrink-0" style={{ color: era.accent }}>◆</span>
                        <span className="leading-snug">{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HEX MAP PREVIEW ═══ */}
      <section id="landing-map" ref={mapSection.ref} className="relative py-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(233,69,96,0.06), transparent 60%)' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-center">
            <div className={`md:col-span-2 transition-all duration-700 ${mapSection.visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
              <div className="inline-flex items-center gap-2 text-game-accent/80 text-[11px] font-bold tracking-[0.25em] uppercase mb-3">
                <span className="h-px w-6 bg-game-accent/40" />
                {t.landing.mapEyebrow}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black font-display text-text-primary uppercase tracking-tight leading-[0.95]">
                {t.landing.mapTitle}
              </h2>
              <p className="text-text-muted text-sm mt-4 leading-relaxed">{t.landing.mapDesc}</p>

              <ul className="mt-5 space-y-2">
                {(t.landing.mapBullets as unknown as string[]).map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                    <span className="mt-0.5 text-game-gold shrink-0">⬡</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`md:col-span-3 transition-all duration-1000 ${mapSection.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
              <div className="relative aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 rounded-full blur-3xl opacity-40"
                  style={{ background: 'radial-gradient(circle, rgba(245,197,24,0.25), transparent 60%)' }} />
                <MiniHexMap />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ UNIT TYPES ═══ */}
      <section id="landing-units" ref={unitsSection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-8 transition-all duration-700 ${unitsSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/70 text-[11px] font-bold tracking-[0.25em] uppercase mb-3">
              {t.landing.unitsEyebrow}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-display text-text-primary uppercase tracking-wide">
              {t.landing.unitsTitle}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">{t.landing.unitsDesc}</p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 transition-all duration-700 ${unitsSection.visible ? 'opacity-100' : 'opacity-0'}`}>
            {([
              { key: 'infantry', icon: '🛡️', color: '#60a5fa', hp: 3, atk: 2, def: 2 },
              { key: 'ranged',   icon: '🏹', color: '#a78bfa', hp: 2, atk: 3, def: 1 },
              { key: 'mounted',  icon: '🐎', color: '#34d399', hp: 3, atk: 3, def: 1 },
              { key: 'siege',    icon: '🏰', color: '#fb923c', hp: 2, atk: 4, def: 1 },
              { key: 'flying',   icon: '🦅', color: '#f472b6', hp: 2, atk: 2, def: 2 },
            ] as const).map((u, i) => (
              <div
                key={u.key}
                className={`group relative bg-game-surface/40 border border-border-subtle rounded-xl p-4 text-center overflow-hidden hover:-translate-y-1 transition-all duration-300 ${
                  unitsSection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{ animationDelay: `${i * 80}ms`, borderColor: `${u.color}20` }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 30%, ${u.color}15, transparent 70%)` }} />
                <div className="relative">
                  <div className="text-3xl mb-2">{u.icon}</div>
                  <div className="font-black text-xs font-display mb-2" style={{ color: u.color }}>
                    {t.landing[`unit_${u.key}` as keyof typeof t.landing]}
                  </div>
                  <div className="flex justify-center gap-2 text-[10px] font-bold">
                    <span className="text-rose-400">♥{u.hp}</span>
                    <span className="text-amber-400">⚔{u.atk}</span>
                    <span className="text-sky-400">🛡{u.def}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BOSS TEASER ═══ */}
      <section id="landing-boss" ref={bossSection.ref} className="relative py-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-accent/30 to-transparent" />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.12), transparent 50%)' }} />
        <HexGridBg className="opacity-[0.02]" />

        <div className={`max-w-3xl mx-auto text-center relative z-10 transition-all duration-1000 ${bossSection.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          {/* Skull with pulsing aura */}
          <div className="relative w-28 h-28 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.5), transparent 60%)' }} />
            <div className="absolute inset-0 rounded-full animate-pulse"
              style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.3), transparent 70%)' }} />
            <div className="relative w-full h-full flex items-center justify-center text-6xl"
              style={{ filter: 'drop-shadow(0 0 24px rgba(239,68,68,0.6))' }}>
              💀
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-game-accent text-[11px] font-bold tracking-[0.3em] uppercase mb-3">
            <span className="h-px w-6 bg-game-accent/50" />
            {t.landing.bossEyebrow}
            <span className="h-px w-6 bg-game-accent/50" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-accent to-game-ember uppercase tracking-tight leading-[0.9]"
            style={{ textShadow: '0 0 40px rgba(239,68,68,0.3)' }}>
            {t.landing.bossTitle}
          </h2>

          <p className="text-text-secondary text-base mt-5 max-w-xl mx-auto leading-relaxed">
            {t.landing.bossDesc}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 max-w-lg mx-auto">
            {([
              { key: 'bossStat1', value: '6', label: t.landing.bossStat1 },
              { key: 'bossStat2', value: '∞', label: t.landing.bossStat2 },
              { key: 'bossStat3', value: '1', label: t.landing.bossStat3 },
            ]).map(s => (
              <div key={s.key} className="bg-game-surface/40 border border-game-accent/20 rounded-lg px-3 py-3">
                <div className="text-2xl font-black font-display text-game-accent">{s.value}</div>
                <div className="text-text-muted text-[10px] uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="landing-features" ref={featuresSection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-4xl mx-auto">
          <div className={`text-center mb-8 transition-all duration-700 ${featuresSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <h2 className="text-xl sm:text-2xl font-black font-display text-text-primary uppercase tracking-wide">
              {t.landing.sectionFeatures}
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

      {/* ═══ RACES SHOWCASE — all 8 ═══ */}
      <section id="landing-races" ref={racesSection.ref} className="relative py-14 px-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <HexGridBg className="opacity-[0.015]" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-8 transition-all duration-700 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <h2 className="text-xl sm:text-2xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold to-game-ember uppercase tracking-wide">
              {t.landing.sectionRaces}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">{t.landing.sectionRacesDesc}</p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 transition-all duration-700 delay-100 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {([
              { id: 'elf',     emoji: '🏡', color: '#4aad6a', terrain: '🌲', tech: 'Science'   },
              { id: 'dwarf',   emoji: '⛏️', color: '#8a9bae', terrain: '⛰️', tech: 'Resources' },
              { id: 'human',   emoji: '🏰', color: '#d4b95a', terrain: '🌾', tech: 'Economy'   },
              { id: 'halfelf', emoji: '🌿', color: '#7fb8a4', terrain: '🌾', tech: 'Science'   },
              { id: 'orc',     emoji: '⚔️', color: '#E74C3C', terrain: '🌿', tech: 'War'       },
              { id: 'giant',   emoji: '🗻', color: '#b78d5a', terrain: '⛰️', tech: 'War'       },
              { id: 'goblin',  emoji: '🗡️', color: '#94d82d', terrain: '🌲', tech: 'Economy'   },
              { id: 'halforc', emoji: '🪓', color: '#d97757', terrain: '🌿', tech: 'Resources' },
            ] as const).map((race, i) => (
              <div
                key={race.id}
                className={`group relative bg-game-surface/40 border rounded-xl p-3.5 hover:-translate-y-1 transition-all duration-300 overflow-hidden ${
                  racesSection.visible ? 'animate-fade-in-up' : 'opacity-0'
                }`}
                style={{ animationDelay: `${i * 60}ms`, borderColor: `${race.color}20` }}
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle at 50% 20%, ${race.color}15, transparent 70%)` }} />
                <div className="absolute top-2 right-2 text-xs opacity-30 group-hover:opacity-60 transition-opacity">{race.terrain}</div>
                <div className="relative">
                  <div className="text-2xl mb-1.5">{race.emoji}</div>
                  <div className="font-black text-[13px] mb-0.5 font-display leading-tight" style={{ color: race.color }}>
                    {t.races[race.id as keyof typeof t.races]}
                  </div>
                  <div className="text-text-faint text-[9px] uppercase tracking-wider mb-1.5">
                    {t.landing.raceFreeTech}: {t.landing[`tech_${race.tech.toLowerCase()}` as keyof typeof t.landing]}
                  </div>
                  <p className="text-text-muted text-[10px] leading-relaxed line-clamp-3">
                    {t.raceDescriptions[race.id as keyof typeof t.raceDescriptions]}
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

      <div className="h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
    </div>
  );
}
