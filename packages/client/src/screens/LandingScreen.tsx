import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

function AnimatedNumber({ value, duration = 1400 }: { value: number; duration?: number }) {
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
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(Math.round(value * eased));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value, duration]);
  return <span ref={ref} className="tabular-nums">{display}</span>;
}

// --- Hex math helpers ---
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number, size: number) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}
function hexPoints(cx: number, cy: number, size: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const ang = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + size * Math.cos(ang)).toFixed(2)},${(cy + size * Math.sin(ang)).toFixed(2)}`;
  }).join(' ');
}
function hexDist(q: number, r: number) {
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
}

const TERRAIN_PALETTE: Record<string, { fill: string; stroke: string; shadow?: string; label?: string }> = {
  plain:    { fill: '#3a6b4a', stroke: '#274d34', shadow: '#1d3824' },
  forest:   { fill: '#1e5230', stroke: '#102a1c', shadow: '#0c1e15', label: '🌲' },
  mountain: { fill: '#5c5e68', stroke: '#3a3c44', shadow: '#28292e', label: '⛰' },
  swamp:    { fill: '#4b3060', stroke: '#2d1c3d', shadow: '#1a0f24' },
  road:     { fill: '#7a6040', stroke: '#5a4528', shadow: '#3a2d18' },
  ruins:    { fill: '#8c4530', stroke: '#6b3120', shadow: '#4a2015', label: '🏚' },
  river:    { fill: '#2a6aaa', stroke: '#1a4a80', shadow: '#0f2e50' },
  citadel:  { fill: '#1a1425', stroke: '#f5c518', shadow: '#0a0a15', label: '💀' },
  capital:  { fill: '#2d2010', stroke: '#f5c518', shadow: '#1a1208' },
};

// Deterministic noise for natural-looking map
function noise(q: number, r: number, s: number = 0) {
  const h = (q * 2654435761 + r * 1234567891 + s * 987654321) >>> 0;
  return (h & 0xffff) / 0xffff;
}

function patternTerrain(q: number, r: number): string {
  if (q === 0 && r === 0) return 'citadel';
  const dist = hexDist(q, r);
  const n = noise(q, r);

  // River channel going SW from citadel
  if ((q === -1 && r === 1) || (q === -2 && r === 1) || (q === -2 && r === 2)) return 'river';
  // Road ring
  if (dist === 3 && (q + r) % 2 === 0) return 'road';
  // Ruins at middle dist
  if (dist === 2 && n > 0.78) return 'ruins';
  // Mountains cluster NE
  if (q > 0 && r < 0 && n > 0.45) return 'mountain';
  // Forest cluster SW
  if (q < 0 && r > 0 && n > 0.40) return 'forest';
  // Swamp cluster SE
  if (q > 0 && r > 0 && n > 0.50) return 'swamp';
  // Inner ring mostly plain
  if (dist <= 1) return 'plain';
  // Mix
  const t = Math.floor(n * 4);
  return ['plain', 'plain', 'forest', 'mountain'][t];
}

type MiniHexData = { q: number; r: number; terrain: string; elevation: number };

function buildMiniMap(radius: number): MiniHexData[] {
  const hexes: MiniHexData[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const terrain = patternTerrain(q, r);
      const elev = terrain === 'mountain' ? 0.85 + noise(q, r, 1) * 0.15
        : terrain === 'forest' ? 0.65 + noise(q, r, 2) * 0.2
        : terrain === 'plain' ? 0.5 + noise(q, r, 3) * 0.2
        : terrain === 'swamp' ? 0.3 + noise(q, r, 4) * 0.15
        : 0.4;
      hexes.push({ q, r, terrain, elevation: elev });
    }
  }
  return hexes;
}

function RealHexMap() {
  const RADIUS = 5;
  const SIZE = 18;
  const hexes = useMemo(() => buildMiniMap(RADIUS), []);

  const capitals: [number, number, string, string][] = [
    [-4, 4, '#10b981', '♚'],
    [4, -4, '#3b82f6', '♚'],
    [-4, 0, '#a855f7', '♚'],
    [4, 0, '#ec4899', '♚'],
  ];
  const capitalSet = new Set(capitals.map(([q, r]) => `${q},${r}`));

  // Sort by elevation so mountains render on top
  const sorted = useMemo(() => [...hexes].sort((a, b) => a.elevation - b.elevation), [hexes]);

  const VB = SIZE * SQRT3 * (RADIUS + 1.2);
  const VH = SIZE * (RADIUS + 2) * 1.65;

  return (
    <svg
      viewBox={`${-VB} ${-VH * 0.55} ${VB * 2} ${VH}`}
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.7))' }}
    >
      <defs>
        {/* Vignette */}
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="transparent" />
          <stop offset="100%" stopColor="#0a0a1a" stopOpacity="0.85" />
        </radialGradient>
        {/* Terrain patterns */}
        <pattern id="forest-hatch" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#2a7a40" opacity="0.6" />
          <circle cx="3" cy="3" r="0.6" fill="#1e5230" opacity="0.5" />
        </pattern>
        <pattern id="mountain-hatch" width="5" height="4" patternUnits="userSpaceOnUse">
          <polyline points="0,4 2.5,0 5,4" fill="none" stroke="#7a7c88" strokeWidth="0.7" opacity="0.5" />
        </pattern>
        <filter id="hex-shadow" x="-15%" y="-15%" width="130%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.5" />
        </filter>
        <filter id="glow-gold">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-boss">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Terrain hexes with pseudo-3D via offset shadow */}
      {sorted.map(({ q, r, terrain, elevation }) => {
        const { x, y } = hexToPixel(q, r, SIZE);
        const key = `${q},${r}`;
        const isCapital = capitalSet.has(key);
        const cap = isCapital ? capitals.find(([cq, cr]) => cq === q && cr === r)! : null;
        const pal = TERRAIN_PALETTE[isCapital ? 'capital' : terrain];
        const isCitadel = terrain === 'citadel';
        const shadowShift = Math.round(elevation * 3);

        return (
          <g key={key} filter={isCitadel || isCapital ? 'url(#hex-shadow)' : undefined}>
            {/* Elevation shadow (offset clone) */}
            {shadowShift > 0 && (
              <polygon
                points={hexPoints(x, y + shadowShift, SIZE - 0.5)}
                fill={pal.shadow ?? '#111'}
                opacity={0.55}
              />
            )}
            {/* Main hex */}
            <polygon
              points={hexPoints(x, y, SIZE - 0.5)}
              fill={pal.fill}
              stroke={isCapital ? cap![2] : isCitadel ? '#f5c518' : pal.stroke}
              strokeWidth={isCapital || isCitadel ? 1.8 : 0.7}
            />
            {/* Texture overlay */}
            {terrain === 'forest' && (
              <polygon points={hexPoints(x, y, SIZE - 0.5)} fill="url(#forest-hatch)" opacity={0.7} />
            )}
            {terrain === 'mountain' && (
              <polygon points={hexPoints(x, y, SIZE - 0.5)} fill="url(#mountain-hatch)" opacity={0.8} />
            )}
            {/* Highlight top edge (light source from top-left) */}
            {terrain !== 'river' && (
              <polygon
                points={hexPoints(x, y, SIZE - 1)}
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1.5}
              />
            )}
            {/* Terrain icons */}
            {isCitadel && (
              <>
                <circle cx={x} cy={y} r={SIZE * 0.55} fill="rgba(245,197,24,0.08)" stroke="#f5c518" strokeWidth={1} filter="url(#glow-boss)" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize="13" filter="url(#glow-boss)">💀</text>
              </>
            )}
            {isCapital && (
              <>
                <circle cx={x} cy={y} r={SIZE * 0.38} fill={cap![2]} stroke="#0a0a1a" strokeWidth={1.5} opacity={0.9} />
                <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="#fef3c7" fontWeight="bold">{cap![3]}</text>
              </>
            )}
            {terrain === 'ruins' && !isCapital && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize="9" opacity={0.7}>🏚</text>
            )}
            {terrain === 'road' && (
              <line
                x1={hexToPixel(q, r, SIZE * 0.5).x + x} y1={hexToPixel(q, r, SIZE * 0.5).y + y}
                x2={x - hexToPixel(q, r, SIZE * 0.5).x} y2={y - hexToPixel(q, r, SIZE * 0.5).y}
                stroke="#c8a060" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"
              />
            )}
          </g>
        );
      })}

      {/* Water river lines */}
      {sorted.filter(h => h.terrain === 'river').map(({ q, r }) => {
        const { x, y } = hexToPixel(q, r, SIZE);
        return (
          <g key={`riv-${q},${r}`}>
            <ellipse cx={x} cy={y} rx={SIZE * 0.45} ry={SIZE * 0.28} fill="#2a6aaa" opacity={0.6} />
            <ellipse cx={x} cy={y - 1} rx={SIZE * 0.35} ry={SIZE * 0.18} fill="#4a90d0" opacity={0.25} />
          </g>
        );
      })}

      {/* Map title label */}
      <text x={0} y={-VH * 0.48} textAnchor="middle" fontSize="9" fill="#f5c518" opacity={0.5} fontFamily="serif" letterSpacing="4">
        WORLD MAP
      </text>

      {/* Vignette overlay */}
      <rect x={-VB} y={-VH * 0.55} width={VB * 2} height={VH} fill="url(#map-vignette)" />

      {/* Compass rose */}
      <g transform={`translate(${VB * 0.72}, ${-VH * 0.42})`} opacity={0.5}>
        <circle r={8} fill="none" stroke="#f5c518" strokeWidth={0.5} />
        <polygon points="0,-8 2,0 0,3 -2,0" fill="#f5c518" opacity={0.8} />
        <polygon points="0,8 2,0 0,-3 -2,0" fill="#888" opacity={0.5} />
        <text x={0} y={-10} textAnchor="middle" fontSize="5" fill="#f5c518" fontWeight="bold">N</text>
      </g>
    </svg>
  );
}

function FireEmbers() {
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: `${5 + (i * 37) % 90}%`,
    delay: `${(i * 0.35) % 4}s`,
    dur: `${2.2 + (i * 0.28) % 2.5}s`,
    size: 2 + (i % 4),
    color: i % 4 === 0 ? '#ff6b35' : i % 4 === 1 ? '#f5c518' : i % 4 === 2 ? '#ff4466' : '#ff9944',
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[360px]"
        style={{ background: 'radial-gradient(ellipse at center bottom, rgba(255,107,53,0.14) 0%, rgba(233,69,96,0.07) 40%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[200px] animate-magic-pulse"
        style={{ background: 'radial-gradient(ellipse at center bottom, rgba(245,197,24,0.10) 0%, transparent 60%)' }} />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[180px] animate-magic-pulse"
        style={{ background: 'radial-gradient(ellipse at center bottom, rgba(139,92,246,0.08) 0%, transparent 60%)', animationDelay: '1.4s' }} />
      {embers.map((e, i) => (
        <div key={i} className="absolute bottom-0 animate-ember-rise rounded-full"
          style={{ left: e.left, width: `${e.size}px`, height: `${e.size}px`, backgroundColor: e.color,
            animationDelay: e.delay, animationDuration: e.dur, boxShadow: `0 0 ${e.size * 2}px ${e.color}` }} />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <div key={`g${i}`} className="absolute w-1 h-1 rounded-full"
          style={{ left: `${8 + (i * 53) % 84}%`, top: `${10 + (i * 37) % 70}%`,
            backgroundColor: 'rgba(245,197,24,0.3)',
            animation: `float-${(i % 3) + 1} ${5 + (i % 4) * 1.5}s ease-in-out infinite`,
            animationDelay: `${(i * 0.6) % 5}s` }} />
      ))}
    </div>
  );
}

function HexGridBg({ opacity = 0.022 }: { opacity?: number }) {
  const size = 28;
  const w = SQRT3 * size;
  const h = size * 2;
  return (
    <svg className="absolute inset-0 w-full h-full" style={{ opacity }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="hex-bg-pat" width={w} height={h * 0.75} patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
          <polygon points={`${w/2},0 ${w},${h/4} ${w},${h*3/4} ${w/2},${h} 0,${h*3/4} 0,${h/4}`}
            fill="none" stroke="#f5c518" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-bg-pat)" />
    </svg>
  );
}

function ParallaxLayer({ children, speed, className = '' }: { children: React.ReactNode; speed: number; className?: string }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const handler = () => setOffset(window.scrollY * speed);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [speed]);
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ transform: `translateY(${offset}px)`, willChange: 'transform' }}>
      {children}
    </div>
  );
}

function TechNode({ label, icon, level, color, delay }: { label: string; icon: string; level: number; color: string; delay: number }) {
  const bars = Array.from({ length: 5 }, (_, i) => i < level);
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ animationDelay: `${delay}ms` }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl relative"
        style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
        <div className="absolute inset-0 rounded-2xl blur-md animate-magic-pulse"
          style={{ background: `${color}20` }} />
        <span className="relative">{icon}</span>
      </div>
      <div className="flex gap-0.5">
        {bars.map((filled, i) => (
          <div key={i} className="w-2 h-1.5 rounded-full transition-all duration-300"
            style={{ backgroundColor: filled ? color : `${color}22`, boxShadow: filled ? `0 0 4px ${color}` : 'none' }} />
        ))}
      </div>
      <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color }}>{label}</span>
    </div>
  );
}

export function LandingScreen({ onSkip, onLogin, onRegister }: Props) {
  const t = useI18n(s => s.t);

  const heroSection    = useInView(0.05);
  const statsSection   = useInView(0.3);
  const erasSection    = useInView(0.1);
  const mapSection     = useInView(0.08);
  const howToSection   = useInView(0.08);
  const techSection    = useInView(0.1);
  const bossSection    = useInView(0.15);
  const racesSection   = useInView(0.08);
  const ctaSection     = useInView(0.15);

  const [scrollY, setScrollY] = useState(0);
  const handleScroll = useCallback(() => setScrollY(window.scrollY), []);
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const heroParallax = scrollY * 0.3;

  return (
    <div id="landing-screen" className="min-h-screen bg-game-bg relative overflow-x-hidden">

      {/* ═══ HERO ═══ */}
      <section id="landing-hero" ref={heroSection.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">

        {/* Deep space bg layers */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(30,15,60,0.8) 0%, #0a0a1a 65%)' }} />
        <HexGridBg opacity={0.018} />

        {/* Stars layer — parallax slow */}
        <ParallaxLayer speed={-0.04}>
          {Array.from({ length: 55 }, (_, i) => (
            <div key={i} className="absolute rounded-full"
              style={{
                left: `${(i * 71 + 13) % 98}%`, top: `${(i * 53 + 7) % 95}%`,
                width: `${1 + (i % 3)}px`, height: `${1 + (i % 3)}px`,
                backgroundColor: i % 5 === 0 ? '#f5c518' : 'white',
                opacity: 0.15 + (i % 5) * 0.06,
                animation: `float-${(i % 3) + 1} ${8 + i % 6}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }} />
          ))}
        </ParallaxLayer>

        <FireEmbers />

        {/* Floating magic orbs — parallax medium */}
        <ParallaxLayer speed={0.15}>
          <div className="absolute top-1/4 left-[15%] w-64 h-64 rounded-full blur-3xl opacity-30 animate-magic-pulse"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.5), transparent 70%)' }} />
          <div className="absolute top-1/3 right-[12%] w-48 h-48 rounded-full blur-3xl opacity-25 animate-magic-pulse"
            style={{ background: 'radial-gradient(circle, rgba(233,69,96,0.5), transparent 70%)', animationDelay: '1.2s' }} />
        </ParallaxLayer>

        {/* Gold aura — parallax fast */}
        <div className="absolute top-[38%] left-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(245,197,24,0.4), transparent 60%)',
            transform: `translate(-50%, calc(-50% + ${heroParallax}px))`,
            transition: 'transform 0.05s linear',
          }} />

        <div className={`relative z-10 text-center max-w-3xl mx-auto transition-all duration-1000 ease-out ${heroSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}>
          <div className="inline-flex items-center gap-2.5 bg-black/30 backdrop-blur-md border border-game-gold/20 rounded-full px-5 py-2 mb-8 shadow-gold-sm">
            <span className="animate-fire-flicker text-base">⚔</span>
            <span className="text-game-gold text-xs font-bold tracking-[0.25em] uppercase">{t.landing.heroBadge}</span>
            <span className="animate-fire-flicker text-base" style={{ animationDelay: '0.4s' }}>⚔</span>
          </div>

          <h1 className="text-6xl sm:text-8xl md:text-9xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-[#e8a800] to-[#b07c00] tracking-tight uppercase leading-[0.85] animate-rune-glow mb-4">
            {t.landing.heroTitle}
          </h1>

          {/* Decorative line */}
          <div className="flex items-center gap-4 justify-center my-6">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-game-gold/50" />
            <div className="w-2 h-2 rotate-45 bg-game-gold/60" />
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-game-gold/50" />
          </div>

          <p className="text-text-secondary text-xl sm:text-2xl font-light italic max-w-xl mx-auto leading-relaxed mb-3">
            {t.landing.heroSubtitle}
          </p>
          <p className="text-text-muted text-sm max-w-lg mx-auto leading-relaxed">
            {t.landing.heroDescription}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onLogin && (
              <button id="hero-login-btn" type="button" onClick={onLogin}
                className="relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold px-12 py-4 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-1 hover:shadow-lg transition-all duration-200 shadow-accent group">
                <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                <span className="relative flex items-center gap-2">
                  {t.auth.login}
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            )}
            {onRegister && (
              <button id="hero-register-btn" type="button" onClick={onRegister}
                className="bg-white/5 backdrop-blur-sm border border-white/15 text-text-primary font-bold px-10 py-4 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-1 hover:border-game-gold/40 hover:bg-white/8 transition-all duration-200">
                {t.auth.register}
              </button>
            )}
            <button type="button" onClick={onSkip}
              className="text-text-faint hover:text-text-muted text-xs transition-colors underline underline-offset-4 decoration-text-faint/30 mt-1">
              {t.auth.playAsGuest}
            </button>
          </div>

          {/* Scroll cue */}
          <div className="mt-16 flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: '1.5s' }}>
            <span className="text-text-faint text-[10px] uppercase tracking-[0.2em]">Scroll</span>
            <div className="w-5 h-8 border border-text-faint/25 rounded-full flex items-start justify-center p-1">
              <div className="w-1 h-2 bg-game-gold/50 rounded-full animate-float-1" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ═══ */}
      <section id="landing-stats" ref={statsSection.ref}
        className="relative py-5 px-6 border-y border-white/5 bg-black/30 backdrop-blur-sm">
        <div className={`max-w-4xl mx-auto grid grid-cols-3 sm:grid-cols-5 gap-3 text-center transition-all duration-700 ${statsSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {[
            { value: 3,   label: t.landing.statEras,    icon: '⚔', suffix: '' },
            { value: 8,   label: t.landing.statRaces,   icon: '👑', suffix: '' },
            { value: 469, label: t.landing.statHexes,   icon: '⬡', suffix: '' },
            { value: 57,  label: t.landing.statCards,   icon: '🃏', suffix: '+' },
            { value: 6,   label: t.landing.statPlayers, icon: '⚡', suffix: '' },
          ].map((stat, i) => (
            <div key={i} className="py-1">
              <div className="text-xl sm:text-2xl mb-0.5">{stat.icon}</div>
              <div className="text-2xl sm:text-3xl font-black font-display text-game-gold">
                <AnimatedNumber value={stat.value} />{stat.suffix}
              </div>
              <div className="text-text-muted text-[9px] uppercase tracking-wider font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ ERAS TIMELINE ═══ */}
      <section id="landing-eras" ref={erasSection.ref} className="relative py-16 px-6 overflow-hidden">
        <HexGridBg opacity={0.015} />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-10 transition-all duration-700 ${erasSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/60 text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
              <span className="h-px w-8 bg-game-gold/30" />{t.landing.erasEyebrow}<span className="h-px w-8 bg-game-gold/30" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold via-game-ember to-game-accent uppercase tracking-wide">
              {t.landing.erasTitle}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-lg mx-auto">{t.landing.erasDesc}</p>
          </div>

          {/* Timeline connector */}
          <div className="hidden md:block absolute left-1/2 -translate-x-1/2 h-full top-32 w-px bg-gradient-to-b from-game-gold/20 via-game-ember/15 to-game-accent/10 pointer-events-none" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { num: 'I',   key: 'era1', icon: '⬡', accent: '#10b981' },
              { num: 'II',  key: 'era2', icon: '♚', accent: '#f5c518' },
              { num: 'III', key: 'era3', icon: '⚔', accent: '#ef4444' },
            ] as const).map((era, i) => (
              <div key={era.key}
                className={`group relative bg-black/25 backdrop-blur-sm border rounded-2xl p-5 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-lg ${erasSection.visible ? 'animate-fade-in-up' : 'opacity-0'}`}
                style={{ animationDelay: `${i * 150}ms`, borderColor: `${era.accent}22`,
                  boxShadow: `0 4px 24px ${era.accent}08` }}>
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at top, ${era.accent}15, transparent 60%)` }} />
                {/* Era number watermark */}
                <div className="absolute -top-1 -right-1 text-7xl font-black font-display opacity-[0.04] group-hover:opacity-[0.08] transition-opacity select-none"
                  style={{ color: era.accent }}>{era.num}</div>
                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-4 relative">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl text-xl font-black font-display transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${era.accent}18`, color: era.accent, border: `1px solid ${era.accent}30` }}>
                    {era.icon}
                  </div>
                  <div>
                    <div className="text-[9px] font-bold tracking-[0.22em] uppercase" style={{ color: era.accent }}>
                      {t.landing.eraLabel} {era.num}
                    </div>
                    <h3 className="text-text-primary font-black text-sm font-display leading-tight">
                      {t.landing[`${era.key}Title` as keyof typeof t.landing]}
                    </h3>
                  </div>
                </div>
                <p className="text-text-muted text-xs leading-relaxed mb-3">
                  {t.landing[`${era.key}Desc` as keyof typeof t.landing]}
                </p>
                <div className="space-y-1.5">
                  {(t.landing[`${era.key}Bullets` as keyof typeof t.landing] as unknown as string[]).map((bullet, j) => (
                    <div key={j} className="flex items-start gap-2 text-[10px] text-text-secondary">
                      <span className="mt-0.5 shrink-0 text-[8px]" style={{ color: era.accent }}>◆</span>
                      <span className="leading-snug">{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MAP SECTION ═══ */}
      <section id="landing-map" ref={mapSection.ref} className="relative py-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 30% 60%, rgba(245,197,24,0.05), transparent 60%)' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Map viz */}
            <div className={`transition-all duration-1000 ${mapSection.visible ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-90 -translate-x-8'}`}>
              <div className="relative aspect-square max-w-sm mx-auto lg:max-w-full">
                {/* Outer glow ring */}
                <div className="absolute -inset-4 rounded-full blur-3xl opacity-30 animate-magic-pulse"
                  style={{ background: 'radial-gradient(circle, rgba(245,197,24,0.3), transparent 65%)' }} />
                {/* Parchment frame */}
                <div className="relative rounded-2xl overflow-hidden border border-game-gold/15 shadow-2xl"
                  style={{ background: 'radial-gradient(ellipse at center, #0f0c1a 0%, #080810 100%)' }}>
                  <RealHexMap />
                  {/* Scanline overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-10"
                    style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.5) 3px, rgba(0,0,0,0.5) 4px)' }} />
                </div>
              </div>
            </div>

            {/* Text */}
            <div className={`transition-all duration-700 delay-300 ${mapSection.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
              <div className="inline-flex items-center gap-2 text-game-gold/70 text-[10px] font-bold tracking-[0.28em] uppercase mb-4">
                <span className="h-px w-6 bg-game-gold/40" />{t.landing.mapEyebrow}
              </div>
              <h2 className="text-2xl sm:text-4xl font-black font-display text-text-primary uppercase tracking-tight leading-[0.92] mb-4">
                {t.landing.mapTitle}
              </h2>
              <p className="text-text-muted text-sm mb-5 leading-relaxed">{t.landing.mapDesc}</p>

              {/* Feature pills */}
              <ul className="space-y-2 mb-8">
                {(t.landing.mapBullets as unknown as string[]).map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-text-secondary group">
                    <span className="mt-0.5 text-game-gold shrink-0 transition-transform group-hover:scale-125">⬡</span>
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>

              {/* Boss teaser */}
              <div ref={bossSection.ref}
                className={`rounded-xl border border-game-accent/25 bg-gradient-to-br from-game-accent/8 to-transparent p-5 transition-all duration-700 ${bossSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="flex items-start gap-4">
                  <div className="relative w-14 h-14 shrink-0">
                    <div className="absolute inset-0 rounded-full blur-xl animate-pulse"
                      style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.7), transparent 70%)' }} />
                    <div className="relative w-full h-full flex items-center justify-center text-3xl animate-fire-flicker">💀</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-game-accent mb-0.5">{t.landing.bossEyebrow}</div>
                    <h3 className="text-text-primary font-black text-base font-display">{t.landing.bossTitle}</h3>
                    <p className="text-text-muted text-xs mt-1 leading-relaxed">{t.landing.bossDesc}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { value: '6', label: t.landing.bossStat1 },
                    { value: '∞', label: t.landing.bossStat2 },
                    { value: '1', label: t.landing.bossStat3 },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-black/30 rounded-lg py-2.5">
                      <div className="text-2xl font-black font-display text-game-accent">{s.value}</div>
                      <div className="text-text-muted text-[9px] uppercase tracking-wider">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW TO PLAY ═══ */}
      <section id="landing-howto" ref={howToSection.ref} className="relative py-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <HexGridBg opacity={0.012} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 70% 50%, rgba(16,185,129,0.04), transparent 60%)' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-10 transition-all duration-700 ${howToSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/60 text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
              <span className="h-px w-8 bg-game-gold/30" />{t.landing.howtoEyebrow ?? 'How to Play'}<span className="h-px w-8 bg-game-gold/30" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold to-game-ember uppercase tracking-wide">
              {t.landing.howtoTitle ?? 'The Path to Victory'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { step: '01', icon: '⬡', color: '#10b981', title: t.landing.howto1Title ?? 'Shape the World', desc: t.landing.howto1Desc ?? 'Place terrain tiles, build roads, and claim your kingdom before time runs out.' },
              { step: '02', icon: '⚙', color: '#f5c518', title: t.landing.howto2Title ?? 'Forge Your Kingdom', desc: t.landing.howto2Desc ?? 'Invest your score into tech trees — War, Science, Resources, Economy — to power your army.' },
              { step: '03', icon: '⚔', color: '#ef4444', title: t.landing.howto3Title ?? 'March to War', desc: t.landing.howto3Desc ?? 'Command stacks across a 469-hex battlefield. Attack Dhakhan\'s forces and push toward the Citadel.' },
              { step: '04', icon: '💀', color: '#a855f7', title: t.landing.howto4Title ?? 'Slay the Boss', desc: t.landing.howto4Desc ?? 'Reach the Citadel, trigger the Heroic Turn, and destroy the boss before all capitals fall.' },
            ].map((item, i) => (
              <div key={i}
                className={`group relative bg-black/20 backdrop-blur-sm border rounded-2xl p-5 overflow-hidden transition-all duration-500 hover:-translate-y-1 ${howToSection.visible ? 'animate-fade-in-up' : 'opacity-0'}`}
                style={{ animationDelay: `${i * 100}ms`, borderColor: `${item.color}18` }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at top, ${item.color}12, transparent 65%)` }} />
                <div className="relative">
                  {/* Step number */}
                  <div className="text-[9px] font-black tracking-widest mb-3 font-display" style={{ color: `${item.color}60` }}>{item.step}</div>
                  {/* Icon */}
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl text-2xl mb-4 transition-transform group-hover:scale-110"
                    style={{ background: `${item.color}15`, border: `1px solid ${item.color}30` }}>
                    {item.icon}
                  </div>
                  <h3 className="font-black text-sm font-display text-text-primary mb-2 leading-tight">{item.title}</h3>
                  <p className="text-text-muted text-[11px] leading-relaxed">{item.desc}</p>
                </div>
                {/* Bottom accent */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `linear-gradient(90deg, transparent, ${item.color}50, transparent)` }} />
              </div>
            ))}
          </div>

          {/* Arrow connectors (desktop) */}
          <div className={`hidden lg:flex items-center justify-between mt-6 px-16 transition-all duration-700 delay-500 ${howToSection.visible ? 'opacity-100' : 'opacity-0'}`}>
            {[0,1,2].map(i => (
              <div key={i} className="flex-1 flex items-center gap-2 opacity-20">
                <div className="flex-1 h-px bg-gradient-to-r from-game-gold/0 to-game-gold" />
                <svg className="w-3 h-3 text-game-gold" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 7l5 5-5 5M6 12h12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TECH TREE TEASER ═══ */}
      <section id="landing-tech" ref={techSection.ref} className="relative py-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 50%, rgba(245,197,24,0.04), transparent 65%)' }} />

        <div className="max-w-4xl mx-auto relative z-10">
          <div className={`text-center mb-10 transition-all duration-700 ${techSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/60 text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
              <span className="h-px w-8 bg-game-gold/30" />{t.landing.techEyebrow ?? 'Tech Tree'}<span className="h-px w-8 bg-game-gold/30" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold to-game-ember uppercase tracking-wide">
              {t.landing.techTitle ?? 'Shape Your Strategy'}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">
              {t.landing.techDesc ?? 'Four tech trees, five levels each. Your Era I score becomes your building budget in Era II.'}
            </p>
          </div>

          <div className={`relative transition-all duration-700 delay-200 ${techSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {/* Grid background */}
            <div className="absolute inset-0 rounded-2xl border border-white/5 bg-black/20 backdrop-blur-sm" />
            <div className="relative p-8">
              {/* Connecting lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.15 }}>
                <line x1="12.5%" y1="45%" x2="37.5%" y2="45%" stroke="#f5c518" strokeWidth="1" strokeDasharray="4 3" />
                <line x1="37.5%" y1="45%" x2="62.5%" y2="45%" stroke="#f5c518" strokeWidth="1" strokeDasharray="4 3" />
                <line x1="62.5%" y1="45%" x2="87.5%" y2="45%" stroke="#f5c518" strokeWidth="1" strokeDasharray="4 3" />
              </svg>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 relative">
                {[
                  { label: t.landing.techWar    ?? 'War',       icon: '⚔', level: 4, color: '#ef4444', delay: 0   },
                  { label: t.landing.techSci    ?? 'Science',   icon: '🔬', level: 3, color: '#3b82f6', delay: 100 },
                  { label: t.landing.techRes    ?? 'Resources', icon: '⛏', level: 5, color: '#10b981', delay: 200 },
                  { label: t.landing.techEco    ?? 'Economy',   icon: '💰', level: 2, color: '#f5c518', delay: 300 },
                ].map((tech, i) => (
                  <div key={i} className={`flex justify-center ${techSection.visible ? 'animate-fade-in-up' : 'opacity-0'}`}
                    style={{ animationDelay: `${tech.delay + 300}ms` }}>
                    <TechNode {...tech} />
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="mt-8 pt-6 border-t border-white/5 text-center text-text-faint text-[10px] tracking-wider">
                {t.landing.techNote ?? 'Upgrade levels 0–5 • Each race gets one free tech level • Higher war tech = more recruits per turn'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ RACES ═══ */}
      <section id="landing-races" ref={racesSection.ref} className="relative py-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <HexGridBg opacity={0.01} />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-8 transition-all duration-700 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 text-game-gold/60 text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
              <span className="h-px w-8 bg-game-gold/30" />{t.landing.sectionRaces}<span className="h-px w-8 bg-game-gold/30" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-game-gold to-game-ember uppercase tracking-wide">
              {t.landing.sectionRaces}
            </h2>
            <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">{t.landing.sectionRacesDesc}</p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 transition-all duration-700 delay-100 ${racesSection.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {([
              { id: 'elf',     emoji: '🌲', color: '#4aad6a', tech: 'science'   },
              { id: 'dwarf',   emoji: '⛰️', color: '#8a9bae', tech: 'resources' },
              { id: 'human',   emoji: '🌾', color: '#d4b95a', tech: 'economy'   },
              { id: 'halfelf', emoji: '🌙', color: '#7fb8a4', tech: 'science'   },
              { id: 'orc',     emoji: '🔥', color: '#E74C3C', tech: 'war'       },
              { id: 'giant',   emoji: '🗻', color: '#b78d5a', tech: 'war'       },
              { id: 'goblin',  emoji: '🗡️', color: '#94d82d', tech: 'economy'   },
              { id: 'halforc', emoji: '💀', color: '#d97757', tech: 'resources' },
            ] as const).map((race, i) => (
              <div key={race.id}
                className={`group relative bg-black/20 backdrop-blur-sm border rounded-xl p-3.5 hover:-translate-y-1 transition-all duration-300 overflow-hidden ${racesSection.visible ? 'animate-fade-in-up' : 'opacity-0'}`}
                style={{ animationDelay: `${i * 55}ms`, borderColor: `${race.color}20` }}>
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${race.color}16, transparent 70%)` }} />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-2xl">{race.emoji}</span>
                    <div className="font-black text-[12px] font-display leading-tight" style={{ color: race.color }}>
                      {t.races[race.id as keyof typeof t.races]}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 bg-black/30 rounded px-1.5 py-0.5 mb-1.5">
                    <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: race.color }}>
                      {t.landing[`tech_${race.tech}` as keyof typeof t.landing]}
                    </span>
                  </div>
                  <p className="text-text-muted text-[10px] leading-relaxed line-clamp-2">
                    {t.raceDescriptions[race.id as keyof typeof t.raceDescriptions]}
                  </p>
                </div>
                {/* Bottom glow on hover */}
                <div className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(90deg, transparent, ${race.color}60, transparent)` }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section id="landing-cta" ref={ctaSection.ref} className="relative py-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <FireEmbers />
        </div>
        {/* Layered glow orbs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,197,24,0.5), rgba(233,69,96,0.3), transparent 70%)' }} />

        <div className={`relative z-10 text-center max-w-lg mx-auto transition-all duration-800 ${ctaSection.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="text-5xl mb-5 animate-rune-glow select-none">⚔</div>
          <h2 className="text-3xl sm:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-[#e8a800] to-[#b07c00] uppercase tracking-wide mb-3">
            {t.landing.sectionCta}
          </h2>
          <p className="text-text-muted text-sm mb-10 max-w-sm mx-auto">{t.landing.sectionCtaDesc}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onLogin && (
              <button id="cta-login-btn" type="button" onClick={onLogin}
                className="relative overflow-hidden bg-gradient-to-r from-game-accent to-game-ember text-white font-bold px-12 py-4 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-1 hover:shadow-xl transition-all duration-200 shadow-accent group">
                <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                <span className="relative flex items-center gap-2">
                  {t.auth.login}
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            )}
            {onRegister && (
              <button id="cta-register-btn" type="button" onClick={onRegister}
                className="bg-white/5 backdrop-blur-sm border border-white/15 text-text-primary font-bold px-10 py-4 rounded-xl text-sm uppercase tracking-wider hover:-translate-y-1 hover:border-game-gold/40 transition-all duration-200">
                {t.auth.register}
              </button>
            )}
          </div>
          <button type="button" onClick={onSkip}
            className="mt-5 text-text-faint hover:text-text-muted text-xs transition-colors underline underline-offset-4 decoration-text-faint/30 block mx-auto">
            {t.auth.playAsGuest}
          </button>
        </div>
      </section>

      {/* Footer rule */}
      <div className="h-px bg-gradient-to-r from-transparent via-border-medium to-transparent" />
      <div className="text-center py-4 text-text-faint text-[9px] tracking-widest uppercase opacity-40">
        War of Gods · {new Date().getFullYear()}
      </div>
    </div>
  );
}
