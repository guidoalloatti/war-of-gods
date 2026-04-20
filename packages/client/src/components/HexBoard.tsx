import React, { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react';
import type { TerrainType, RaceId } from '@war-of-gods/engine';
import { getRaceById } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';
import { HexTile } from './HexTile.js';

// ── Hex grid math ────────────────────────────────────────────────
export type HexCoord = { q: number; r: number };
export type HexCell = {
  coord: HexCoord;
  level: number;
  terrain: TerrainType | null;
};

function generateHexGrid(maxLevel: number): HexCell[] {
  const cells: HexCell[] = [];
  for (let q = -maxLevel; q <= maxLevel; q++) {
    for (let r = -maxLevel; r <= maxLevel; r++) {
      const s = -q - r;
      if (Math.abs(s) > maxLevel) continue;
      const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      cells.push({ coord: { q, r }, level, terrain: null });
    }
  }
  return cells;
}

const HEX_GRID = generateHexGrid(3);

function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

function hexPath(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

function hexVertices(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    verts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return verts;
}

// Base depth, then multiplied by grouping factor
const TERRAIN_BASE_DEPTH: Record<TerrainType, number> = {
  mountain: 8,
  forest:   5,
  plain:    3,
  road:     2,
  swamp:    2,
};

const TERRAIN_SIDE_COLOR: Record<TerrainType, string> = {
  plain:    '#5a420e',
  mountain: '#1a2430',
  forest:   '#0b2e18',
  swamp:    '#102c2e',
  road:     '#3a2c10',
};

const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// For pointy-top hexes with vertex angles = 60i - 30°, edge i spans verts i and (i+1)%6.
// Maps HEX_DIRS index → edge index (which edge faces that neighbor).
// dir 0 (+q east)       → edge 0 (v0→v1, east side)
// dir 1 (+q,-r up-east) → edge 5 (v5→v0, upper-right side)
// dir 2 (-r up-west)    → edge 4 (v4→v5, upper-left side)
// dir 3 (-q west)       → edge 3 (v3→v4, west side)
// dir 4 (-q,+r down-w)  → edge 2 (v2→v3, lower-left side)
// dir 5 (+r down-east)  → edge 1 (v1→v2, lower-right side)
const DIR_TO_EDGE = [0, 5, 4, 3, 2, 1];

function getNeighborCount(board: HexCell[], cell: HexCell, terrain: TerrainType): number {
  let count = 0;
  const coordMap = new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c]));
  for (const d of HEX_DIRS) {
    const key = `${cell.coord.q + d.q},${cell.coord.r + d.r}`;
    const nb = coordMap.get(key);
    if (nb?.terrain === terrain) count++;
  }
  return count;
}

// Returns which EDGES (0-5) connect to a road neighbor
function getRoadConnections(board: HexCell[], cell: HexCell): number[] {
  const coordMap = new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c]));
  const edges: number[] = [];
  for (let i = 0; i < 6; i++) {
    const d = HEX_DIRS[i];
    const key = `${cell.coord.q + d.q},${cell.coord.r + d.r}`;
    const nb = coordMap.get(key);
    if (nb?.terrain === 'road') edges.push(DIR_TO_EDGE[i]);
  }
  return edges;
}

// Returns true if this road cell is adjacent to the center village (level 0)
function isAdjacentToCenter(board: HexCell[], cell: HexCell): { adjacent: boolean; edge: number } {
  const coordMap = new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c]));
  for (let i = 0; i < 6; i++) {
    const d = HEX_DIRS[i];
    const key = `${cell.coord.q + d.q},${cell.coord.r + d.r}`;
    const nb = coordMap.get(key);
    if (nb && nb.coord.q === 0 && nb.coord.r === 0 && nb.level === 0) {
      return { adjacent: true, edge: DIR_TO_EDGE[i] };
    }
  }
  return { adjacent: false, edge: -1 };
}

// Returns true if this road cell is on the outer border (no neighbor at level+1 exists, OR cell is at maxLevel)
// Returns edges (0-5) that face the outer world (have no neighbor cell on the board).
function getBorderEdges(board: HexCell[], cell: HexCell): number[] {
  const coordMap = new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c]));
  const edges: number[] = [];
  for (let i = 0; i < 6; i++) {
    const d = HEX_DIRS[i];
    const key = `${cell.coord.q + d.q},${cell.coord.r + d.r}`;
    const nb = coordMap.get(key);
    if (!nb) edges.push(DIR_TO_EDGE[i]);
  }
  return edges;
}

function hexSidePaths(cx: number, cy: number, size: number, depth: number): string[] {
  const verts = hexVertices(cx, cy, size);
  const paths: string[] = [];
  for (const i of [2, 3, 4]) {
    const j = (i + 1) % 6;
    const v1 = verts[i];
    const v2 = verts[j];
    paths.push(
      `M${v1.x},${v1.y} L${v2.x},${v2.y} L${v2.x},${v2.y + depth} L${v1.x},${v1.y + depth} Z`,
    );
  }
  return paths;
}

// ── Terrain visuals ──────────────────────────────────────────────

const TERRAIN_COLORS: Record<TerrainType, { fill: string; fill2: string; fillDark: string; stroke: string; label: string; labelColor: string }> = {
  plain:    { fill: '#c8a030', fill2: '#e8c858', fillDark: '#6a4808', stroke: '#d4b040', label: 'Llanura', labelColor: '#1a1000' },
  mountain: { fill: '#485868', fill2: '#6878a0', fillDark: '#1a2230', stroke: '#80a0c0', label: 'Montaña', labelColor: '#e8f0ff' },
  forest:   { fill: '#1a5e2a', fill2: '#257838', fillDark: '#082810', stroke: '#40a858', label: 'Bosque',  labelColor: '#d0ffe0' },
  swamp:    { fill: '#205858', fill2: '#307878', fillDark: '#0a2020', stroke: '#508888', label: 'Pantano', labelColor: '#c0ffff' },
  road:     { fill: '#806020', fill2: '#a08030', fillDark: '#302008', stroke: '#c09840', label: 'Camino',  labelColor: '#ffe8a0' },
};

// Inline SVG terrain relief graphics.
// n = neighborCount (0-6). Feature count and feature size both grow with n:
//   n=0 → 1 small feature
//   n=1 → 2 medium features
//   n=2 → 3 larger features
//   n=3+ → 4-5 large features
function TerrainRelief({ terrain, cx, cy, size, neighborCount }: {
  terrain: TerrainType; cx: number; cy: number; size: number; neighborCount: number;
}): React.ReactNode {
  const s = size / 28;
  const n = Math.min(neighborCount, 4);
  // Feature size multiplier grows from 0.8 (isolated) to 1.6 (dense group)
  const sz = 0.8 + n * 0.22;

  if (terrain === 'mountain') {
    // Mountain peak definitions: [offsetX, baseOffsetY, heightPx, widthPx, tier]
    // n=0 → 1 small peak only; n=1 → 2 peaks; n=2 → 3 peaks; n=3+ → 4 peaks with back ridge
    const peaks: { x: number; baseY: number; h: number; w: number; fill: string; dark: string; snow: boolean }[] = [];
    const baseY = cy + 9*s;
    const peakH = (14 + n * 4) * s; // grows noticeably
    const peakW = (10 + n * 1.5) * s;

    if (n === 0) {
      peaks.push({ x: cx, baseY, h: peakH, w: peakW, fill: '#5878a0', dark: '#304060', snow: true });
    } else if (n === 1) {
      peaks.push({ x: cx - 7*s, baseY, h: peakH*0.85, w: peakW*0.9, fill: '#6080a0', dark: '#384868', snow: true });
      peaks.push({ x: cx + 7*s, baseY, h: peakH, w: peakW, fill: '#5878a0', dark: '#304060', snow: true });
    } else if (n === 2) {
      peaks.push({ x: cx - 11*s, baseY, h: peakH*0.75, w: peakW*0.85, fill: '#587898', dark: '#2c3c5c', snow: true });
      peaks.push({ x: cx, baseY, h: peakH, w: peakW, fill: '#6080a8', dark: '#304060', snow: true });
      peaks.push({ x: cx + 11*s, baseY, h: peakH*0.85, w: peakW*0.9, fill: '#5878a0', dark: '#2c3c5c', snow: true });
    } else {
      // Dense mountain range
      peaks.push({ x: cx - 15*s, baseY, h: peakH*0.70, w: peakW*0.8, fill: '#506c8c', dark: '#283850', snow: false });
      peaks.push({ x: cx - 6*s, baseY, h: peakH*0.95, w: peakW*0.95, fill: '#5878a0', dark: '#2c3c5c', snow: true });
      peaks.push({ x: cx + 5*s, baseY, h: peakH*1.1, w: peakW, fill: '#6088b0', dark: '#304060', snow: true });
      peaks.push({ x: cx + 14*s, baseY, h: peakH*0.80, w: peakW*0.85, fill: '#587898', dark: '#2c3c5c', snow: true });
    }

    return (
      <g>
        {/* Back ridge for n>=3 */}
        {n >= 3 && (
          <polygon
            points={`${cx-20*s},${baseY} ${cx-12*s},${cy-peakH*0.5} ${cx-4*s},${cy-peakH*0.2} ${cx+4*s},${cy-peakH*0.6} ${cx+12*s},${cy-peakH*0.3} ${cx+20*s},${baseY}`}
            fill="#384858" opacity={0.55}
          />
        )}
        {peaks.map((p, i) => (
          <g key={i} style={{ filter: `drop-shadow(0 ${2 + n*0.5}px ${2 + n*0.5}px rgba(0,0,0,0.55))` }}>
            {/* Main triangle */}
            <polygon
              points={`${p.x - p.w},${p.baseY} ${p.x},${p.baseY - p.h} ${p.x + p.w},${p.baseY}`}
              fill={p.fill}
            />
            {/* Dark (shadow) face */}
            <polygon
              points={`${p.x},${p.baseY - p.h} ${p.x + p.w},${p.baseY} ${p.x + p.w*0.35},${p.baseY}`}
              fill={p.dark} opacity={0.85}
            />
            {/* Snow cap */}
            {p.snow && (
              <>
                <polygon
                  points={`${p.x},${p.baseY - p.h} ${p.x - p.w*0.40},${p.baseY - p.h*0.65} ${p.x + p.w*0.40},${p.baseY - p.h*0.65}`}
                  fill="rgba(248,252,255,0.96)"
                />
                <polygon
                  points={`${p.x},${p.baseY - p.h*0.65} ${p.x + p.w*0.40},${p.baseY - p.h*0.65} ${p.x + p.w*0.25},${p.baseY - p.h*0.45}`}
                  fill="rgba(180,200,230,0.45)"
                />
              </>
            )}
            {/* Rock strata lines */}
            <line x1={p.x - p.w*0.6} y1={p.baseY - p.h*0.15} x2={p.x + p.w*0.6} y2={p.baseY - p.h*0.08}
              stroke="rgba(30,40,60,0.35)" strokeWidth={0.8*s} />
          </g>
        ))}
      </g>
    );
  }

  if (terrain === 'forest') {
    // Tree count scales: n=0→1, n=1→2, n=2→3, n=3→5, n=4→6
    const treeCount = [1, 2, 3, 5, 6][n];
    const treeH = (10 + n * 3.5) * s;
    const treeW = (5 + n * 0.9) * s;
    // Distribute trees — centered when few, spread + back row when many
    const layouts: number[][][] = [
      [[0, 0]],                                           // 1 tree
      [[-6, 1], [6, -1]],                                 // 2 trees
      [[-8, 1], [0, -2], [8, 1]],                         // 3 trees
      [[-11, 2], [-3, -3], [5, 1], [12, -1], [0, 3]],     // 5 trees
      [[-13, 2], [-7, -2], [0, 1], [7, -3], [13, 2], [2, 4]], // 6 trees
    ];
    const positions = layouts[n];

    return (
      <g>
        {/* Dark soil patch under the trees */}
        <ellipse cx={cx} cy={cy + 9*s} rx={(14 + n*2)*s} ry={(4 + n*0.5)*s} fill="#082810" opacity={0.60} />
        {positions.map(([dx, dy], i) => {
          const tx = cx + dx * s;
          const ty = cy + dy * s;
          const hFactor = 0.85 + (i % 3) * 0.10; // slight variation
          const th = treeH * hFactor;
          const tw = treeW * hFactor;
          const isFront = dy >= 0;
          return (
            <g key={i} style={{ filter: `drop-shadow(0 ${isFront ? 3 : 2}px ${isFront ? 3 : 2}px rgba(0,0,0,${isFront ? 0.55 : 0.4}))` }}>
              {/* Trunk */}
              <line x1={tx} y1={ty + th*0.3} x2={tx} y2={ty - th*0.15} stroke="#4a2808" strokeWidth={1.8*s} strokeLinecap="round" />
              {/* Three tiers — conifer shape */}
              <polygon points={`${tx},${ty - th} ${tx - tw},${ty - th*0.45} ${tx + tw},${ty - th*0.45}`} fill={isFront ? '#1e7838' : '#165c28'} />
              <polygon points={`${tx},${ty - th*0.75} ${tx - tw*0.9},${ty - th*0.20} ${tx + tw*0.9},${ty - th*0.20}`} fill={isFront ? '#28904a' : '#1e7838'} />
              <polygon points={`${tx},${ty - th*0.45} ${tx - tw*0.75},${ty + th*0.05} ${tx + tw*0.75},${ty + th*0.05}`} fill={isFront ? '#34a858' : '#28904a'} />
              {/* Light side highlight */}
              <polygon points={`${tx},${ty - th} ${tx},${ty - th*0.45} ${tx + tw},${ty - th*0.45}`} fill="rgba(80,200,110,0.22)" />
              {/* Tip highlight */}
              <circle cx={tx} cy={ty - th} r={1.2*s} fill="rgba(200,255,210,0.50)" />
            </g>
          );
        })}
      </g>
    );
  }

  if (terrain === 'plain') {
    // Stalk cluster count: n=0→3 stalks (single cluster), n=1→6, n=2→9, n=3→12, n=4→15
    const stalkCount = 3 + n * 3;
    const stalkH = (7 + n * 1.8) * s;
    // Pseudorandom deterministic positions
    const positions: [number, number][] = [];
    for (let i = 0; i < stalkCount; i++) {
      const a = (i * 2.4) + 0.5;
      const r = Math.sqrt(i / stalkCount) * (9 + n * 2);
      positions.push([Math.cos(a) * r, Math.sin(a) * r * 0.7]);
    }
    return (
      <g style={{ filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.35))' }}>
        <ellipse cx={cx} cy={cy + 7*s} rx={(14 + n*2)*s} ry={(3.5 + n*0.4)*s} fill="#a87820" opacity={0.45} />
        {positions.map(([dx, dy], i) => {
          const x = cx + dx * s;
          const y = cy + dy * s;
          return (
            <g key={i}>
              <line x1={x} y1={y} x2={x + 0.5} y2={y - stalkH} stroke="#c49020" strokeWidth={1.1*s} strokeLinecap="round" />
              <ellipse cx={x + 0.25} cy={y - stalkH} rx={1.7*s} ry={0.75*s} fill="#ddb828" transform={`rotate(-15,${x+0.25},${y-stalkH})`} />
            </g>
          );
        })}
        {/* Wildflowers — more as field grows */}
        <circle cx={cx - 10*s} cy={cy - 2*s} r={1.3*sz} fill="#e84848" opacity={0.9} />
        {n >= 1 && <circle cx={cx + 9*s} cy={cy + 4*s} r={1.1*sz} fill="#b060ff" opacity={0.85} />}
        {n >= 2 && <circle cx={cx + 2*s} cy={cy + 7*s} r={1.2*sz} fill="#ff9840" opacity={0.85} />}
        {n >= 3 && <circle cx={cx - 6*s} cy={cy + 6*s} r={1.1*sz} fill="#ffe050" opacity={0.85} />}
      </g>
    );
  }

  if (terrain === 'swamp') {
    // Pool count scales: n=0→1, n=1→2, n=2→3, n=3+→4
    const poolCount = Math.min(n + 1, 4);
    const pools = [
      { dx: 0, dy: 2, rx: 10 + n*1.5, ry: 3.5 + n*0.4 },
      { dx: -6, dy: -2, rx: 7 + n*1.0, ry: 2.5 + n*0.3 },
      { dx: 8, dy: 3, rx: 8 + n*1.0, ry: 3 + n*0.3 },
      { dx: -2, dy: 6, rx: 6 + n*0.8, ry: 2 + n*0.2 },
    ].slice(0, poolCount);
    const reedCount = 2 + n * 2;
    const reedPositions: [number, number][] = [];
    for (let i = 0; i < reedCount; i++) {
      const a = (i * 1.9) + 0.3;
      const r = 10 + (i % 3) * 2;
      reedPositions.push([Math.cos(a) * r, Math.sin(a) * r * 0.6]);
    }
    return (
      <g>
        {pools.map((p, i) => (
          <g key={`pool-${i}`}>
            <ellipse cx={cx + p.dx*s} cy={cy + p.dy*s} rx={p.rx*s} ry={p.ry*s} fill="#103838" opacity={0.72} />
            <path d={`M${cx + (p.dx-p.rx*0.7)*s},${cy + p.dy*s} Q${cx + p.dx*s},${cy + (p.dy-p.ry*0.5)*s} ${cx + (p.dx+p.rx*0.7)*s},${cy + p.dy*s}`}
              stroke="rgba(100,200,200,0.35)" strokeWidth={0.8} fill="none" />
            {/* Lily pad */}
            <ellipse cx={cx + (p.dx-p.rx*0.4)*s} cy={cy + p.dy*s} rx={2.5*sz*s} ry={1.2*sz*s} fill="#308848" opacity={0.85} />
            <circle cx={cx + (p.dx-p.rx*0.4)*s} cy={cy + p.dy*s} r={1.0*sz*s} fill="rgba(255,240,150,0.85)" />
          </g>
        ))}
        {/* Reeds — grow with n */}
        {reedPositions.map(([dx, dy], i) => {
          const rx = cx + dx*s, ry = cy + dy*s;
          const rh = (8 + n*1.5) * s;
          return (
            <g key={`reed-${i}`} style={{ filter: 'drop-shadow(0.5px 1px 0.5px rgba(0,0,0,0.40))' }}>
              <line x1={rx} y1={ry} x2={rx + 0.5} y2={ry - rh} stroke="#4a7020" strokeWidth={1.1*s} strokeLinecap="round" />
              <ellipse cx={rx + 0.25} cy={ry - rh} rx={1.1*s} ry={2.3*s} fill="#6a4010" />
            </g>
          );
        })}
        {/* Dead tree — appears in dense swamps */}
        {n >= 2 && (
          <g style={{ filter: 'drop-shadow(0.5px 1px 0.5px rgba(0,0,0,0.45))' }}>
            <line x1={cx + 6*s} y1={cy + 8*s} x2={cx + 9*s} y2={cy - 6*s} stroke="#4a3010" strokeWidth={1.6*s} strokeLinecap="round" />
            <line x1={cx + 9*s} y1={cy - 2*s} x2={cx + 14*s} y2={cy - 8*s} stroke="#4a3010" strokeWidth={1.0*s} strokeLinecap="round" />
            <line x1={cx + 9*s} y1={cy - 2*s} x2={cx + 5*s} y2={cy - 7*s} stroke="#4a3010" strokeWidth={0.9*s} strokeLinecap="round" />
          </g>
        )}
        {/* Bubbles */}
        <circle cx={cx - 4*s} cy={cy + 3*s} r={1*s} fill="none" stroke="rgba(120,220,220,0.50)" strokeWidth={0.7} />
        <circle cx={cx - 1*s} cy={cy + 1*s} r={0.6*s} fill="none" stroke="rgba(120,220,220,0.40)" strokeWidth={0.5} />
      </g>
    );
  }

  // road fallback — the board renders roads with edge-driven geometry
  return null;
}

const LEVEL_COLORS = [
  'rgba(245,197,24,0.15)',
  'rgba(245,197,24,0.08)',
  'rgba(245,197,24,0.04)',
  'rgba(245,197,24,0.02)',
];

// Race village data — each race has a unique city feel
const RACE_VILLAGE: Record<string, {
  emoji: string;
  color: string;
  glow: string;
  bgGrad: [string, string];
  architecture: (cx: number, cy: number, r: number) => React.ReactNode;
}> = {
  elf: {
    emoji: '🌿', color: '#4acd7a', glow: '#4acd7a',
    bgGrad: ['rgba(30,120,60,0.30)', 'rgba(15,60,30,0.10)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Elven spires — tall elegant towers */}
        <line x1={cx} y1={cy - r * 0.7} x2={cx} y2={cy + r * 0.3} stroke="rgba(80,200,120,0.50)" strokeWidth={r * 0.06} />
        <polygon points={`${cx},${cy - r * 0.85} ${cx - r * 0.08},${cy - r * 0.65} ${cx + r * 0.08},${cy - r * 0.65}`} fill="rgba(100,220,140,0.55)" />
        <line x1={cx - r * 0.28} y1={cy - r * 0.5} x2={cx - r * 0.28} y2={cy + r * 0.25} stroke="rgba(80,200,120,0.40)" strokeWidth={r * 0.045} />
        <polygon points={`${cx - r * 0.28},${cy - r * 0.65} ${cx - r * 0.34},${cy - r * 0.48} ${cx - r * 0.22},${cy - r * 0.48}`} fill="rgba(100,220,140,0.45)" />
        <line x1={cx + r * 0.28} y1={cy - r * 0.5} x2={cx + r * 0.28} y2={cy + r * 0.25} stroke="rgba(80,200,120,0.40)" strokeWidth={r * 0.045} />
        <polygon points={`${cx + r * 0.28},${cy - r * 0.65} ${cx + r * 0.22},${cy - r * 0.48} ${cx + r * 0.34},${cy - r * 0.48}`} fill="rgba(100,220,140,0.45)" />
        {/* Circular base platform */}
        <ellipse cx={cx} cy={cy + r * 0.32} rx={r * 0.45} ry={r * 0.12} fill="rgba(60,160,90,0.28)" />
        {/* Tree canopies */}
        <circle cx={cx - r * 0.42} cy={cy + r * 0.05} r={r * 0.14} fill="rgba(40,150,70,0.40)" />
        <circle cx={cx + r * 0.42} cy={cy + r * 0.05} r={r * 0.12} fill="rgba(40,150,70,0.35)" />
      </>
    ),
  },
  dwarf: {
    emoji: '⛏️', color: '#b8c8d8', glow: '#8a9bae',
    bgGrad: ['rgba(80,90,110,0.35)', 'rgba(30,40,55,0.15)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Dwarven fortress — squat and wide */}
        <rect x={cx - r * 0.45} y={cy - r * 0.35} width={r * 0.9} height={r * 0.65} fill="rgba(90,105,125,0.50)" stroke="rgba(150,170,190,0.30)" strokeWidth={0.8} rx={1} />
        {/* Battlements */}
        {[-0.38, -0.22, -0.06, 0.10, 0.26].map((dx, i) => (
          <rect key={i} x={cx + dx * r} y={cy - r * 0.45} width={r * 0.10} height={r * 0.12} fill="rgba(110,125,145,0.55)" />
        ))}
        {/* Gate arch */}
        <path d={`M${cx - r * 0.15},${cy + r * 0.30} A${r * 0.15},${r * 0.18} 0 0,1 ${cx + r * 0.15},${cy + r * 0.30} L${cx + r * 0.15},${cy + r * 0.10} A${r * 0.15},${r * 0.18} 0 0,0 ${cx - r * 0.15},${cy + r * 0.10} Z`}
          fill="rgba(20,25,35,0.70)" />
        {/* Windows */}
        <rect x={cx - r * 0.37} y={cy - r * 0.20} width={r * 0.10} height={r * 0.10} fill="rgba(220,180,80,0.40)" rx={1} />
        <rect x={cx + r * 0.27} y={cy - r * 0.20} width={r * 0.10} height={r * 0.10} fill="rgba(220,180,80,0.40)" rx={1} />
        {/* Central tower */}
        <rect x={cx - r * 0.10} y={cy - r * 0.60} width={r * 0.20} height={r * 0.28} fill="rgba(100,115,135,0.55)" stroke="rgba(150,170,190,0.25)" strokeWidth={0.7} />
        <polygon points={`${cx},${cy - r * 0.72} ${cx - r * 0.10},${cy - r * 0.60} ${cx + r * 0.10},${cy - r * 0.60}`} fill="rgba(160,130,70,0.50)" />
        {/* Moat */}
        <ellipse cx={cx} cy={cy + r * 0.38} rx={r * 0.50} ry={r * 0.08} fill="rgba(30,50,80,0.35)" />
      </>
    ),
  },
  human: {
    emoji: '🏰', color: '#e8d080', glow: '#d4b95a',
    bgGrad: ['rgba(180,150,60,0.28)', 'rgba(80,60,20,0.10)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Human castle — classic medieval */}
        <rect x={cx - r * 0.40} y={cy - r * 0.28} width={r * 0.80} height={r * 0.58} fill="rgba(160,140,90,0.45)" stroke="rgba(220,200,120,0.25)" strokeWidth={0.8} rx={1} />
        {/* Corner towers */}
        {[[-0.42, -0.55], [0.42, -0.55], [-0.42, -0.28], [0.42, -0.28]].map(([dx, dy], i) => (
          <rect key={i} x={cx + dx * r - r * 0.07} y={cy + dy * r} width={r * 0.14} height={r * 0.32} fill="rgba(170,150,100,0.50)" stroke="rgba(220,200,120,0.20)" strokeWidth={0.6} />
        ))}
        {/* Tower caps */}
        {[[-0.42, -0.67], [0.42, -0.67]].map(([dx, dy], i) => (
          <polygon key={i} points={`${cx + dx * r},${cy + dy * r} ${cx + dx * r - r * 0.08},${cy + (dy + 0.12) * r} ${cx + dx * r + r * 0.08},${cy + (dy + 0.12) * r}`} fill="rgba(200,50,50,0.45)" />
        ))}
        {/* Battlements */}
        {[-0.30, -0.16, -0.02, 0.12, 0.26].map((dx, i) => (
          <rect key={i} x={cx + dx * r} y={cy - r * 0.38} width={r * 0.08} height={r * 0.12} fill="rgba(180,160,100,0.50)" />
        ))}
        {/* Gate */}
        <path d={`M${cx - r * 0.14},${cy + r * 0.30} A${r * 0.14},${r * 0.16} 0 0,1 ${cx + r * 0.14},${cy + r * 0.30} L${cx + r * 0.14},${cy + r * 0.10} A${r * 0.14},${r * 0.16} 0 0,0 ${cx - r * 0.14},${cy + r * 0.10} Z`}
          fill="rgba(15,12,8,0.75)" />
        {/* Windows */}
        <rect x={cx - r * 0.30} y={cy - r * 0.15} width={r * 0.09} height={r * 0.11} fill="rgba(240,210,100,0.38)" rx={1} />
        <rect x={cx + r * 0.22} y={cy - r * 0.15} width={r * 0.09} height={r * 0.11} fill="rgba(240,210,100,0.38)" rx={1} />
        {/* Flag */}
        <line x1={cx} y1={cy - r * 0.28} x2={cx} y2={cy - r * 0.72} stroke="rgba(180,160,80,0.50)" strokeWidth={0.8} />
        <polygon points={`${cx},${cy - r * 0.72} ${cx + r * 0.14},${cy - r * 0.62} ${cx},${cy - r * 0.52}`} fill="rgba(200,50,50,0.55)" />
      </>
    ),
  },
  halfelf: {
    emoji: '🌙', color: '#c090e8', glow: '#9B59B6',
    bgGrad: ['rgba(120,60,180,0.28)', 'rgba(50,20,80,0.10)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Half-elf: blend of elven spires and human walls */}
        <rect x={cx - r * 0.35} y={cy - r * 0.20} width={r * 0.70} height={r * 0.50} fill="rgba(100,60,150,0.40)" stroke="rgba(180,130,220,0.25)" strokeWidth={0.7} rx={2} />
        {/* Curved elven arches */}
        <path d={`M${cx - r * 0.35},${cy - r * 0.20} Q${cx},${cy - r * 0.50} ${cx + r * 0.35},${cy - r * 0.20}`}
          fill="none" stroke="rgba(180,130,220,0.45)" strokeWidth={1.0} />
        {/* Central spire */}
        <line x1={cx} y1={cy - r * 0.50} x2={cx} y2={cy - r * 0.78} stroke="rgba(180,130,220,0.55)" strokeWidth={r * 0.055} />
        <polygon points={`${cx},${cy - r * 0.88} ${cx - r * 0.07},${cy - r * 0.70} ${cx + r * 0.07},${cy - r * 0.70}`} fill="rgba(200,150,240,0.55)" />
        {/* Side spires */}
        <line x1={cx - r * 0.25} y1={cy - r * 0.38} x2={cx - r * 0.25} y2={cy - r * 0.55} stroke="rgba(160,110,200,0.45)" strokeWidth={r * 0.040} />
        <polygon points={`${cx - r * 0.25},${cy - r * 0.60} ${cx - r * 0.30},${cy - r * 0.52} ${cx - r * 0.20},${cy - r * 0.52}`} fill="rgba(180,130,220,0.45)" />
        <line x1={cx + r * 0.25} y1={cy - r * 0.38} x2={cx + r * 0.25} y2={cy - r * 0.55} stroke="rgba(160,110,200,0.45)" strokeWidth={r * 0.040} />
        <polygon points={`${cx + r * 0.25},${cy - r * 0.60} ${cx + r * 0.20},${cy - r * 0.52} ${cx + r * 0.30},${cy - r * 0.52}`} fill="rgba(180,130,220,0.45)" />
        {/* Gate */}
        <path d={`M${cx - r * 0.12},${cy + r * 0.30} A${r * 0.12},${r * 0.16} 0 0,1 ${cx + r * 0.12},${cy + r * 0.30} L${cx + r * 0.12},${cy + r * 0.10} A${r * 0.12},${r * 0.16} 0 0,0 ${cx - r * 0.12},${cy + r * 0.10} Z`}
          fill="rgba(15,8,25,0.70)" />
        {/* Magic runes */}
        <circle cx={cx - r * 0.30} cy={cy + r * 0.05} r={r * 0.04} fill="rgba(200,150,240,0.50)" />
        <circle cx={cx + r * 0.30} cy={cy + r * 0.05} r={r * 0.04} fill="rgba(200,150,240,0.50)" />
      </>
    ),
  },
  orc: {
    emoji: '⚔️', color: '#e85050', glow: '#E74C3C',
    bgGrad: ['rgba(150,30,30,0.30)', 'rgba(60,10,10,0.12)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Orc war camp — brutalist stronghold */}
        <rect x={cx - r * 0.42} y={cy - r * 0.22} width={r * 0.84} height={r * 0.52} fill="rgba(80,40,30,0.55)" stroke="rgba(180,60,40,0.30)" strokeWidth={0.8} rx={1} />
        {/* Crude palisade spikes */}
        {[-0.36, -0.22, -0.08, 0.06, 0.20, 0.34].map((dx, i) => (
          <polygon key={i} points={`${cx + dx * r},${cy - r * 0.42} ${cx + (dx - 0.06) * r},${cy - r * 0.22} ${cx + (dx + 0.06) * r},${cy - r * 0.22}`}
            fill="rgba(100,55,35,0.55)" stroke="rgba(140,70,40,0.25)" strokeWidth={0.5} />
        ))}
        {/* War banner */}
        <line x1={cx} y1={cy - r * 0.22} x2={cx} y2={cy - r * 0.68} stroke="rgba(120,40,30,0.60)" strokeWidth={r * 0.055} />
        <rect x={cx} y={cy - r * 0.68} width={r * 0.18} height={r * 0.14} fill="rgba(200,50,40,0.60)" />
        {/* Skull decoration on gate */}
        <circle cx={cx} cy={cy - r * 0.06} r={r * 0.07} fill="rgba(230,220,200,0.35)" />
        <rect x={cx - r * 0.10} y={cy + r * 0.10} width={r * 0.20} height={r * 0.20} fill="rgba(15,8,5,0.75)" />
        {/* Iron bars */}
        <line x1={cx - r * 0.06} y1={cy + r * 0.10} x2={cx - r * 0.06} y2={cy + r * 0.30} stroke="rgba(80,80,80,0.50)" strokeWidth={0.7} />
        <line x1={cx + r * 0.06} y1={cy + r * 0.10} x2={cx + r * 0.06} y2={cy + r * 0.30} stroke="rgba(80,80,80,0.50)" strokeWidth={0.7} />
        {/* Fire braziers */}
        <circle cx={cx - r * 0.34} cy={cy - r * 0.30} r={r * 0.05} fill="rgba(255,140,20,0.55)" />
        <circle cx={cx + r * 0.34} cy={cy - r * 0.30} r={r * 0.05} fill="rgba(255,140,20,0.55)" />
      </>
    ),
  },
  giant: {
    emoji: '🗿', color: '#a0b4c8', glow: '#2C3E50',
    bgGrad: ['rgba(60,80,100,0.30)', 'rgba(20,30,45,0.12)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Giant: massive megalithic ruins/settlement */}
        {/* Standing stones */}
        <rect x={cx - r * 0.42} y={cy - r * 0.55} width={r * 0.12} height={r * 0.75} fill="rgba(90,110,130,0.55)" stroke="rgba(140,160,180,0.25)" strokeWidth={0.7} rx={1} />
        <rect x={cx + r * 0.30} y={cy - r * 0.50} width={r * 0.12} height={r * 0.70} fill="rgba(90,110,130,0.50)" stroke="rgba(140,160,180,0.22)" strokeWidth={0.7} rx={1} />
        <rect x={cx - r * 0.18} y={cy - r * 0.65} width={r * 0.14} height={r * 0.82} fill="rgba(100,120,140,0.58)" stroke="rgba(150,170,190,0.28)" strokeWidth={0.8} rx={1} />
        {/* Lintel (horizontal capstone) */}
        <rect x={cx - r * 0.48} y={cy - r * 0.60} width={r * 0.58} height={r * 0.10} fill="rgba(110,130,150,0.55)" stroke="rgba(160,180,200,0.22)" strokeWidth={0.6} rx={1} />
        {/* Central altar/throne */}
        <rect x={cx + r * 0.02} y={cy - r * 0.30} width={r * 0.26} height={r * 0.50} fill="rgba(80,100,120,0.50)" stroke="rgba(130,150,170,0.22)" strokeWidth={0.6} rx={1} />
        <rect x={cx + r * 0.04} y={cy - r * 0.38} width={r * 0.22} height={r * 0.10} fill="rgba(90,110,130,0.55)" rx={1} />
        {/* Carved runes on stones */}
        <line x1={cx - r * 0.36} y1={cy - r * 0.30} x2={cx - r * 0.36} y2={cy - r * 0.10} stroke="rgba(180,200,220,0.20)" strokeWidth={0.5} />
        <line x1={cx - r * 0.32} y1={cy - r * 0.24} x2={cx - r * 0.40} y2={cy - r * 0.24} stroke="rgba(180,200,220,0.18)" strokeWidth={0.5} />
        {/* Ground platform */}
        <ellipse cx={cx} cy={cy + r * 0.30} rx={r * 0.50} ry={r * 0.08} fill="rgba(70,90,110,0.30)" />
      </>
    ),
  },
  goblin: {
    emoji: '🍄', color: '#50d870', glow: '#27AE60',
    bgGrad: ['rgba(30,120,50,0.28)', 'rgba(10,50,20,0.10)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Goblin: chaotic shantytown of mushrooms and scrap */}
        {/* Mushroom houses */}
        <ellipse cx={cx - r * 0.25} cy={cy - r * 0.30} rx={r * 0.20} ry={r * 0.25} fill="rgba(180,60,60,0.50)" />
        <rect x={cx - r * 0.32} y={cy - r * 0.05} width={r * 0.16} height={r * 0.25} fill="rgba(200,180,150,0.45)" rx={1} />
        <ellipse cx={cx + r * 0.22} cy={cy - r * 0.25} rx={r * 0.17} ry={r * 0.22} fill="rgba(80,160,60,0.50)" />
        <rect x={cx + r * 0.15} y={cy - r * 0.03} width={r * 0.14} height={r * 0.22} fill="rgba(190,170,140,0.42)" rx={1} />
        {/* Tall mushroom tower */}
        <ellipse cx={cx} cy={cy - r * 0.42} rx={r * 0.22} ry={r * 0.30} fill="rgba(220,180,60,0.52)" />
        <ellipse cx={cx} cy={cy - r * 0.42} rx={r * 0.16} ry={r * 0.24} fill="rgba(240,210,80,0.30)" />
        <rect x={cx - r * 0.08} y={cy - r * 0.14} width={r * 0.16} height={r * 0.34} fill="rgba(210,190,160,0.48)" rx={1} />
        {/* White spots on mushroom */}
        <circle cx={cx - r * 0.06} cy={cy - r * 0.46} r={r * 0.04} fill="rgba(255,255,255,0.35)" />
        <circle cx={cx + r * 0.08} cy={cy - r * 0.38} r={r * 0.03} fill="rgba(255,255,255,0.30)" />
        {/* Rickety gate */}
        <line x1={cx - r * 0.10} y1={cy + r * 0.18} x2={cx - r * 0.10} y2={cy + r * 0.36} stroke="rgba(100,70,30,0.55)" strokeWidth={0.9} />
        <line x1={cx + r * 0.10} y1={cy + r * 0.18} x2={cx + r * 0.10} y2={cy + r * 0.36} stroke="rgba(100,70,30,0.55)" strokeWidth={0.9} />
        <line x1={cx - r * 0.12} y1={cy + r * 0.24} x2={cx + r * 0.12} y2={cy + r * 0.24} stroke="rgba(100,70,30,0.45)" strokeWidth={0.7} />
        {/* Lanterns */}
        <circle cx={cx - r * 0.38} cy={cy + r * 0.10} r={r * 0.05} fill="rgba(255,200,50,0.50)" />
        <circle cx={cx + r * 0.36} cy={cy + r * 0.15} r={r * 0.04} fill="rgba(255,180,40,0.45)" />
      </>
    ),
  },
  halforc: {
    emoji: '🛡️', color: '#a0b0a8', glow: '#7F8C8D',
    bgGrad: ['rgba(80,100,90,0.28)', 'rgba(30,45,38,0.12)'],
    architecture: (cx, cy, r) => (
      <>
        {/* Half-orc: disciplined fortified camp, between orcish and human */}
        <rect x={cx - r * 0.40} y={cy - r * 0.24} width={r * 0.80} height={r * 0.54} fill="rgba(70,85,75,0.50)" stroke="rgba(130,150,135,0.28)" strokeWidth={0.8} rx={2} />
        {/* Reinforced battlements — neat */}
        {[-0.34, -0.20, -0.06, 0.08, 0.22].map((dx, i) => (
          <rect key={i} x={cx + dx * r} y={cy - r * 0.34} width={r * 0.09} height={r * 0.12} fill="rgba(90,108,95,0.55)" rx={1} />
        ))}
        {/* Corner watchtowers */}
        <rect x={cx - r * 0.44} y={cy - r * 0.44} width={r * 0.10} height={r * 0.24} fill="rgba(80,100,85,0.55)" rx={1} />
        <rect x={cx + r * 0.34} y={cy - r * 0.44} width={r * 0.10} height={r * 0.24} fill="rgba(80,100,85,0.55)" rx={1} />
        {/* Shield emblem on gate */}
        <polygon points={`${cx},${cy - r * 0.20} ${cx - r * 0.10},${cy - r * 0.12} ${cx - r * 0.10},${cy + r * 0.04} ${cx},${cy + r * 0.10} ${cx + r * 0.10},${cy + r * 0.04} ${cx + r * 0.10},${cy - r * 0.12}`}
          fill="rgba(100,130,110,0.55)" stroke="rgba(150,180,155,0.30)" strokeWidth={0.7} />
        {/* Gate */}
        <rect x={cx - r * 0.12} y={cy + r * 0.10} width={r * 0.24} height={r * 0.20} fill="rgba(12,16,14,0.72)" rx={1} />
        {/* Torch lights */}
        <circle cx={cx - r * 0.34} cy={cy - r * 0.28} r={r * 0.045} fill="rgba(255,160,40,0.52)" />
        <circle cx={cx + r * 0.34} cy={cy - r * 0.28} r={r * 0.045} fill="rgba(255,160,40,0.52)" />
        {/* Standard */}
        <line x1={cx} y1={cy - r * 0.24} x2={cx} y2={cy - r * 0.58} stroke="rgba(120,140,125,0.50)" strokeWidth={0.9} />
        <rect x={cx} y={cy - r * 0.58} width={r * 0.14} height={r * 0.10} fill="rgba(100,130,110,0.55)" />
      </>
    ),
  },
};

// ── Component ────────────────────────────────────────────────────

type Props = {
  board: HexCell[];
  onPlaceTile: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile: (coord: HexCoord) => void;
  dragTerrain: TerrainType | null;
  raceId?: RaceId;
  onResetBoard?: () => void;
};

export function HexBoard({ board, onPlaceTile, onRemoveTile, dragTerrain, raceId, onResetBoard }: Props) {
  const t = useI18n(s => s.t);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverCoord, setHoverCoord] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 500 });

  const [zoom, setZoom] = useState(1);
  const [rotateX, setRotateX] = useState(30);
  const [rotateZ, setRotateZ] = useState(0);
  const isDraggingRotation = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const hexSize = useMemo(() => {
    const GRID_COLS = 6.5;
    const GRID_ROWS = 6.5;
    const sizeByWidth  = containerSize.w / (Math.sqrt(3) * GRID_COLS);
    const sizeByHeight = containerSize.h / (2 * GRID_ROWS);
    return Math.max(24, Math.min(sizeByWidth, sizeByHeight));
  }, [containerSize]);

  const maxDepth = 16;
  const padding = hexSize * 2;
  const allPositions = board.map(c => hexToPixel(c.coord.q, c.coord.r, hexSize));
  const minX = Math.min(...allPositions.map(p => p.x)) - padding;
  const maxX = Math.max(...allPositions.map(p => p.x)) + padding;
  const minY = Math.min(...allPositions.map(p => p.y)) - padding - maxDepth;
  const maxY = Math.max(...allPositions.map(p => p.y)) + padding + maxDepth;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const coordKey = (c: HexCoord) => `${c.q},${c.r}`;

  const handleRotationPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      e.preventDefault();
      isDraggingRotation.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const handleRotationPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRotation.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setRotateZ(prev => Math.max(-45, Math.min(45, prev + dx * 0.3)));
    setRotateX(prev => Math.max(10, Math.min(70, prev - dy * 0.3)));
  }, []);

  const handleRotationPointerUp = useCallback(() => {
    isDraggingRotation.current = false;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.max(0.6, Math.min(2.0, prev - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (coord: HexCoord, e: React.DragEvent) => {
      e.preventDefault();
      const terrain = e.dataTransfer.getData('terrain') as TerrainType;
      if (terrain) onPlaceTile(coord, terrain);
    },
    [onPlaceTile],
  );

  return (
    <div id="hex-board" className="relative select-none overflow-hidden w-full h-full" ref={containerRef}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
        <button type="button" onClick={() => setZoom(prev => Math.min(2.0, prev + 0.15))}
          className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary transition-colors text-sm font-bold"
          title="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(prev => Math.max(0.6, prev - 0.15))}
          className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary transition-colors text-sm font-bold"
          title="Zoom out">−</button>
        <div className="h-px bg-border-medium my-0.5" />
        <button type="button" onClick={() => { setRotateX(30); setRotateZ(0); setZoom(1); }}
          className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary transition-colors"
          title="Reset view">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        {onResetBoard && (
          <>
            <div className="h-px bg-border-medium my-0.5" />
            <button type="button" onClick={onResetBoard}
              className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-game-accent hover:border-game-accent/40 transition-colors"
              title={t.hexBoard.resetBoard}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="absolute bottom-1 left-2 z-20 text-text-faint text-[9px] pointer-events-none hidden sm:block">
        Shift+drag · Scroll zoom
      </div>

      {/* 3D perspective wrapper */}
      <div className="w-full h-full"
        style={{ perspective: '1000px', perspectiveOrigin: '50% 35%' }}
        onPointerDown={handleRotationPointerDown}
        onPointerMove={handleRotationPointerMove}
        onPointerUp={handleRotationPointerUp}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="w-full h-full"
          style={{
            transform: `rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${zoom})`,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            transition: isDraggingRotation.current ? 'none' : 'transform 0.3s ease-out',
            willChange: 'transform',
          }}
        >
          <svg ref={svgRef} viewBox={viewBox} className="w-full h-full hex-board-svg"
            style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
          >
            <defs>
              <radialGradient id="boardGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245,197,24,0.12)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <filter id="hexShadow">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.6)" />
              </filter>

              {/* Smooth radial terrain face gradients — no horizontal lines */}
              <radialGradient id="grad-plain" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#e8c858" />
                <stop offset="55%" stopColor="#c8a030" />
                <stop offset="100%" stopColor="#6a4808" stopOpacity={0.8} />
              </radialGradient>
              <radialGradient id="grad-mountain" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#6878a0" />
                <stop offset="55%" stopColor="#485868" />
                <stop offset="100%" stopColor="#1a2230" stopOpacity={0.85} />
              </radialGradient>
              <radialGradient id="grad-forest" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#257838" />
                <stop offset="55%" stopColor="#1a5e2a" />
                <stop offset="100%" stopColor="#082810" stopOpacity={0.85} />
              </radialGradient>
              <radialGradient id="grad-swamp" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#307878" />
                <stop offset="55%" stopColor="#205858" />
                <stop offset="100%" stopColor="#0a2020" stopOpacity={0.85} />
              </radialGradient>
              <radialGradient id="grad-road" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#a08030" />
                <stop offset="55%" stopColor="#806020" />
                <stop offset="100%" stopColor="#302008" stopOpacity={0.85} />
              </radialGradient>

              <radialGradient id="village-glow" cx="50%" cy="40%" r="55%">
                <stop offset="0%" stopColor="rgba(245,197,24,0.30)" />
                <stop offset="60%" stopColor="rgba(245,197,24,0.10)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>


              {/* Filters */}
              <filter id="terrain-relief" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="rgba(0,0,0,0.50)" />
              </filter>
              <filter id="terrain-relief-high" x="-10%" y="-10%" width="120%" height="140%">
                <feDropShadow dx="1" dy="5" stdDeviation="3" floodColor="rgba(0,0,0,0.60)" />
                <feDropShadow dx="-0.5" dy="-0.5" stdDeviation="0.8" floodColor="rgba(255,255,255,0.10)" />
              </filter>
              <filter id="terrain-relief-swamp" x="-8%" y="-8%" width="116%" height="125%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="rgba(0,0,0,0.40)" />
              </filter>
              <filter id="village-relief" x="-15%" y="-15%" width="130%" height="145%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(0,0,0,0.55)" />
                <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="rgba(245,197,24,0.22)" />
              </filter>
              <filter id="terrainGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(0,0,0,0.9)" />
              </filter>
            </defs>

            {/* Board ambient glow */}
            <circle cx="0" cy="0" r={hexSize * 7} fill="url(#boardGlow)" />

            {/* Ground plane shadow circle */}
            <ellipse cx="0" cy={hexSize * 0.5} rx={hexSize * 6} ry={hexSize * 2.5}
              fill="rgba(0,0,0,0.25)" style={{ filter: 'blur(8px)' }} />

            {/* Hexes sorted back-to-front for 3D overlap */}
            {[...board]
              .sort((a, b) => {
                if (a.coord.r !== b.coord.r) return a.coord.r - b.coord.r;
                return a.coord.q - b.coord.q;
              })
              .map(cell => {
                const { x, y } = hexToPixel(cell.coord.q, cell.coord.r, hexSize);
                const key = coordKey(cell.coord);
                const isHovered = hoverCoord === key;
                const isEmpty = cell.terrain === null;
                const innerSize = hexSize * 0.92;
                const terrain = cell.terrain;

                // Compute grouping factor: more same-terrain neighbors = taller/deeper
                const neighborCount = terrain ? getNeighborCount(board, cell, terrain) : 0;
                const groupFactor = terrain ? 1 + neighborCount * 0.28 : 1;
                const depth = terrain ? TERRAIN_BASE_DEPTH[terrain] * groupFactor : 0;
                const yTop = isEmpty ? y : y - depth;

                // Road connections for path drawing
                const roadNeighbors = terrain === 'road' ? getRoadConnections(board, cell) : [];
                const centerAdj = terrain === 'road' ? isAdjacentToCenter(board, cell) : { adjacent: false, edge: -1 };
                const borderEdges = terrain === 'road' ? getBorderEdges(board, cell) : [];
                // Collect all edges a road should emit a lane to
                const roadEdges: { edge: number; kind: 'road' | 'center' | 'border' }[] = [];
                for (const e of roadNeighbors) roadEdges.push({ edge: e, kind: 'road' });
                if (centerAdj.adjacent) roadEdges.push({ edge: centerAdj.edge, kind: 'center' });
                for (const e of borderEdges) roadEdges.push({ edge: e, kind: 'border' });
                const verts = hexVertices(x, yTop, hexSize);

                // Terrain label text — localized
                const terrainLabel = terrain ? t.terrain[terrain] : '';
                const labelColor = terrain ? TERRAIN_COLORS[terrain].labelColor : '#fff';

                return (
                  <g key={key}
                    onDragOver={isEmpty ? handleDragOver : undefined}
                    onDrop={isEmpty ? (e) => handleDrop(cell.coord, e) : undefined}
                    onMouseEnter={() => setHoverCoord(key)}
                    onMouseLeave={() => setHoverCoord(null)}
                    onClick={() => {
                      if (!isEmpty) onRemoveTile(cell.coord);
                      else if (dragTerrain) onPlaceTile(cell.coord, dragTerrain);
                    }}
                    style={{ cursor: isEmpty ? (dragTerrain ? 'pointer' : 'default') : 'pointer' }}
                  >
                    {/* 3D side faces */}
                    {!isEmpty && depth > 0 && (
                      <>
                        {hexSidePaths(x, yTop, hexSize, depth).map((d, i) => (
                          <path key={`side-${i}`} d={d}
                            fill={TERRAIN_SIDE_COLOR[terrain!]}
                            stroke="rgba(0,0,0,0.35)"
                            strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }}
                          />
                        ))}
                        {/* Side highlight for light direction */}
                        {hexSidePaths(x, yTop, hexSize * 0.99, depth).slice(0, 1).map((d, i) => (
                          <path key={`side-hl-${i}`} d={d}
                            fill="rgba(255,255,255,0.08)"
                            style={{ pointerEvents: 'none' }}
                          />
                        ))}
                      </>
                    )}

                    {/* Empty cell base */}
                    {isEmpty && (
                      <path d={hexPath(x, y, hexSize)}
                        fill={LEVEL_COLORS[cell.level]}
                        stroke={isHovered && dragTerrain ? 'rgba(245,197,24,0.8)' : 'rgba(255,255,255,0.07)'}
                        strokeWidth={isHovered ? 2 : 0.8}
                        filter={cell.level === 0 && raceId ? 'url(#village-relief)' : 'url(#hexShadow)'}
                        style={{ transition: 'stroke 0.2s, stroke-width 0.15s' }}
                      />
                    )}

                    {/* Placed terrain top face — smooth radial gradient, no pattern lines */}
                    {!isEmpty && (() => {
                      const cellClipId = `cell-clip-${key}`;
                      return (
                        <>
                          <defs>
                            <clipPath id={cellClipId}>
                              <path d={hexPath(x, yTop, hexSize)} />
                            </clipPath>
                          </defs>
                          <path d={hexPath(x, yTop, hexSize)}
                            fill={`url(#grad-${terrain})`}
                            stroke={isHovered ? 'rgba(255,255,255,0.6)' : TERRAIN_COLORS[terrain!].stroke}
                            strokeWidth={isHovered ? 2 : 1.0}
                            style={{ transition: 'stroke 0.2s, stroke-width 0.15s' }}
                          />
                          {/* Inner bevel highlight */}
                          <path d={hexPath(x, yTop, innerSize)}
                            fill="none"
                            stroke="rgba(255,255,255,0.18)"
                            strokeWidth={0.7}
                            style={{ pointerEvents: 'none' }}
                          />
                          {/* Inline terrain relief graphics — clipped to hex face */}
                          {terrain !== 'road' && (
                            <g clipPath={`url(#${cellClipId})`} style={{ pointerEvents: 'none' }}>
                              <TerrainRelief
                                terrain={terrain!}
                                cx={x}
                                cy={yTop}
                                size={hexSize}
                                neighborCount={neighborCount}
                              />
                            </g>
                          )}
                        </>
                      );
                    })()}

                    {/* Road connection paths — connects to adjacent roads, center, and border */}
                    {terrain === 'road' && (() => {
                      const roadClipId = `road-clip-${key}`;
                      // Helper: edge midpoint for a given edge index (edge i = between vert i and vert i+1)
                      const edgeMidpoint = (edge: number) => ({
                        x: (verts[edge].x + verts[(edge + 1) % 6].x) / 2,
                        y: (verts[edge].y + verts[(edge + 1) % 6].y) / 2,
                      });
                      // Lanes: each connected edge gets a road line from center to edge midpoint
                      const lanes = roadEdges.length > 0
                        ? roadEdges
                        : // Standalone road with no connections: use N-S straight road (edges 2 + 5)
                          [{ edge: 2, kind: 'border' as const }, { edge: 5, kind: 'border' as const }];

                      return (
                        <g style={{ pointerEvents: 'none' }}>
                          <defs>
                            <clipPath id={roadClipId}>
                              <path d={hexPath(x, yTop, hexSize * 1.02)} />
                            </clipPath>
                          </defs>
                          <g clipPath={`url(#${roadClipId})`}>
                            {/* Earthy road base circle */}
                            <circle cx={x} cy={yTop} r={hexSize * 0.55} fill="rgba(150,115,55,0.28)" />

                            {/* Grass verges — alongside each lane, drawn first (under the road) */}
                            {lanes.map(({ edge }, idx) => {
                              const mid = edgeMidpoint(edge);
                              const dx = mid.x - x, dy = mid.y - yTop;
                              const len = Math.sqrt(dx*dx+dy*dy) || 1;
                              const ux = dx/len, uy = dy/len;
                              const perpX = -uy, perpY = ux;
                              const offset = hexSize * 0.22;
                              return [1, -1].map(side => (
                                <line key={`verge-${idx}-${side}`}
                                  x1={x + perpX*offset*side} y1={yTop + perpY*offset*side}
                                  x2={mid.x + perpX*offset*side*0.7} y2={mid.y + perpY*offset*side*0.7}
                                  stroke="#3e5818" strokeWidth={hexSize*0.10} strokeLinecap="round" opacity={0.55}
                                />
                              ));
                            })}

                            {/* Road surface — one lane per connection, extending to edge midpoint */}
                            {lanes.map(({ edge, kind }, idx) => {
                              const mid = edgeMidpoint(edge);
                              // Extend slightly past the edge so lanes meet seamlessly at hex boundaries
                              const extX = x + (mid.x - x) * 1.04;
                              const extY = yTop + (mid.y - yTop) * 1.04;
                              return (
                                <g key={`lane-${idx}`}>
                                  {/* Dark outer shadow */}
                                  <line x1={x} y1={yTop} x2={extX} y2={extY}
                                    stroke="rgba(70,45,15,0.60)"
                                    strokeWidth={hexSize * 0.38}
                                    strokeLinecap="butt"
                                  />
                                  {/* Main road */}
                                  <line x1={x} y1={yTop} x2={extX} y2={extY}
                                    stroke={kind === 'center' ? 'rgba(180,140,75,0.80)' : 'rgba(160,122,62,0.75)'}
                                    strokeWidth={hexSize * 0.30}
                                    strokeLinecap="butt"
                                  />
                                  {/* Highlight centerline */}
                                  <line x1={x} y1={yTop} x2={extX} y2={extY}
                                    stroke="rgba(230,200,130,0.35)"
                                    strokeWidth={hexSize * 0.06}
                                    strokeLinecap="butt"
                                  />
                                  {/* Dashed path markers */}
                                  <line x1={x} y1={yTop} x2={extX} y2={extY}
                                    stroke="rgba(245,215,140,0.50)"
                                    strokeWidth={hexSize * 0.04}
                                    strokeLinecap="butt"
                                    strokeDasharray={`${hexSize*0.10},${hexSize*0.08}`}
                                  />
                                </g>
                              );
                            })}

                            {/* Cobblestones along each lane — scattered to suggest paving */}
                            {lanes.map(({ edge }, idx) => {
                              const mid = edgeMidpoint(edge);
                              const dx = mid.x - x, dy = mid.y - yTop;
                              const len = Math.sqrt(dx*dx+dy*dy) || 1;
                              const ux = dx/len, uy = dy/len;
                              const perpX = -uy, perpY = ux;
                              return [0.30, 0.55, 0.80].map((t, k) => {
                                const px = x + dx*t;
                                const py = yTop + dy*t;
                                const sideOff = (k % 2 === 0 ? 1 : -1) * hexSize * 0.06;
                                return (
                                  <ellipse key={`cob-${idx}-${k}`}
                                    cx={px + perpX*sideOff} cy={py + perpY*sideOff}
                                    rx={hexSize*0.055} ry={hexSize*0.035}
                                    fill={k % 2 === 0 ? 'rgba(200,165,90,0.55)' : 'rgba(175,140,70,0.55)'}
                                    stroke="rgba(70,50,20,0.35)" strokeWidth={0.4}
                                    transform={`rotate(${Math.atan2(dy,dx)*180/Math.PI},${px + perpX*sideOff},${py + perpY*sideOff})`}
                                  />
                                );
                              });
                            })}

                            {/* Intersection hub — only if 2+ lanes meet */}
                            {lanes.length >= 2 && (
                              <>
                                <circle cx={x} cy={yTop} r={hexSize * 0.20}
                                  fill="rgba(185,148,78,0.80)"
                                  stroke="rgba(70,45,15,0.70)"
                                  strokeWidth={0.8}
                                />
                                <circle cx={x} cy={yTop} r={hexSize * 0.14}
                                  fill="rgba(210,180,110,0.50)"
                                  stroke="rgba(240,210,140,0.50)"
                                  strokeWidth={0.5}
                                />
                                {/* Radial cobbles at hub — for 3-way+ all-to-all crossings */}
                                {lanes.length >= 3 && lanes.map(({ edge }, idx) => {
                                  const mid = edgeMidpoint(edge);
                                  const dx = mid.x - x, dy = mid.y - yTop;
                                  const len = Math.sqrt(dx*dx+dy*dy) || 1;
                                  const ux = dx/len, uy = dy/len;
                                  return (
                                    <ellipse key={`hubcob-${idx}`}
                                      cx={x + ux*hexSize*0.12} cy={yTop + uy*hexSize*0.12}
                                      rx={hexSize*0.045} ry={hexSize*0.028}
                                      fill="rgba(190,155,85,0.70)"
                                      stroke="rgba(70,50,20,0.40)" strokeWidth={0.3}
                                      transform={`rotate(${Math.atan2(dy,dx)*180/Math.PI},${x + ux*hexSize*0.12},${yTop + uy*hexSize*0.12})`}
                                    />
                                  );
                                })}
                              </>
                            )}
                          </g>
                        </g>
                      );
                    })()}

                    {/* Terrain name label */}
                    {!isEmpty && (
                      <text
                        x={x} y={yTop + hexSize * 0.40}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={hexSize * 0.22}
                        fill={labelColor}
                        fontWeight="800"
                        fontFamily="serif"
                        letterSpacing="0.06em"
                        opacity={0.95}
                        style={{ pointerEvents: 'none', filter: 'url(#textShadow)' }}
                      >
                        {terrainLabel}
                      </text>
                    )}

                    {/* Center village hex — race-specific architecture */}
                    {isEmpty && cell.level === 0 && (
                      <>
                        {raceId && RACE_VILLAGE[raceId] ? (
                          <>
                            {/* Radial city glow background */}
                            <radialGradient id={`city-glow-${raceId}`} cx="50%" cy="45%" r="55%">
                              <stop offset="0%" stopColor={RACE_VILLAGE[raceId].bgGrad[0]} />
                              <stop offset="70%" stopColor={RACE_VILLAGE[raceId].bgGrad[1]} />
                              <stop offset="100%" stopColor="transparent" />
                            </radialGradient>
                            <path d={hexPath(x, y, hexSize)}
                              fill={`url(#city-glow-${raceId})`}
                              style={{ pointerEvents: 'none' }}
                            />
                            {/* Architecture SVG rendered inline */}
                            {RACE_VILLAGE[raceId].architecture(x, y, hexSize)}
                            {/* Kingdom label */}
                            <text x={x} y={y + hexSize * 0.48}
                              textAnchor="middle" dominantBaseline="central"
                              fontSize={hexSize * 0.22}
                              fill={RACE_VILLAGE[raceId].color}
                              fontWeight="bold"
                              fontFamily="serif"
                              opacity={0.80}
                              style={{ pointerEvents: 'none', letterSpacing: '0.06em', filter: 'url(#textShadow)' }}
                            >
                              {t.hexBoard.yourKingdom}
                            </text>
                          </>
                        ) : (
                          <>
                            <path d={hexPath(x, y, innerSize)}
                              fill="url(#village-glow)"
                              style={{ pointerEvents: 'none' }}
                            />
                            <text x={x} y={y + 1}
                              textAnchor="middle" dominantBaseline="central"
                              fontSize={hexSize * 0.3}
                              fill="rgba(245,197,24,0.30)"
                              fontWeight="bold"
                              style={{ pointerEvents: 'none' }}
                            >
                              {t.hexBoard.yourKingdom}
                            </text>
                          </>
                        )}
                      </>
                    )}

                    {/* Drop hover highlight */}
                    {isEmpty && isHovered && dragTerrain && (
                      <path d={hexPath(x, y, innerSize)}
                        fill="rgba(245,197,24,0.18)"
                        stroke="rgba(245,197,24,0.65)"
                        strokeWidth={1.5}
                        strokeDasharray="4,2.5"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}

                    {/* Hover glow on placed tiles */}
                    {!isEmpty && isHovered && (
                      <path d={hexPath(x, yTop, hexSize)}
                        fill="rgba(255,255,255,0.10)"
                        stroke="rgba(255,220,80,0.70)"
                        strokeWidth={2}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                  </g>
                );
              })}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Tile Hand ────────────────────────────────────────────────────

type TileHandProps = {
  tiles: Record<TerrainType, number>;
  placedCounts: Record<TerrainType, number>;
  selectedTerrain: TerrainType | null;
  onSelectTerrain: (terrain: TerrainType | null) => void;
};

export const TileHand = memo(function TileHand({ tiles, placedCounts, selectedTerrain, onSelectTerrain }: TileHandProps) {
  const t = useI18n(s => s.t);
  const terrains: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

  return (
    <div id="tile-hand">
      <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
        {t.hexBoard.availableTiles}
      </div>
      <div className="flex gap-2 flex-wrap items-end">
        {terrains.map((terrain, i) => {
          const available = tiles[terrain] - (placedCounts[terrain] ?? 0);
          if (tiles[terrain] === 0) return null;
          const isSelected = selectedTerrain === terrain;

          return (
            <button key={terrain} type="button"
              draggable={available > 0}
              onDragStart={e => {
                e.dataTransfer.setData('terrain', terrain);
                e.dataTransfer.effectAllowed = 'move';
                onSelectTerrain(terrain);
              }}
              onDragEnd={() => onSelectTerrain(null)}
              onClick={() => onSelectTerrain(isSelected ? null : (available > 0 ? terrain : null))}
              disabled={available <= 0}
              className={`flex flex-col items-center gap-0.5 rounded-lg p-1 transition-all ${
                isSelected
                  ? 'ring-2 ring-game-gold ring-offset-1 ring-offset-game-bg scale-110 bg-game-gold/10'
                  : available > 0
                    ? 'hover:scale-105 cursor-grab active:cursor-grabbing opacity-100'
                    : 'opacity-35 cursor-not-allowed'
              }`}
              style={{ outline: 'none' }}
            >
              <HexTile terrain={terrain} size={72} showCount={available} index={i} dimmed={available <= 0} />
              <span className={`text-xs font-semibold mt-1 ${isSelected ? 'text-game-gold' : 'text-text-primary'}`}>
                {t.terrain[terrain]}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-text-faint text-xs mt-2 italic">{t.hexBoard.dragHint}</p>
    </div>
  );
});

// ── Auto-assign ──────────────────────────────────────────────────

function autoAssignTiles(
  grid: HexCell[],
  tiles: Record<TerrainType, number>,
  raceId: RaceId,
): HexCell[] {
  const race = getRaceById(raceId);
  const favorable = race.favorableTerrain as TerrainType;
  const unfavorable = race.unfavorableTerrain as TerrainType;

  const pool: Record<TerrainType, number> = { ...tiles };
  const board = grid.map(c => ({ ...c, terrain: null as TerrainType | null }));
  const coordMap = new Map<string, number>();
  board.forEach((cell, i) => coordMap.set(`${cell.coord.q},${cell.coord.r}`, i));

  const key = (q: number, r: number) => `${q},${r}`;
  const getIdx = (q: number, r: number) => coordMap.get(key(q, r));
  const isCenter = (idx: number) => board[idx].coord.q === 0 && board[idx].coord.r === 0;

  function place(idx: number, terrain: TerrainType): boolean {
    if (isCenter(idx)) return false;
    if (board[idx].terrain !== null || pool[terrain] <= 0) return false;
    board[idx].terrain = terrain;
    pool[terrain]--;
    return true;
  }

  function neighborIdxs(idx: number): number[] {
    const { q, r } = board[idx].coord;
    const result: number[] = [];
    for (const d of HEX_DIRS) {
      const ni = getIdx(q + d.q, r + d.r);
      if (ni !== undefined) result.push(ni);
    }
    return result;
  }

  function adjacentCount(idx: number, terrain: TerrainType): number {
    return neighborIdxs(idx).filter(n => board[n].terrain === terrain).length;
  }

  const ring1 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 1);
  const ring2 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 2);
  const ring3 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 3);
  const allPlaceable = [...ring1, ...ring2, ...ring3];

  const productiveTerrains = (['plain', 'mountain', 'forest', 'swamp'] as const)
    .filter(t => pool[t] > 0)
    .sort((a, b) => race.terrainValues[b] - race.terrainValues[a]);

  if (pool.road > 0) {
    const dirPaths: { dir: typeof HEX_DIRS[0]; path: number[] }[] = [];
    for (const dir of HEX_DIRS) {
      const path: number[] = [];
      let q = dir.q, r = dir.r;
      for (let step = 0; step < 3; step++) {
        const idx = getIdx(q, r);
        if (idx !== undefined) path.push(idx);
        q += dir.q; r += dir.r;
      }
      if (path.length > 0 && board[path[path.length - 1]].level === 3) {
        dirPaths.push({ dir, path });
      }
    }
    dirPaths.sort((a, b) => b.path.length - a.path.length);
    for (const { path } of dirPaths) {
      if (pool.road < path.length) continue;
      let canPlace = true;
      for (const idx of path) { if (board[idx].terrain !== null) { canPlace = false; break; } }
      if (canPlace) for (const idx of path) place(idx, 'road');
    }
    for (const idx of allPlaceable) {
      if (pool.road <= 0) break;
      if (board[idx].terrain !== null) continue;
      if (adjacentCount(idx, 'road') > 0) place(idx, 'road');
    }
    for (const idx of [...allPlaceable].reverse()) {
      if (pool.road <= 0) break;
      if (board[idx].terrain === null) place(idx, 'road');
    }
  }

  function fillRing(ring: number[]) {
    for (const idx of ring) {
      if (board[idx].terrain !== null) continue;
      let bestTerrain: TerrainType | null = null;
      let bestScore = -Infinity;
      for (const terrain of productiveTerrains) {
        if (pool[terrain] <= 0) continue;
        let score = race.terrainValues[terrain];
        if (terrain === favorable) score += adjacentCount(idx, favorable) * 2;
        if (terrain === unfavorable) score -= adjacentCount(idx, unfavorable) * 2;
        if (score > bestScore) { bestScore = score; bestTerrain = terrain; }
      }
      if (bestTerrain) place(idx, bestTerrain);
    }
  }

  fillRing(ring1);
  fillRing(ring2);

  if (pool[favorable] > 0) {
    const queue: number[] = [];
    for (const idx of allPlaceable) {
      if (board[idx].terrain === favorable) {
        for (const n of neighborIdxs(idx)) {
          if (board[n].terrain === null && !isCenter(n)) queue.push(n);
        }
      }
    }
    if (queue.length === 0) {
      for (const idx of allPlaceable) {
        if (board[idx].terrain === null) { queue.push(idx); break; }
      }
    }
    const visited = new Set<number>(queue);
    while (queue.length > 0 && pool[favorable] > 0) {
      const idx = queue.shift()!;
      if (board[idx].terrain === null && !isCenter(idx)) place(idx, favorable);
      for (const nIdx of neighborIdxs(idx)) {
        if (!visited.has(nIdx) && board[nIdx].terrain === null && !isCenter(nIdx)) {
          visited.add(nIdx); queue.push(nIdx);
        }
      }
    }
  }

  if (pool[unfavorable] > 0) {
    const edgeFirst = [...allPlaceable].reverse();
    for (const idx of edgeFirst) {
      if (pool[unfavorable] <= 0) break;
      if (board[idx].terrain !== null) continue;
      if (adjacentCount(idx, unfavorable) === 0) place(idx, unfavorable);
    }
    for (const idx of edgeFirst) {
      if (pool[unfavorable] <= 0) break;
      if (board[idx].terrain === null) place(idx, unfavorable);
    }
  }

  const placed: Record<string, number> = { plain: 0, mountain: 0, forest: 0, swamp: 0 };
  for (const cell of board) {
    if (cell.terrain && cell.terrain !== 'road') placed[cell.terrain]++;
  }

  const terrainTypes = ['plain', 'mountain', 'forest', 'swamp'] as const;
  for (const terrain of terrainTypes) {
    while (placed[terrain] < 2 && pool[terrain] > 0) {
      for (const idx of allPlaceable) {
        if (board[idx].terrain === null) {
          if (place(idx, terrain)) { placed[terrain]++; break; }
        }
      }
      if (placed[terrain] < 2 && pool[terrain] <= 0) break;
    }
  }

  const remainingByValue = [...productiveTerrains]
    .filter(t => pool[t] > 0)
    .sort((a, b) => race.terrainValues[b] - race.terrainValues[a]);

  for (const idx of allPlaceable) {
    if (board[idx].terrain !== null) continue;
    let bestTerrain: TerrainType | null = null;
    for (const terrain of remainingByValue) {
      if (pool[terrain] <= 0) continue;
      if (placed[terrain] >= 8) continue;
      bestTerrain = terrain; break;
    }
    if (!bestTerrain) {
      for (const terrain of remainingByValue) {
        if (pool[terrain] > 0) { bestTerrain = terrain; break; }
      }
    }
    if (bestTerrain && place(idx, bestTerrain)) placed[bestTerrain]++;
  }

  return board;
}

// ── Hook ─────────────────────────────────────────────────────────

const EMPTY_BOARD = HEX_GRID.map(c => ({ ...c, terrain: null as TerrainType | null }));

export function useHexBoard(tileInventory?: Record<TerrainType, number>) {
  const [board, setBoard] = useState<HexCell[]>(() => EMPTY_BOARD.map(c => ({ ...c })));
  const historyRef = useRef<HexCell[][]>([]);
  const inventoryRef = useRef(tileInventory);
  inventoryRef.current = tileInventory;

  const applyBoard = useCallback((prev: HexCell[], next: HexCell[]): HexCell[] => {
    if (next === prev) return prev;
    historyRef.current = [...historyRef.current.slice(-19), prev];
    return next;
  }, []);

  const placeTile = useCallback((coord: HexCoord, terrain: TerrainType) => {
    setBoard(prev => {
      if (inventoryRef.current) {
        const placedOfType = prev.filter(c => c.terrain === terrain).length;
        if (placedOfType >= inventoryRef.current[terrain]) return prev;
      }
      const next = prev.map(cell =>
        cell.coord.q === coord.q && cell.coord.r === coord.r && cell.terrain === null
          ? { ...cell, terrain }
          : cell,
      );
      return applyBoard(prev, next);
    });
  }, [applyBoard]);

  const removeTile = useCallback((coord: HexCoord) => {
    setBoard(prev => {
      const next = prev.map(cell =>
        cell.coord.q === coord.q && cell.coord.r === coord.r
          ? { ...cell, terrain: null }
          : cell,
      );
      return applyBoard(prev, next);
    });
  }, [applyBoard]);

  const resetBoard = useCallback(() => {
    setBoard(prev => {
      const next = EMPTY_BOARD.map(c => ({ ...c }));
      historyRef.current = [...historyRef.current.slice(-19), prev];
      return next;
    });
  }, []);

  const autoAssign = useCallback((raceId: RaceId) => {
    if (!inventoryRef.current) return;
    const tiles = inventoryRef.current;
    const newBoard = autoAssignTiles(HEX_GRID, tiles, raceId);
    setBoard(prev => {
      historyRef.current = [...historyRef.current.slice(-19), prev];
      return newBoard;
    });
  }, []);

  const undoLastTile = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) setBoard(prev);
  }, []);

  const canUndo = historyRef.current.length > 0;

  const placedCounts = useMemo(() => {
    const counts: Record<TerrainType, number> = { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 };
    for (const cell of board) {
      if (cell.terrain) counts[cell.terrain]++;
    }
    return counts;
  }, [board]);

  const totalPlaced = useMemo(
    () => Object.values(placedCounts).reduce((a, b) => a + b, 0),
    [placedCounts],
  );

  return { board, placeTile, removeTile, resetBoard, autoAssign, undoLastTile, canUndo, placedCounts, totalPlaced };
}

export { HEX_GRID, TERRAIN_COLORS };
