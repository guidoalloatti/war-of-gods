import { memo } from 'react';
import type { TerrainType } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

/**
 * Standalone hexagonal tile with true 3D terrain relief.
 * The hex face is flat/smooth — all relief is IN the terrain graphics themselves
 * (forest trees rise up, mountains are 3D peaks, plains are flat ground).
 */

// ── Hex geometry ─────────────────────────────────────────────────

const CX = 28, CY = 26, R = 24; // top-face center & radius

function hexPts(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

function hexPath(cx: number, cy: number, r: number): string {
  return `M${hexPts(cx, cy, r).replace(/ /g, 'L')}Z`;
}

// Side faces: only bottom 3 edges are visible (edges 2,3,4 in pointy-top)
function sideQuads(depth: number): { path: string; shade: number }[] {
  const verts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  });
  return [2, 3, 4].map((i, idx) => {
    const j = (i + 1) % 6;
    const v1 = verts[i], v2 = verts[j];
    const shade = idx === 1 ? 0.75 : idx === 0 ? 0.55 : 0.60; // center darkest
    return {
      path: `M${v1.x},${v1.y} L${v2.x},${v2.y} L${v2.x},${v2.y + depth} L${v1.x},${v1.y + depth} Z`,
      shade,
    };
  });
}

// ── Terrain definitions ──────────────────────────────────────────

// Each terrain: smooth flat face color + rich 3D relief graphics drawn ON TOP
const TERRAIN: Record<TerrainType, {
  faceColor: string;          // flat hex face (smooth, no lines)
  faceColor2: string;         // radial center highlight
  edgeColor: string;          // hex border
  sideBase: string;           // side face base color
  label: string;
  labelColor: string;
  depth: number;              // hex body depth (thin — relief is in graphics)
  // relief: SVG elements drawn on top of flat face with drop-shadow filters
  relief: (s: number) => React.ReactNode; // s = scale factor (1 for normal)
}> = {
  plain: {
    faceColor: '#c8a030',
    faceColor2: '#e8c858',
    edgeColor: '#d4b040',
    sideBase: '#6a4808',
    label: 'Llanura',
    labelColor: '#1a1000',
    depth: 4,
    relief: (s) => (
      <g style={{ filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.35))' }}>
        {/* Rolling ground — gentle mound */}
        <ellipse cx={CX} cy={CY + 6 * s} rx={18 * s} ry={5 * s} fill="#b89028" opacity={0.5} />
        {/* Wheat stalks — tight clusters, no horizontal lines */}
        {[
          [CX - 10, CY + 2], [CX - 7, CY + 2], [CX - 4, CY + 3],
          [CX + 2, CY + 1],  [CX + 5, CY + 2],  [CX + 9, CY + 1],
          [CX - 8, CY - 4],  [CX + 6, CY - 3],  [CX, CY - 2],
        ].map(([x, y], i) => (
          <g key={i}>
            <line x1={x} y1={y} x2={x! + 1} y2={y! - 9 * s} stroke="#d4a820" strokeWidth={1.2 * s} strokeLinecap="round" />
            <ellipse cx={x! + 0.5} cy={y! - 9 * s} rx={2 * s} ry={0.9 * s} fill="#e8c030" transform={`rotate(-15,${x! + 0.5},${y! - 9 * s})`} />
          </g>
        ))}
        {/* Wildflowers */}
        <circle cx={CX - 12} cy={CY - 2} r={1.5 * s} fill="#e84848" />
        <circle cx={CX + 11} cy={CY + 4} r={1.2 * s} fill="#c080ff" />
        <circle cx={CX + 2} cy={CY + 8} r={1.4 * s} fill="#ff9840" />
      </g>
    ),
  },

  mountain: {
    faceColor: '#485868',
    faceColor2: '#6878a0',
    edgeColor: '#80a0c0',
    sideBase: '#1a2230',
    label: 'Montaña',
    labelColor: '#e8f0ff',
    depth: 4,
    relief: (s) => (
      <g>
        {/* Far ridge — no shadow, farthest back */}
        <polygon
          points={`${CX - 20 * s},${CY + 8 * s} ${CX - 10 * s},${CY - 8 * s} ${CX - 2 * s},${CY + 2 * s} ${CX + 6 * s},${CY - 10 * s} ${CX + 18 * s},${CY + 8 * s}`}
          fill="#384858" opacity={0.7}
        />
        {/* Main mountain — left peak, raised with shadow */}
        <g style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.55))' }}>
          <polygon
            points={`${CX - 18 * s},${CY + 10 * s} ${CX - 6 * s},${CY - 14 * s} ${CX + 4 * s},${CY + 4 * s}`}
            fill="#6080a0"
          />
          {/* Snow cap left peak */}
          <polygon
            points={`${CX - 6 * s},${CY - 14 * s} ${CX - 10 * s},${CY - 7 * s} ${CX - 2 * s},${CY - 7 * s}`}
            fill="rgba(245,250,255,0.90)"
          />
          {/* Light face left */}
          <polygon
            points={`${CX - 6 * s},${CY - 14 * s} ${CX - 2 * s},${CY - 7 * s} ${CX + 4 * s},${CY + 4 * s}`}
            fill="#7898b8" opacity={0.8}
          />
        </g>
        {/* Main mountain — right peak, tallest, in front */}
        <g style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.65))' }}>
          <polygon
            points={`${CX - 4 * s},${CY + 10 * s} ${CX + 8 * s},${CY - 18 * s} ${CX + 20 * s},${CY + 10 * s}`}
            fill="#5878a0"
          />
          {/* Dark face right */}
          <polygon
            points={`${CX + 8 * s},${CY - 18 * s} ${CX + 20 * s},${CY + 10 * s} ${CX + 14 * s},${CY + 10 * s}`}
            fill="#304060" opacity={0.8}
          />
          {/* Snow cap right peak */}
          <polygon
            points={`${CX + 8 * s},${CY - 18 * s} ${CX + 3 * s},${CY - 9 * s} ${CX + 13 * s},${CY - 9 * s}`}
            fill="rgba(245,250,255,0.95)"
          />
          {/* Snow shadow */}
          <polygon
            points={`${CX + 8 * s},${CY - 10 * s} ${CX + 13 * s},${CY - 9 * s} ${CX + 15 * s},${CY - 5 * s}`}
            fill="rgba(180,200,230,0.40)"
          />
        </g>
        {/* Rock strata lines on face */}
        <line x1={CX - 2 * s} y1={CY - 2 * s} x2={CX + 10 * s} y2={CY + 4 * s} stroke="rgba(40,55,75,0.35)" strokeWidth={0.8} />
        <line x1={CX} y1={CY + 2 * s} x2={CX + 14 * s} y2={CY + 7 * s} stroke="rgba(40,55,75,0.25)" strokeWidth={0.6} />
      </g>
    ),
  },

  forest: {
    faceColor: '#1a5e2a',
    faceColor2: '#257838',
    edgeColor: '#40a858',
    sideBase: '#082810',
    label: 'Bosque',
    labelColor: '#d0ffe0',
    depth: 4,
    relief: (s) => (
      <g>
        {/* Ground — dark soil */}
        <ellipse cx={CX} cy={CY + 8 * s} rx={20 * s} ry={5 * s} fill="#0e3818" opacity={0.6} />
        {/* Back trees — shorter, darker */}
        {[CX - 10, CX + 2, CX + 12].map((tx, i) => (
          <g key={`bt${i}`} style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))' }}>
            <line x1={tx} y1={CY + 8 * s} x2={tx} y2={CY - 4 * s} stroke="#3d200a" strokeWidth={2 * s} strokeLinecap="round" />
            <polygon points={`${tx},${CY - 14 * s} ${tx - 6 * s},${CY - 2 * s} ${tx + 6 * s},${CY - 2 * s}`} fill="#1a6030" />
            <polygon points={`${tx},${CY - 18 * s} ${tx - 4 * s},${CY - 9 * s} ${tx + 4 * s},${CY - 9 * s}`} fill="#228040" />
          </g>
        ))}
        {/* Front trees — taller, brighter, with proper shadow */}
        {[CX - 4, CX + 8].map((tx, i) => (
          <g key={`ft${i}`} style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.55))' }}>
            <line x1={tx} y1={CY + 9 * s} x2={tx} y2={CY - 2 * s} stroke="#4a2808" strokeWidth={2.5 * s} strokeLinecap="round" />
            {/* Three tiers */}
            <polygon points={`${tx},${CY - 20 * s} ${tx - 8 * s},${CY - 7 * s} ${tx + 8 * s},${CY - 7 * s}`} fill="#1e7838" />
            <polygon points={`${tx},${CY - 15 * s} ${tx - 7 * s},${CY - 4 * s} ${tx + 7 * s},${CY - 4 * s}`} fill="#289048" />
            <polygon points={`${tx},${CY - 10 * s} ${tx - 6 * s},${CY + 1 * s} ${tx + 6 * s},${CY + 1 * s}`} fill="#30a050" />
            {/* Light side highlight */}
            <polygon points={`${tx},${CY - 20 * s} ${tx},${CY - 7 * s} ${tx + 8 * s},${CY - 7 * s}`} fill="rgba(60,180,80,0.25)" />
            {/* Snow/light on tip */}
            <circle cx={tx} cy={CY - 20 * s} r={1.5 * s} fill="rgba(200,255,210,0.45)" />
          </g>
        ))}
      </g>
    ),
  },

  swamp: {
    faceColor: '#205858',
    faceColor2: '#307878',
    edgeColor: '#508888',
    sideBase: '#0a2020',
    label: 'Pantano',
    labelColor: '#c0ffff',
    depth: 4,
    relief: (s) => (
      <g>
        {/* Water pools with shimmer */}
        <ellipse cx={CX - 6 * s} cy={CY + 4 * s} rx={12 * s} ry={4 * s} fill="#103838" opacity={0.75} />
        <ellipse cx={CX + 8 * s} cy={CY - 2 * s} rx={9 * s} ry={3 * s} fill="#103838" opacity={0.65} />
        {/* Shimmer highlights */}
        <path d={`M${CX - 14 * s},${CY + 3 * s} Q${CX - 8 * s},${CY + 1 * s} ${CX - 2 * s},${CY + 3 * s}`}
          stroke="rgba(100,200,200,0.35)" strokeWidth={0.8} fill="none" />
        <path d={`M${CX + 2 * s},${CY - 2 * s} Q${CX + 8 * s},${CY - 4 * s} ${CX + 14 * s},${CY - 2 * s}`}
          stroke="rgba(100,200,200,0.28)" strokeWidth={0.7} fill="none" />
        {/* Lily pads */}
        <ellipse cx={CX - 10 * s} cy={CY + 4 * s} rx={3 * s} ry={1.5 * s} fill="#308848" opacity={0.80} />
        <circle cx={CX - 10 * s} cy={CY + 4 * s} r={1.2 * s} fill="rgba(255,240,150,0.80)" />
        <ellipse cx={CX + 4 * s} cy={CY - 1 * s} rx={2.5 * s} ry={1.2 * s} fill="#2a7840" opacity={0.70} />
        {/* Reeds — real 3D stalks */}
        {[[CX - 16, CY + 2, 12], [CX - 14, CY + 1, 11], [CX + 12, CY - 4, 10], [CX + 14, CY - 3, 9]].map(([rx, ry, rh], i) => (
          <g key={i} style={{ filter: 'drop-shadow(0.5px 1px 0.5px rgba(0,0,0,0.4))' }}>
            <line x1={rx} y1={ry} x2={rx! + 0.5} y2={ry! - rh! * s} stroke="#4a7020" strokeWidth={1.2 * s} strokeLinecap="round" />
            <ellipse cx={rx! + 0.5} cy={ry! - rh! * s} rx={1.2 * s} ry={2.5 * s} fill="#6a4010" />
          </g>
        ))}
        {/* Dead branches */}
        <g style={{ filter: 'drop-shadow(0.5px 1px 0.5px rgba(0,0,0,0.35))' }}>
          <line x1={CX + 6 * s} y1={CY + 8 * s} x2={CX + 9 * s} y2={CY - 6 * s} stroke="#4a3010" strokeWidth={1.5 * s} strokeLinecap="round" />
          <line x1={CX + 9 * s} y1={CY - 2 * s} x2={CX + 14 * s} y2={CY - 8 * s} stroke="#4a3010" strokeWidth={1.0 * s} strokeLinecap="round" />
          <line x1={CX + 9 * s} y1={CY - 2 * s} x2={CX + 5 * s} y2={CY - 7 * s} stroke="#4a3010" strokeWidth={0.8 * s} strokeLinecap="round" />
        </g>
        {/* Bubbles */}
        <circle cx={CX - 5 * s} cy={CY + 5 * s} r={1 * s} fill="none" stroke="rgba(120,220,220,0.50)" strokeWidth={0.7} />
        <circle cx={CX - 2 * s} cy={CY + 3 * s} r={0.6 * s} fill="none" stroke="rgba(120,220,220,0.40)" strokeWidth={0.5} />
      </g>
    ),
  },

  road: {
    faceColor: '#806020',
    faceColor2: '#a08030',
    edgeColor: '#c09840',
    sideBase: '#302008',
    label: 'Camino',
    labelColor: '#ffe8a0',
    depth: 4,
    relief: (s) => (
      // Road is drawn by HexBoard dynamically based on connections.
      // Here we show a standalone tile with a simple N-S road through center.
      <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.40))' }}>
        {/* Packed earth road surface — vertical through center */}
        <rect x={CX - 7 * s} y={CY - 22 * s} width={14 * s} height={44 * s} fill="#9a7830" rx={1} opacity={0.85} />
        {/* Road edge shadows */}
        <rect x={CX - 7 * s} y={CY - 22 * s} width={2 * s} height={44 * s} fill="rgba(0,0,0,0.20)" />
        <rect x={CX + 5 * s} y={CY - 22 * s} width={2 * s} height={44 * s} fill="rgba(0,0,0,0.15)" />
        {/* Center highlight */}
        <rect x={CX - 1.5 * s} y={CY - 22 * s} width={3 * s} height={44 * s} fill="rgba(255,220,120,0.15)" />
        {/* Individual cobblestones — no horizontal stripes */}
        {[CY - 14, CY - 6, CY + 2, CY + 10].map((py, i) => (
          <g key={i}>
            <rect x={CX - 6 * s} y={py * s + (CY * (1 - s))} width={6 * s} height={5 * s} rx={0.8} fill={i % 2 === 0 ? '#b09040' : '#a88030'} opacity={0.7} />
            <rect x={CX} y={py * s + (CY * (1 - s))} width={6 * s} height={5 * s} rx={0.8} fill={i % 2 === 0 ? '#a08030' : '#b89040'} opacity={0.7} />
          </g>
        ))}
        {/* Grass verges */}
        <rect x={CX - 22 * s} y={CY - 22 * s} width={15 * s} height={44 * s} fill="#406018" opacity={0.35} />
        <rect x={CX + 7 * s} y={CY - 22 * s} width={15 * s} height={44 * s} fill="#406018" opacity={0.35} />
        {/* Roadside stones */}
        <ellipse cx={CX - 11 * s} cy={CY + 2 * s} rx={2.5 * s} ry={1.2 * s} fill="#807050" opacity={0.60} />
        <ellipse cx={CX + 12 * s} cy={CY - 4 * s} rx={2 * s} ry={1 * s} fill="#786848" opacity={0.55} />
      </g>
    ),
  },
};

// ── Component ────────────────────────────────────────────────────

type Props = {
  terrain: TerrainType;
  size?: number;
  showLabel?: boolean;
  showCount?: number;
  dimmed?: boolean;
  index?: number;
};

export const HexTile = memo(function HexTile({
  terrain,
  size = 56,
  showLabel = false,
  showCount,
  dimmed = false,
  index = 0,
}: Props) {
  const t = useI18n(s => s.t);
  const cfg = TERRAIN[terrain];
  const localizedLabel = t.terrain[terrain];
  const d = cfg.depth;
  const labelH = showLabel ? 12 : 0;
  const viewH = CY + R + d + labelH + 2;
  const viewW = CX + R + 2;

  const faceD = hexPath(CX, CY, R);
  const sides = sideQuads(d);
  const innerFaceD = hexPath(CX, CY, R - 1.5);
  const gradId = `htg-${terrain}`;
  const clipId = `htc-${terrain}-${index}`;

  const svgW = viewW + 2;
  const svgH = viewH + 2;
  const pixW = size;
  const pixH = Math.round(size * (svgH / svgW));

  return (
    <svg
      width={pixW}
      height={pixH}
      viewBox={`-1 -1 ${svgW} ${svgH}`}
      style={{
        display: 'block',
        opacity: dimmed ? 0.38 : 1,
        filter: dimmed ? 'grayscale(0.6)' : 'none',
        animationDelay: `${index * 0.04}s`,
      }}
      className={dimmed ? '' : 'animate-scale-in'}
    >
      <defs>
        {/* Smooth radial face gradient — no lines, soft center highlight */}
        <radialGradient id={gradId} cx="38%" cy="35%" r="65%">
          <stop offset="0%" stopColor={cfg.faceColor2} />
          <stop offset="55%" stopColor={cfg.faceColor} />
          <stop offset="100%" stopColor={cfg.sideBase} stopOpacity={0.7} />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={faceD} />
        </clipPath>
        {/* Drop shadow for the whole tile body */}
        <filter id={`hts-${terrain}-${index}`} x="-20%" y="-10%" width="140%" height="160%">
          <feDropShadow dx="0" dy={d * 0.8} stdDeviation={d * 0.7} floodColor="rgba(0,0,0,0.60)" />
        </filter>
      </defs>

      {/* Side faces */}
      <g filter={`url(#hts-${terrain}-${index})`}>
        {sides.map(({ path, shade }, i) => (
          <path key={i} d={path}
            fill={cfg.sideBase}
            opacity={shade}
            stroke="rgba(0,0,0,0.30)"
            strokeWidth={0.4}
          />
        ))}
      </g>

      {/* Top face — smooth gradient, no pattern lines */}
      <path d={faceD}
        fill={`url(#${gradId})`}
        stroke={cfg.edgeColor}
        strokeWidth={1.4}
      />

      {/* Inner edge highlight (gives the flat face a slight bevel look) */}
      <path d={innerFaceD}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={0.9}
      />

      {/* 3D terrain relief — clipped to hex, drawn on top of flat face */}
      <g clipPath={`url(#${clipId})`}>
        {cfg.relief(1)}
      </g>

      {/* Count badge */}
      {showCount !== undefined && (
        <text
          x={CX} y={CY + 11}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          fill="rgba(255,255,255,0.98)"
          style={{ filter: 'drop-shadow(0 1.5px 2.5px rgba(0,0,0,1))' }}
        >
          ×{showCount}
        </text>
      )}

      {/* Label below hex */}
      {showLabel && (
        <text
          x={CX} y={CY + R + d + 9}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight="700"
          fontFamily="serif"
          fill={cfg.labelColor}
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}
        >
          {localizedLabel}
        </text>
      )}
    </svg>
  );
});
