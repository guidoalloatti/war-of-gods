import { useState, useCallback, useRef, useEffect } from 'react';
import type { TerrainType, RaceId } from '@war-of-gods/engine';
import { getRaceById } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

// ── Hex grid math ────────────────────────────────────────────────
// Using axial coordinates (q, r) for pointy-top hexagons.
// Level 0 = center hex, Level 1 = ring of 6, Level 2 = ring of 12, Level 3 = ring of 18.

export type HexCoord = { q: number; r: number };
export type HexCell = {
  coord: HexCoord;
  level: number;
  terrain: TerrainType | null;
};

/** Generate all hex coordinates for a board with maxLevel rings (0-indexed). */
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

const HEX_GRID = generateHexGrid(3); // 37 hexes

/** Convert axial coords to pixel position (pointy-top) */
function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/** Generate pointy-top hexagon SVG path */
function hexPath(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

/** Compute hex vertices as array for reuse */
function hexVertices(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    verts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return verts;
}

/** Height offset per terrain type (visual extrusion depth in px) */
const TERRAIN_DEPTH: Record<TerrainType, number> = {
  mountain: 7,
  forest: 4.5,
  plain: 3,
  road: 2.5,
  swamp: 1.5,
};

/** Darker shade for side faces */
const TERRAIN_SIDE_COLOR: Record<TerrainType, string> = {
  plain:    '#6e5218',
  mountain: '#222e38',
  forest:   '#0e3e1e',
  swamp:    '#143a3e',
  road:     '#4a3818',
};

/**
 * Build SVG paths for the visible side faces of a raised hex.
 * We render sides 3, 4, 5 (the bottom-facing edges when viewed from above with slight tilt).
 */
function hexSidePaths(cx: number, cy: number, size: number, depth: number): string[] {
  const verts = hexVertices(cx, cy, size);
  const paths: string[] = [];
  // Visible sides: edges 2-3, 3-4, 4-5 (the lower half of the pointy-top hex)
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

const TERRAIN_COLORS: Record<TerrainType, { fill: string; fillDark: string; stroke: string; icon: string; label: string }> = {
  plain:    { fill: '#c8a84e', fillDark: '#8a6d2b', stroke: '#d4b95a', icon: '🌾', label: 'P' },
  mountain: { fill: '#6b7b8d', fillDark: '#3d4a56', stroke: '#8a9bae', icon: '⛰️', label: 'M' },
  forest:   { fill: '#2d8a4e', fillDark: '#1a5c30', stroke: '#4aad6a', icon: '🌲', label: 'F' },
  swamp:    { fill: '#3a7a7e', fillDark: '#1f4f52', stroke: '#5aadad', icon: '🌿', label: 'S' },
  road:     { fill: '#9a7a42', fillDark: '#6b5230', stroke: '#c4a050', icon: '🛤️', label: 'R' },
};

const LEVEL_COLORS = [
  'rgba(245,197,24,0.12)',  // Level 0 - center, gold tint
  'rgba(245,197,24,0.07)',  // Level 1
  'rgba(245,197,24,0.04)',  // Level 2
  'rgba(245,197,24,0.02)',  // Level 3
];

// ── Race village icons (SVG in center hex) ──────────────────────

const RACE_VILLAGE: Record<string, { emoji: string; color: string }> = {
  elf:     { emoji: '🏡', color: '#4aad6a' },
  dwarf:   { emoji: '⛏️', color: '#8a9bae' },
  human:   { emoji: '🏰', color: '#d4b95a' },
  halfelf: { emoji: '🌳', color: '#9B59B6' },
  orc:     { emoji: '⚔️', color: '#E74C3C' },
  giant:   { emoji: '🗿', color: '#2C3E50' },
  goblin:  { emoji: '🍄', color: '#27AE60' },
  halforc: { emoji: '🛡️', color: '#7F8C8D' },
};

// ── Component ────────────────────────────────────────────────────

type Props = {
  board: HexCell[];
  onPlaceTile: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile: (coord: HexCoord) => void;
  dragTerrain: TerrainType | null;
  raceId?: RaceId;
  hexSize?: number;
  onResetBoard?: () => void;
};

export function HexBoard({ board, onPlaceTile, onRemoveTile, dragTerrain, raceId, hexSize: baseSizeOverride = 28, onResetBoard }: Props) {
  const t = useI18n(s => s.t);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverCoord, setHoverCoord] = useState<string | null>(null);

  // Zoom state (0.6 – 2.0) — applied as CSS scale, NOT to hex geometry
  const [zoom, setZoom] = useState(1);
  // 3D rotation state
  const [rotateX, setRotateX] = useState(25);
  const [rotateZ, setRotateZ] = useState(0);
  // Drag-to-rotate tracking
  const isDraggingRotation = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // hexSize is fixed for SVG geometry; zoom is applied via CSS transform
  const hexSize = baseSizeOverride;

  // Compute SVG viewBox (fixed, independent of zoom)
  // Extra top padding for 3D extrusion (tiles shift upward by depth)
  const maxDepth = 8; // slightly more than max terrain depth
  const padding = hexSize * 2;
  const allPositions = board.map(c => hexToPixel(c.coord.q, c.coord.r, hexSize));
  const minX = Math.min(...allPositions.map(p => p.x)) - padding;
  const maxX = Math.max(...allPositions.map(p => p.x)) + padding;
  const minY = Math.min(...allPositions.map(p => p.y)) - padding - maxDepth;
  const maxY = Math.max(...allPositions.map(p => p.y)) + padding + maxDepth;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const coordKey = (c: HexCoord) => `${c.q},${c.r}`;

  // ── Rotation drag handlers ──
  const handleRotationPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start rotation if right-click or middle-click, or ctrl/shift+left
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
    setRotateX(prev => Math.max(0, Math.min(60, prev - dy * 0.3)));
  }, []);

  const handleRotationPointerUp = useCallback(() => {
    isDraggingRotation.current = false;
  }, []);

  // Wheel zoom
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
      if (terrain) {
        onPlaceTile(coord, terrain);
      }
    },
    [onPlaceTile],
  );

  return (
    <div id="hex-board" className="relative select-none overflow-hidden" ref={containerRef}>
      {/* Zoom & rotation controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setZoom(prev => Math.min(2.0, prev + 0.15))}
          className="w-7 h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary hover:border-border-medium transition-colors text-sm font-bold"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(prev => Math.max(0.6, prev - 0.15))}
          className="w-7 h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary hover:border-border-medium transition-colors text-sm font-bold"
          title="Zoom out"
        >
          −
        </button>
        <div className="h-px bg-border-medium my-0.5" />
        <button
          type="button"
          onClick={() => { setRotateX(25); setRotateZ(0); setZoom(1); }}
          className="w-7 h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-text-primary hover:border-border-medium transition-colors"
          title="Reset view"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        {onResetBoard && (
          <>
            <div className="h-px bg-border-medium my-0.5" />
            <button
              type="button"
              onClick={onResetBoard}
              className="w-7 h-7 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/70 hover:text-game-accent hover:border-game-accent/40 transition-colors"
              title={t.hexBoard.resetBoard}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Rotation hint */}
      <div className="absolute bottom-1 left-2 z-20 text-text-faint text-[9px] pointer-events-none">
        Shift+drag to rotate · Scroll to zoom
      </div>

      {/* 3D perspective wrapper */}
      <div
        className="w-full"
        style={{
          perspective: '800px',
          perspectiveOrigin: '50% 40%',
        }}
        onPointerDown={handleRotationPointerDown}
        onPointerMove={handleRotationPointerMove}
        onPointerUp={handleRotationPointerUp}
        onContextMenu={e => e.preventDefault()}
      >
        <div
          style={{
            transform: `rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${zoom})`,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            transition: isDraggingRotation.current ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="w-full h-auto max-h-[70vh] hex-board-svg"
            style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.6))' }}
          >
            <defs>
              {/* Ambient glow */}
              <radialGradient id="boardGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245,197,24,0.1)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <filter id="hexShadow">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="rgba(0,0,0,0.5)" />
              </filter>

              {/* Terrain gradient fills — enhanced for 3D relief */}
              <linearGradient id="grad-plain" x1="0" y1="0" x2="0.2" y2="1">
                <stop offset="0%" stopColor="#dcc06a" />
                <stop offset="25%" stopColor="#d4b85e" />
                <stop offset="60%" stopColor="#c8a84e" />
                <stop offset="100%" stopColor="#6e5218" />
              </linearGradient>
              <linearGradient id="grad-mountain" x1="0" y1="0" x2="0.15" y2="1">
                <stop offset="0%" stopColor="#b0c0d2" />
                <stop offset="20%" stopColor="#8a9db0" />
                <stop offset="50%" stopColor="#6a7d8f" />
                <stop offset="80%" stopColor="#4d5e6e" />
                <stop offset="100%" stopColor="#222e38" />
              </linearGradient>
              <linearGradient id="grad-forest" x1="0" y1="0" x2="0.15" y2="1">
                <stop offset="0%" stopColor="#4cb86e" />
                <stop offset="30%" stopColor="#38a05a" />
                <stop offset="65%" stopColor="#2d8a4e" />
                <stop offset="100%" stopColor="#0e3e1e" />
              </linearGradient>
              <linearGradient id="grad-swamp" x1="0.1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5aacb0" />
                <stop offset="35%" stopColor="#4a9a9e" />
                <stop offset="65%" stopColor="#3a7a7e" />
                <stop offset="100%" stopColor="#143a3e" />
              </linearGradient>
              <linearGradient id="grad-road" x1="0" y1="0" x2="0.2" y2="1">
                <stop offset="0%" stopColor="#c8a058" />
                <stop offset="40%" stopColor="#a88848" />
                <stop offset="75%" stopColor="#9a7a42" />
                <stop offset="100%" stopColor="#4a3818" />
              </linearGradient>

              {/* Village center gradient */}
              <radialGradient id="village-glow" cx="50%" cy="40%" r="55%">
                <stop offset="0%" stopColor="rgba(245,197,24,0.25)" />
                <stop offset="70%" stopColor="rgba(245,197,24,0.08)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              {/* Terrain patterns — rich detailed textures */}
              <pattern id="pat-plain" width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="url(#grad-plain)" />
                {/* Rolling wheat field rows */}
                <path d="M0,5 Q4,3.5 9,5 Q14,6.5 18,5" stroke="rgba(180,150,50,0.20)" strokeWidth="0.5" fill="none" />
                <path d="M0,10 Q5,8.5 10,10 Q15,11.5 18,10" stroke="rgba(180,150,50,0.18)" strokeWidth="0.5" fill="none" />
                <path d="M0,15 Q6,13.5 11,15 Q16,16.5 18,15" stroke="rgba(180,150,50,0.15)" strokeWidth="0.5" fill="none" />
                {/* Wheat stalks — clusters */}
                <line x1="2" y1="5" x2="2.3" y2="2.5" stroke="rgba(220,190,80,0.22)" strokeWidth="0.4" />
                <line x1="2.6" y1="5" x2="3" y2="2.8" stroke="rgba(220,190,80,0.20)" strokeWidth="0.35" />
                <line x1="7" y1="4" x2="7.4" y2="1.5" stroke="rgba(220,190,80,0.22)" strokeWidth="0.4" />
                <line x1="7.6" y1="4.2" x2="8" y2="2" stroke="rgba(220,190,80,0.18)" strokeWidth="0.35" />
                <line x1="12" y1="5.5" x2="12.5" y2="3" stroke="rgba(220,190,80,0.20)" strokeWidth="0.4" />
                <line x1="15" y1="4" x2="15.4" y2="1.8" stroke="rgba(220,190,80,0.18)" strokeWidth="0.35" />
                <line x1="4" y1="10" x2="4.4" y2="7.5" stroke="rgba(220,190,80,0.20)" strokeWidth="0.4" />
                <line x1="10" y1="9.5" x2="10.3" y2="7" stroke="rgba(220,190,80,0.18)" strokeWidth="0.35" />
                <line x1="16" y1="10" x2="16.4" y2="7.8" stroke="rgba(220,190,80,0.16)" strokeWidth="0.35" />
                {/* Wheat heads (small ovals at stalk tips) */}
                <ellipse cx="2.3" cy="2.3" rx="0.5" ry="0.3" fill="rgba(240,210,80,0.18)" transform="rotate(-10,2.3,2.3)" />
                <ellipse cx="7.4" cy="1.3" rx="0.5" ry="0.3" fill="rgba(240,210,80,0.16)" transform="rotate(-5,7.4,1.3)" />
                <ellipse cx="12.5" cy="2.8" rx="0.5" ry="0.3" fill="rgba(240,210,80,0.15)" transform="rotate(-8,12.5,2.8)" />
                {/* Wildflowers scattered */}
                <circle cx="5" cy="8" r="0.5" fill="rgba(255,100,100,0.14)" />
                <circle cx="5" cy="8" r="0.25" fill="rgba(255,200,80,0.18)" />
                <circle cx="14" cy="12" r="0.4" fill="rgba(180,120,255,0.12)" />
                <circle cx="9" cy="14" r="0.45" fill="rgba(255,180,60,0.13)" />
                {/* Ground texture (subtle soil patches) */}
                <ellipse cx="6" cy="12" rx="1.5" ry="0.4" fill="rgba(120,80,30,0.06)" />
                <ellipse cx="15" cy="7" rx="1" ry="0.3" fill="rgba(120,80,30,0.05)" />
              </pattern>
              <pattern id="pat-mountain" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect width="20" height="20" fill="url(#grad-mountain)" />
                {/* Main mountain range — large jagged peaks */}
                <path d="M-1,20 L3,8 L5,12 L8,3 L10,7 L12,1 L14,6 L17,4 L19,10 L21,20" fill="rgba(100,120,140,0.18)" stroke="rgba(200,210,225,0.16)" strokeWidth="0.6" />
                {/* Background ridge */}
                <path d="M-2,20 L2,12 L5,15 L9,9 L12,14 L16,8 L19,13 L22,20" fill="rgba(70,90,110,0.12)" stroke="rgba(180,195,210,0.08)" strokeWidth="0.4" />
                {/* Snow caps on peaks */}
                <path d="M11,1 L12,1 L13,3.5 L11.5,4 L10.5,3 Z" fill="rgba(255,255,255,0.20)" />
                <path d="M7,3 L8,3 L9,5.5 L7.5,6 L6.5,5 Z" fill="rgba(255,255,255,0.15)" />
                <path d="M16,4 L17,4 L18,6.5 L16.5,7 L15.5,6 Z" fill="rgba(255,255,255,0.12)" />
                {/* Rock strata lines */}
                <path d="M3,14 L6,13 L8,14.5 L10,13.5 L12,15" stroke="rgba(0,0,0,0.07)" strokeWidth="0.35" fill="none" />
                <path d="M6,17 L9,16 L12,17 L15,16.5 L18,17.5" stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" fill="none" />
                {/* Rock crevices */}
                <line x1="4" y1="10" x2="5" y2="14" stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" />
                <line x1="14" y1="8" x2="15" y2="13" stroke="rgba(0,0,0,0.05)" strokeWidth="0.3" />
                {/* Scattered boulders */}
                <ellipse cx="3" cy="17" rx="1" ry="0.6" fill="rgba(100,115,130,0.15)" stroke="rgba(70,85,100,0.10)" strokeWidth="0.3" />
                <ellipse cx="16" cy="18" rx="0.8" ry="0.5" fill="rgba(90,105,120,0.12)" />
              </pattern>
              <pattern id="pat-forest" width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="url(#grad-forest)" />
                {/* Dense layered canopy — background layer */}
                <circle cx="4" cy="4" r="3.5" fill="rgba(25,100,45,0.22)" />
                <circle cx="12" cy="3" r="3" fill="rgba(30,110,50,0.20)" />
                <circle cx="8" cy="8" r="3.2" fill="rgba(20,95,40,0.18)" />
                <circle cx="15" cy="9" r="2.8" fill="rgba(25,105,48,0.16)" />
                <circle cx="2" cy="12" r="3" fill="rgba(22,98,42,0.15)" />
                <circle cx="10" cy="14" r="2.5" fill="rgba(28,108,50,0.14)" />
                {/* Foreground canopy — brighter greens */}
                <circle cx="5" cy="3" r="2.2" fill="rgba(50,160,75,0.20)" />
                <circle cx="13" cy="4" r="2" fill="rgba(45,150,70,0.18)" />
                <circle cx="9" cy="7" r="2.3" fill="rgba(55,170,80,0.16)" />
                <circle cx="3" cy="11" r="1.8" fill="rgba(48,155,72,0.15)" />
                <circle cx="16" cy="13" r="1.6" fill="rgba(42,145,68,0.14)" />
                {/* Tree trunks visible through gaps */}
                <line x1="4" y1="7" x2="4" y2="12" stroke="rgba(80,50,20,0.20)" strokeWidth="0.8" />
                <line x1="12" y1="6" x2="12" y2="11" stroke="rgba(80,50,20,0.18)" strokeWidth="0.7" />
                <line x1="8" y1="11" x2="8" y2="16" stroke="rgba(80,50,20,0.15)" strokeWidth="0.6" />
                <line x1="16" y1="13" x2="16" y2="17" stroke="rgba(80,50,20,0.12)" strokeWidth="0.5" />
                {/* Sunlight dapples through canopy */}
                <circle cx="6" cy="5" r="0.6" fill="rgba(255,255,200,0.08)" />
                <circle cx="11" cy="9" r="0.5" fill="rgba(255,255,200,0.06)" />
                <circle cx="3" cy="14" r="0.4" fill="rgba(255,255,200,0.05)" />
                {/* Forest floor moss patches */}
                <ellipse cx="6" cy="16" rx="2" ry="0.5" fill="rgba(60,140,60,0.10)" />
                <ellipse cx="14" cy="17" rx="1.5" ry="0.4" fill="rgba(55,130,55,0.08)" />
              </pattern>
              <pattern id="pat-swamp" width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="url(#grad-swamp)" />
                {/* Murky water pools with reflections */}
                <ellipse cx="5" cy="5" rx="3.5" ry="1.5" fill="rgba(30,80,70,0.20)" />
                <ellipse cx="13" cy="10" rx="3" ry="1.2" fill="rgba(25,75,65,0.18)" />
                <ellipse cx="7" cy="14" rx="4" ry="1.3" fill="rgba(28,78,68,0.15)" />
                {/* Water surface shimmer */}
                <path d="M2,4 Q5,3 8,4.5" stroke="rgba(150,220,210,0.10)" strokeWidth="0.3" fill="none" />
                <path d="M10,9.5 Q13,8.5 16,9.8" stroke="rgba(150,220,210,0.08)" strokeWidth="0.3" fill="none" />
                <path d="M4,13 Q7,12 10,13.5" stroke="rgba(150,220,210,0.07)" strokeWidth="0.3" fill="none" />
                {/* Lily pads */}
                <ellipse cx="4" cy="4.5" rx="0.8" ry="0.5" fill="rgba(60,160,80,0.18)" />
                <path d="M4,4.5 L4,4" stroke="rgba(60,160,80,0.12)" strokeWidth="0.2" fill="none" />
                <ellipse cx="14" cy="10.3" rx="0.6" ry="0.4" fill="rgba(60,160,80,0.15)" />
                {/* Tall reeds and cattails */}
                <line x1="1" y1="9" x2="1.3" y2="5" stroke="rgba(90,170,110,0.20)" strokeWidth="0.5" />
                <line x1="1.8" y1="9" x2="2.1" y2="5.5" stroke="rgba(80,160,100,0.18)" strokeWidth="0.45" />
                <ellipse cx="1.3" cy="4.8" rx="0.3" ry="0.6" fill="rgba(120,80,40,0.18)" />
                <line x1="16" y1="7" x2="16.3" y2="3" stroke="rgba(85,165,105,0.18)" strokeWidth="0.45" />
                <line x1="16.8" y1="7" x2="17" y2="3.5" stroke="rgba(80,155,100,0.16)" strokeWidth="0.4" />
                <ellipse cx="16.3" cy="2.8" rx="0.25" ry="0.5" fill="rgba(110,75,35,0.16)" />
                <line x1="9" y1="3" x2="9.3" y2="0.5" stroke="rgba(85,165,105,0.15)" strokeWidth="0.4" />
                {/* Dead tree stumps */}
                <rect x="11" y="4" width="0.7" height="1.5" rx="0.2" fill="rgba(80,60,30,0.18)" />
                <line x1="11.35" y1="4" x2="10.5" y2="3.2" stroke="rgba(80,60,30,0.14)" strokeWidth="0.3" />
                <line x1="11.35" y1="4.2" x2="12.2" y2="3.5" stroke="rgba(80,60,30,0.12)" strokeWidth="0.25" />
                {/* Bubbles in water */}
                <circle cx="6" cy="5.2" r="0.3" fill="none" stroke="rgba(180,220,210,0.12)" strokeWidth="0.2" />
                <circle cx="12.5" cy="9.8" r="0.2" fill="none" stroke="rgba(180,220,210,0.10)" strokeWidth="0.15" />
                {/* Hanging moss blobs */}
                <ellipse cx="3" cy="12" rx="0.6" ry="0.3" fill="rgba(100,200,140,0.14)" />
                <ellipse cx="15" cy="15" rx="0.5" ry="0.25" fill="rgba(90,190,130,0.12)" />
              </pattern>
              <pattern id="pat-road" width="14" height="14" patternUnits="userSpaceOnUse">
                <rect width="14" height="14" fill="url(#grad-road)" />
                {/* Cobblestone road — rows of stones */}
                <rect x="3" y="0" width="8" height="14" fill="rgba(160,130,80,0.12)" rx="0.5" />
                {/* Cobblestone rows (offset pattern) */}
                <rect x="3.5" y="0.5" width="2.8" height="1.8" rx="0.5" fill="rgba(180,150,90,0.14)" stroke="rgba(100,80,40,0.10)" strokeWidth="0.3" />
                <rect x="6.8" y="0.5" width="3.5" height="1.8" rx="0.5" fill="rgba(170,140,85,0.12)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                <rect x="3.2" y="2.8" width="3.5" height="1.8" rx="0.5" fill="rgba(175,145,88,0.13)" stroke="rgba(100,80,40,0.09)" strokeWidth="0.3" />
                <rect x="7.2" y="2.8" width="2.8" height="1.8" rx="0.5" fill="rgba(185,155,95,0.11)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                <rect x="3.5" y="5.1" width="2.5" height="1.8" rx="0.5" fill="rgba(178,148,90,0.12)" stroke="rgba(100,80,40,0.09)" strokeWidth="0.3" />
                <rect x="6.5" y="5.1" width="3.8" height="1.8" rx="0.5" fill="rgba(172,142,86,0.13)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                <rect x="3.3" y="7.4" width="3.2" height="1.8" rx="0.5" fill="rgba(182,152,92,0.11)" stroke="rgba(100,80,40,0.09)" strokeWidth="0.3" />
                <rect x="7" y="7.4" width="3" height="1.8" rx="0.5" fill="rgba(168,138,82,0.14)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                <rect x="3.5" y="9.7" width="3.6" height="1.8" rx="0.5" fill="rgba(176,146,88,0.12)" stroke="rgba(100,80,40,0.09)" strokeWidth="0.3" />
                <rect x="7.6" y="9.7" width="2.5" height="1.8" rx="0.5" fill="rgba(180,150,90,0.11)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                <rect x="3.2" y="12" width="2.8" height="1.8" rx="0.5" fill="rgba(174,144,86,0.13)" stroke="rgba(100,80,40,0.09)" strokeWidth="0.3" />
                <rect x="6.5" y="12" width="3.5" height="1.8" rx="0.5" fill="rgba(170,140,84,0.12)" stroke="rgba(100,80,40,0.08)" strokeWidth="0.3" />
                {/* Road edge borders — stone curbs */}
                <line x1="3" y1="0" x2="3" y2="14" stroke="rgba(90,70,35,0.18)" strokeWidth="0.6" />
                <line x1="11" y1="0" x2="11" y2="14" stroke="rgba(90,70,35,0.18)" strokeWidth="0.6" />
                {/* Grass along edges */}
                <line x1="1.5" y1="3" x2="2" y2="1.5" stroke="rgba(100,160,60,0.12)" strokeWidth="0.3" />
                <line x1="12.5" y1="6" x2="13" y2="4.5" stroke="rgba(100,160,60,0.10)" strokeWidth="0.3" />
                <line x1="1" y1="9" x2="1.5" y2="7.5" stroke="rgba(100,160,60,0.10)" strokeWidth="0.3" />
                <line x1="13" y1="11" x2="13.5" y2="9.5" stroke="rgba(100,160,60,0.08)" strokeWidth="0.3" />
                {/* Wear marks on stones */}
                <ellipse cx="7" cy="3.5" rx="0.8" ry="0.2" fill="rgba(140,110,65,0.10)" />
                <ellipse cx="5" cy="8" rx="0.6" ry="0.15" fill="rgba(140,110,65,0.08)" />
              </pattern>

              {/* 3D relief shadow for elevated terrains */}
              <filter id="terrain-relief" x="-8%" y="-8%" width="116%" height="125%">
                <feDropShadow dx="0.5" dy="2.5" stdDeviation="1.8" floodColor="rgba(0,0,0,0.45)" />
              </filter>
              <filter id="terrain-relief-high" x="-8%" y="-8%" width="116%" height="130%">
                <feDropShadow dx="0.5" dy="3.5" stdDeviation="2.5" floodColor="rgba(0,0,0,0.55)" />
                <feDropShadow dx="-0.3" dy="-0.5" stdDeviation="0.5" floodColor="rgba(255,255,255,0.08)" />
              </filter>
              <filter id="village-relief" x="-10%" y="-10%" width="120%" height="135%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="rgba(245,197,24,0.18)" />
              </filter>
              <filter id="terrain-relief-swamp" x="-5%" y="-5%" width="110%" height="118%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="rgba(0,0,0,0.35)" />
              </filter>

              {/* Highlight glow filter */}
              <filter id="terrainGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Board glow background */}
            <circle cx="0" cy="0" r={hexSize * 7} fill="url(#boardGlow)" />

            {/* Render hexes — sorted so back rows render first for 3D overlap */}
            {[...board]
              .sort((a, b) => {
                // Render from top-to-bottom (lower r first) so front tiles overlap back tiles
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
              const depth = terrain ? TERRAIN_DEPTH[terrain] : 0;
              // Offset the top face upward by the depth to create extrusion
              const yTop = isEmpty ? y : y - depth;

              return (
                <g
                  key={key}
                  onDragOver={isEmpty ? handleDragOver : undefined}
                  onDrop={isEmpty ? (e) => handleDrop(cell.coord, e) : undefined}
                  onMouseEnter={() => setHoverCoord(key)}
                  onMouseLeave={() => setHoverCoord(null)}
                  onClick={() => {
                    if (!isEmpty) {
                      onRemoveTile(cell.coord);
                    } else if (dragTerrain) {
                      onPlaceTile(cell.coord, dragTerrain);
                    }
                  }}
                  style={{ cursor: isEmpty ? (dragTerrain ? 'pointer' : 'default') : 'pointer' }}
                >
                  {/* 3D side faces (rendered below the top face) */}
                  {!isEmpty && depth > 0 && (
                    <>
                      {hexSidePaths(x, yTop, hexSize, depth).map((d, i) => (
                        <path
                          key={`side-${i}`}
                          d={d}
                          fill={TERRAIN_SIDE_COLOR[terrain!]}
                          stroke="rgba(0,0,0,0.3)"
                          strokeWidth={0.4}
                          style={{ pointerEvents: 'none' }}
                        />
                      ))}
                      {/* Side face highlight on left edge for light direction */}
                      {hexSidePaths(x, yTop, hexSize * 0.99, depth).slice(0, 1).map((d, i) => (
                        <path
                          key={`side-hl-${i}`}
                          d={d}
                          fill="rgba(255,255,255,0.06)"
                          style={{ pointerEvents: 'none' }}
                        />
                      ))}
                    </>
                  )}

                  {/* Empty cell base (flat) */}
                  {isEmpty && (
                    <path
                      d={hexPath(x, y, hexSize)}
                      fill={LEVEL_COLORS[cell.level]}
                      stroke={isHovered && dragTerrain ? 'rgba(245,197,24,0.7)' : 'rgba(255,255,255,0.06)'}
                      strokeWidth={isHovered ? 1.8 : 0.8}
                      filter={cell.level === 0 && raceId ? 'url(#village-relief)' : 'url(#hexShadow)'}
                      style={{ transition: 'stroke 0.2s, stroke-width 0.15s' }}
                    />
                  )}

                  {/* Placed terrain top face (raised) */}
                  {!isEmpty && (
                    <path
                      d={hexPath(x, yTop, hexSize)}
                      fill={`url(#pat-${terrain})`}
                      stroke={TERRAIN_COLORS[terrain!].stroke}
                      strokeWidth={isHovered ? 1.8 : 0.8}
                      filter={terrain === 'mountain' ? 'url(#terrain-relief-high)' : terrain === 'swamp' ? 'url(#terrain-relief-swamp)' : 'url(#terrain-relief)'}
                      style={{ transition: 'stroke 0.2s, stroke-width 0.15s' }}
                    />
                  )}

                  {/* Top face bevel highlight */}
                  {!isEmpty && (
                    <>
                      <path
                        d={hexPath(x, yTop, innerSize)}
                        fill="none"
                        stroke="rgba(255,255,255,0.14)"
                        strokeWidth={0.6}
                        style={{ pointerEvents: 'none' }}
                      />
                      <path
                        d={hexPath(x, yTop, hexSize * 0.85)}
                        fill="none"
                        stroke="rgba(0,0,0,0.1)"
                        strokeWidth={0.4}
                        style={{ pointerEvents: 'none' }}
                      />
                    </>
                  )}

                  {/* Terrain icon — subtle, behind the pattern detail */}
                  {!isEmpty && (
                    <text
                      x={x}
                      y={yTop + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={hexSize * 0.38}
                      opacity={0.7}
                      style={{ pointerEvents: 'none' }}
                    >
                      {TERRAIN_COLORS[terrain!].icon}
                    </text>
                  )}

                  {/* Center hex: village with relief */}
                  {isEmpty && cell.level === 0 && (
                    <>
                      {raceId && (
                        <path
                          d={hexPath(x, y, innerSize)}
                          fill="url(#village-glow)"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      {raceId && RACE_VILLAGE[raceId] ? (
                        <>
                          <text
                            x={x}
                            y={y - hexSize * 0.08}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={hexSize * 0.6}
                            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
                          >
                            {RACE_VILLAGE[raceId].emoji}
                          </text>
                          <text
                            x={x}
                            y={y + hexSize * 0.38}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={hexSize * 0.16}
                            fill={RACE_VILLAGE[raceId].color}
                            fontWeight="bold"
                            opacity={0.6}
                            style={{ pointerEvents: 'none', letterSpacing: '0.08em' }}
                          >
                            {t.hexBoard.yourKingdom}
                          </text>
                        </>
                      ) : (
                        <text
                          x={x}
                          y={y + 1}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={hexSize * 0.3}
                          fill="rgba(245,197,24,0.25)"
                          fontWeight="bold"
                          style={{ pointerEvents: 'none' }}
                        >
                          {t.hexBoard.yourKingdom}
                        </text>
                      )}
                    </>
                  )}

                  {/* Drop highlight */}
                  {isEmpty && isHovered && dragTerrain && (
                    <path
                      d={hexPath(x, y, innerSize)}
                      fill="rgba(245,197,24,0.15)"
                      stroke="rgba(245,197,24,0.5)"
                      strokeWidth={1.2}
                      strokeDasharray="3,2"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Hover glow for placed tiles */}
                  {!isEmpty && isHovered && (
                    <path
                      d={hexPath(x, yTop, hexSize)}
                      fill="rgba(255,255,255,0.08)"
                      stroke="rgba(255,80,80,0.5)"
                      strokeWidth={1.5}
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

// ── Tile Hand (draggable tiles) ──────────────────────────────────

type TileHandProps = {
  tiles: Record<TerrainType, number>;
  placedCounts: Record<TerrainType, number>;
  selectedTerrain: TerrainType | null;
  onSelectTerrain: (terrain: TerrainType | null) => void;
};

export function TileHand({ tiles, placedCounts, selectedTerrain, onSelectTerrain }: TileHandProps) {
  const t = useI18n(s => s.t);
  const terrains: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

  return (
    <div id="tile-hand">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-medium mb-2">
        {t.hexBoard.availableTiles}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {terrains.map(terrain => {
          const available = tiles[terrain] - (placedCounts[terrain] ?? 0);
          if (tiles[terrain] === 0) return null;
          const isSelected = selectedTerrain === terrain;

          return (
            <button
              key={terrain}
              type="button"
              draggable={available > 0}
              onDragStart={e => {
                e.dataTransfer.setData('terrain', terrain);
                e.dataTransfer.effectAllowed = 'move';
                onSelectTerrain(terrain);
              }}
              onDragEnd={() => onSelectTerrain(null)}
              onClick={() => onSelectTerrain(isSelected ? null : (available > 0 ? terrain : null))}
              disabled={available <= 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                isSelected
                  ? 'border-game-gold bg-game-gold/15 text-game-gold shadow-gold-sm scale-105'
                  : available > 0
                    ? 'border-border-medium text-text-secondary hover:border-text-muted hover:bg-game-surface-light cursor-grab active:cursor-grabbing'
                    : 'border-border-subtle text-text-faint opacity-50'
              }`}
            >
              <span className="text-base">{TERRAIN_COLORS[terrain].icon}</span>
              <span className="text-xs font-medium">{t.terrain[terrain]}</span>
              <span className={`text-xs tabular-nums font-bold ${available > 0 ? 'text-text-primary' : 'text-text-faint'}`}>
                {available}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-text-faint text-[10px] mt-1.5 italic">{t.hexBoard.dragHint}</p>
    </div>
  );
}

// ── Auto-assign algorithm ───────────────────────────────────────

const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/**
 * Auto-assign tiles to maximize score.
 *
 * Optimized strategy:
 * 1. Reserve center hex (0,0) — village, never placed on.
 * 2. Prioritize filling ring 1 (level 1) and ring 2 (level 2) for ring completion bonuses (+4, +6).
 * 3. Place roads in branching paths from center-adjacent cells to multiple border cells for road connection bonus.
 * 4. Cluster favorable terrain near center for adjacency bonus (+1 per adjacent favorable pair).
 * 5. Scatter unfavorable terrain at edges, avoiding adjacency (-1 per adjacent unfavorable pair).
 * 6. Ensure terrain diversity (4 types → +5) and balance (all ≥2 → +3).
 * 7. Avoid concentration penalty (>8 of one type → -1 each).
 * 8. Fill remaining with highest-value terrains for base score.
 */
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

  // Count how many neighbors of idx have a specific terrain
  function adjacentCount(idx: number, terrain: TerrainType): number {
    return neighborIdxs(idx).filter(n => board[n].terrain === terrain).length;
  }

  // Cells grouped by level (excluding center)
  const ring1 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 1);
  const ring2 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 2);
  const ring3 = board.map((_, i) => i).filter(i => !isCenter(i) && board[i].level === 3);
  const allPlaceable = [...ring1, ...ring2, ...ring3];

  // Rank non-road terrains by race value (descending)
  const productiveTerrains = (['plain', 'mountain', 'forest', 'swamp'] as const)
    .filter(t => pool[t] > 0)
    .sort((a, b) => race.terrainValues[b] - race.terrainValues[a]);

  // ── Step 1: Place roads strategically ─────────────────────────
  // Try to create multiple center→border paths for maximum road connection bonus.
  // Each path that reaches border = +3 points.
  if (pool.road > 0) {
    // Score each of the 6 directions for road paths
    const dirPaths: { dir: typeof HEX_DIRS[0]; path: number[] }[] = [];
    for (const dir of HEX_DIRS) {
      const path: number[] = [];
      let q = dir.q, r = dir.r;
      for (let step = 0; step < 3; step++) {
        const idx = getIdx(q, r);
        if (idx !== undefined) path.push(idx);
        q += dir.q;
        r += dir.r;
      }
      if (path.length > 0 && board[path[path.length - 1]].level === 3) {
        dirPaths.push({ dir, path });
      }
    }

    // Place complete center→border paths (3 roads each = +3 bonus per path)
    // Sort by path length descending so we prioritize complete paths
    dirPaths.sort((a, b) => b.path.length - a.path.length);

    for (const { path } of dirPaths) {
      if (pool.road < path.length) continue; // Not enough roads for full path
      let canPlace = true;
      for (const idx of path) {
        if (board[idx].terrain !== null) { canPlace = false; break; }
      }
      if (canPlace) {
        for (const idx of path) place(idx, 'road');
      }
    }

    // Place remaining roads extending from existing road tiles
    for (const idx of allPlaceable) {
      if (pool.road <= 0) break;
      if (board[idx].terrain !== null) continue;
      if (adjacentCount(idx, 'road') > 0) {
        place(idx, 'road');
      }
    }

    // Any leftover roads go to outermost empty cells
    for (const idx of [...allPlaceable].reverse()) {
      if (pool.road <= 0) break;
      if (board[idx].terrain === null) place(idx, 'road');
    }
  }

  // ── Step 2: Ensure ring completion ────────────────────────────
  // Fill ring 1 and ring 2 completely for +4 and +6 bonus.
  // Use highest-value terrains for inner rings.
  function fillRing(ring: number[]) {
    for (const idx of ring) {
      if (board[idx].terrain !== null) continue;
      // Pick the best available terrain for this cell
      // Prefer favorable terrain if neighbors already have it (adjacency bonus)
      // Avoid unfavorable terrain adjacent to other unfavorable
      let bestTerrain: TerrainType | null = null;
      let bestScore = -Infinity;

      for (const terrain of productiveTerrains) {
        if (pool[terrain] <= 0) continue;
        let score = race.terrainValues[terrain];
        // Adjacency bonus: +2 weight if placing next to same favorable terrain
        if (terrain === favorable) {
          score += adjacentCount(idx, favorable) * 2;
        }
        // Adjacency penalty: -2 weight if placing unfavorable next to unfavorable
        if (terrain === unfavorable) {
          score -= adjacentCount(idx, unfavorable) * 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestTerrain = terrain;
        }
      }
      if (bestTerrain) place(idx, bestTerrain);
    }
  }

  fillRing(ring1);
  fillRing(ring2);

  // ── Step 3: Cluster favorable terrain in remaining inner slots ─
  // BFS outward from already-placed favorable tiles for adjacency bonus
  if (pool[favorable] > 0) {
    const queue: number[] = [];
    // Seed from existing favorable placements
    for (const idx of allPlaceable) {
      if (board[idx].terrain === favorable) {
        for (const n of neighborIdxs(idx)) {
          if (board[n].terrain === null && !isCenter(n)) queue.push(n);
        }
      }
    }
    // If no favorable placed yet, start from innermost empty
    if (queue.length === 0) {
      for (const idx of allPlaceable) {
        if (board[idx].terrain === null) { queue.push(idx); break; }
      }
    }
    const visited = new Set<number>(queue);
    while (queue.length > 0 && pool[favorable] > 0) {
      const idx = queue.shift()!;
      if (board[idx].terrain === null && !isCenter(idx)) {
        place(idx, favorable);
      }
      for (const nIdx of neighborIdxs(idx)) {
        if (!visited.has(nIdx) && board[nIdx].terrain === null && !isCenter(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  // ── Step 4: Scatter unfavorable terrain at edges ──────────────
  if (pool[unfavorable] > 0) {
    // Place on outermost empty cells, avoiding adjacency with each other
    const edgeFirst = [...allPlaceable].reverse();
    for (const idx of edgeFirst) {
      if (pool[unfavorable] <= 0) break;
      if (board[idx].terrain !== null) continue;
      if (adjacentCount(idx, unfavorable) === 0) {
        place(idx, unfavorable);
      }
    }
    // Overflow: place remaining even if adjacent
    for (const idx of edgeFirst) {
      if (pool[unfavorable] <= 0) break;
      if (board[idx].terrain === null) place(idx, unfavorable);
    }
  }

  // ── Step 5: Fill remaining — ensure diversity & balance ───────
  // Track placed counts to ensure diversity (4 types → +5) and balance (all ≥2 → +3)
  const placed: Record<string, number> = { plain: 0, mountain: 0, forest: 0, swamp: 0 };
  for (const cell of board) {
    if (cell.terrain && cell.terrain !== 'road') placed[cell.terrain]++;
  }

  // Ensure at least 2 of each non-road terrain type for balance bonus (+3)
  const terrainTypes = ['plain', 'mountain', 'forest', 'swamp'] as const;
  for (const terrain of terrainTypes) {
    while (placed[terrain] < 2 && pool[terrain] > 0) {
      // Find best empty slot (inner first)
      for (const idx of allPlaceable) {
        if (board[idx].terrain === null) {
          if (place(idx, terrain)) {
            placed[terrain]++;
            break;
          }
        }
      }
      if (placed[terrain] < 2 && pool[terrain] <= 0) break;
    }
  }

  // Fill remaining empty cells with highest-value terrains, capping at 8 to avoid concentration penalty
  const remainingByValue = [...productiveTerrains]
    .filter(t => pool[t] > 0)
    .sort((a, b) => race.terrainValues[b] - race.terrainValues[a]);

  for (const idx of allPlaceable) {
    if (board[idx].terrain !== null) continue;
    // Pick terrain: prefer high-value but cap at 8 to avoid concentration penalty
    let bestTerrain: TerrainType | null = null;
    for (const terrain of remainingByValue) {
      if (pool[terrain] <= 0) continue;
      if (placed[terrain] >= 8) continue; // Skip to avoid concentration penalty
      bestTerrain = terrain;
      break;
    }
    // If all are at 8+, just use highest value anyway
    if (!bestTerrain) {
      for (const terrain of remainingByValue) {
        if (pool[terrain] > 0) { bestTerrain = terrain; break; }
      }
    }
    if (bestTerrain && place(idx, bestTerrain)) {
      placed[bestTerrain]++;
    }
  }

  return board;
}

// ── Hook to manage board state ────────────────────────────────────

export function useHexBoard(tileInventory?: Record<TerrainType, number>) {
  const [board, setBoard] = useState<HexCell[]>(() => [...HEX_GRID.map(c => ({ ...c, terrain: null }))]);

  // Keep a ref to tileInventory so the callback stays stable
  const inventoryRef = useRef(tileInventory);
  inventoryRef.current = tileInventory;

  const placeTile = useCallback((coord: HexCoord, terrain: TerrainType) => {
    setBoard(prev => {
      // Check available tiles before placing
      if (inventoryRef.current) {
        const placedOfType = prev.filter(c => c.terrain === terrain).length;
        if (placedOfType >= inventoryRef.current[terrain]) {
          return prev; // No tiles of this type left — don't place
        }
      }
      return prev.map(cell =>
        cell.coord.q === coord.q && cell.coord.r === coord.r && cell.terrain === null
          ? { ...cell, terrain }
          : cell,
      );
    });
  }, []);

  const removeTile = useCallback((coord: HexCoord) => {
    setBoard(prev =>
      prev.map(cell =>
        cell.coord.q === coord.q && cell.coord.r === coord.r
          ? { ...cell, terrain: null }
          : cell,
      ),
    );
  }, []);

  const resetBoard = useCallback(() => {
    setBoard(HEX_GRID.map(c => ({ ...c, terrain: null })));
  }, []);

  const autoAssign = useCallback((raceId: RaceId) => {
    if (!inventoryRef.current) return;
    const tiles = inventoryRef.current;
    const newBoard = autoAssignTiles(HEX_GRID, tiles, raceId);
    setBoard(newBoard);
  }, []);

  const placedCounts: Record<TerrainType, number> = { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 };
  for (const cell of board) {
    if (cell.terrain) placedCounts[cell.terrain]++;
  }

  const totalPlaced = Object.values(placedCounts).reduce((a, b) => a + b, 0);

  return { board, placeTile, removeTile, resetBoard, autoAssign, placedCounts, totalPlaced };
}

export { HEX_GRID, TERRAIN_COLORS };
