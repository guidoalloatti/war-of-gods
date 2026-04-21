import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  reachableHexes,
  findPath,
  hexKey,
  neighbors,
  DIRECTIONS,
  DHAKHAN_OWNER_ID,
  BOSS_STACK_ID,
} from '@war-of-gods/engine';
import type { GameMap, Hex, HexTerrain, Stack, HexCoord, UnitType } from '@war-of-gods/engine';
import { useI18n } from '../../i18n/index.js';

const HEX_SIZE = 24;
const SQRT3 = Math.sqrt(3);
const MAX_DEPTH = 14;

const TERRAIN_FILL: Record<HexTerrain, string> = {
  plain: '#7bb07a',
  mountain: '#8a8680',
  hill: '#9aaa7a',
  forest: '#3d8553',
  swamp: '#6d4782',
  desert: '#d9b97a',
  lake: '#3a6ea5',
  river: '#3a7ab5',
  road: '#c9a571',
  ruins: '#b8805a',
  citadel: '#2a2340',
};

const TERRAIN_STROKE: Record<HexTerrain, string> = {
  plain: '#4a7048',
  mountain: '#4a4640',
  hill: '#6a7a48',
  forest: '#1e4a2c',
  swamp: '#3e2a52',
  desert: '#a07f45',
  lake: '#1e3e66',
  river: '#1e5e8a',
  road: '#8a6f44',
  ruins: '#7a5236',
  citadel: '#f5c518',
};

const TERRAIN_DEPTH: Record<HexTerrain, number> = {
  plain: 2,
  road: 2,
  forest: 6,
  swamp: 3,
  desert: 3,
  lake: 1,
  river: 1,
  hill: 6,
  mountain: 12,
  ruins: 5,
  citadel: 10,
};

const UNIT_COLOR: Record<UnitType, string> = {
  infantry: '#94a3b8',
  ranged:   '#a78bfa',
  mounted:  '#22d3ee',
  siege:    '#fb923c',
  flying:   '#f472b6',
};

function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * SQRT3 * (q + r / 2);
  const y = HEX_SIZE * 1.5 * r;
  return { x, y };
}

function hexCorners(cx: number, cy: number, size = HEX_SIZE): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return out;
}

function pointsStr(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * Shade a hex color by a factor (−1 darker, +1 lighter).
 */
function shade(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (factor >= 0) {
    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);
  } else {
    r = Math.round(r * (1 + factor));
    g = Math.round(g * (1 + factor));
    b = Math.round(b * (1 + factor));
  }
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

type Props = {
  map: GameMap;
  stacks: Record<string, Stack>;
  localPlayerId: string | null;
  activePlayerId?: string | null;
  selectedStackId: string | null;
  onSelectStack: (stackId: string | null) => void;
  onMoveStack?: (stackId: string, path: HexCoord[]) => void;
  onAttackStack?: (attackerStackId: string, targetCoord: HexCoord) => void;
  buildingRoad?: boolean;
  eligibleRoadHexes?: Set<string>;
  onBuildRoad?: (coord: HexCoord) => void;
  onCancelBuildRoad?: () => void;
};

export function Era3HexMap({
  map, stacks, localPlayerId, activePlayerId,
  selectedStackId, onSelectStack, onMoveStack, onAttackStack,
  buildingRoad = false, eligibleRoadHexes, onBuildRoad, onCancelBuildRoad,
}: Props) {
  const t = useI18n(s => s.t);
  const containerRef = useRef<HTMLDivElement>(null);

  // 3D view state — same defaults as Era I HexBoard.
  const [zoom, setZoom] = useState(0.9);
  const [rotateX, setRotateX] = useState(28);
  const [rotateZ, setRotateZ] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef<false | 'rotate' | 'pan'>(false);
  const didDrag = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Pending attack confirm — set when keyboard-move would enter enemy hex.
  const [pendingAttack, setPendingAttack] = useState<{ attackerStackId: string; coord: HexCoord } | null>(null);

  // Hovered/clicked hex for info panel (non-action clicks).
  const [infoHexKey, setInfoHexKey] = useState<string | null>(null);
  // Dismiss the info panel when selection state changes.
  useEffect(() => { setInfoHexKey(null); }, [selectedStackId]);

  const { hexList, viewBox } = useMemo(() => {
    const list = Object.values(map.hexes);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const h of list) {
      const { x, y } = hexToPixel(h.coord.q, h.coord.r);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = HEX_SIZE * 2;
    return {
      hexList: list,
      viewBox: `${minX - pad} ${minY - pad - MAX_DEPTH} ${(maxX - minX) + pad * 2} ${(maxY - minY) + pad * 2 + MAX_DEPTH}`,
    };
  }, [map]);

  const selectedStack = selectedStackId ? stacks[selectedStackId] : null;

  const canControlStack = useCallback(
    (s: Stack) =>
      s.ownerId === localPlayerId &&
      s.ownerId === activePlayerId &&
      (!!onMoveStack || !!onAttackStack),
    [localPlayerId, activePlayerId, onMoveStack, onAttackStack],
  );

  const reach = useMemo(() => {
    if (!selectedStack || !onMoveStack) return null;
    if (!canControlStack(selectedStack)) return null;
    return reachableHexes(map, stacks, selectedStack.id, selectedStack.position, selectedStack.movementLeft);
  }, [selectedStack, map, stacks, onMoveStack, canControlStack]);

  // Attackable hexes = adjacent hexes with a Dhakhan stack,
  // if the selected stack still has units that haven't attacked this turn.
  const attackable = useMemo(() => {
    if (!selectedStack || !onAttackStack) return new Set<string>();
    if (!canControlStack(selectedStack)) return new Set<string>();
    if (selectedStack.units.length > 0 && selectedStack.units.every(u => u.hasAttackedThisTurn)) {
      return new Set<string>();
    }
    const out = new Set<string>();
    for (const n of neighbors(selectedStack.position)) {
      const k = hexKey(n);
      const h = map.hexes[k];
      if (!h?.stackId) continue;
      const s = stacks[h.stackId];
      if (s && s.ownerId === DHAKHAN_OWNER_ID) out.add(k);
    }
    return out;
  }, [selectedStack, map, stacks, onAttackStack, canControlStack]);

  const handleHexClick = (hex: Hex) => {
    const k = hexKey(hex.coord);
    // Build-road mode takes priority: valid target → build, else cancel.
    if (buildingRoad) {
      if (eligibleRoadHexes?.has(k) && onBuildRoad) {
        onBuildRoad(hex.coord);
      } else if (onCancelBuildRoad) {
        onCancelBuildRoad();
      }
      return;
    }
    // 1. Click own selectable stack → toggle selection.
    if (hex.stackId) {
      const s = stacks[hex.stackId];
      if (s && canControlStack(s)) {
        onSelectStack(selectedStackId === s.id ? null : s.id);
        return;
      }
    }
    // 2. Have a selected stack:
    if (selectedStack) {
      // 2a. Attack if target is adjacent Dhakhan.
      if (attackable.has(k) && onAttackStack) {
        onAttackStack(selectedStack.id, hex.coord);
        return;
      }
      // 2b. Move if destination is reachable (and not the stack's own hex).
      if (onMoveStack && reach) {
        if (k === hexKey(selectedStack.position)) {
          onSelectStack(null);
          return;
        }
        if (reach.has(k) && (reach.get(k) ?? 0) > 0) {
          const path = findPath(
            map, stacks, selectedStack.id,
            selectedStack.position, hex.coord,
            selectedStack.movementLeft,
          );
          if (path && path.length > 0) {
            onMoveStack(selectedStack.id, path);
            onSelectStack(null);
            return;
          }
        }
      }
    }
    // 3. Click on enemy stack with nothing selected → just show info (select it).
    if (hex.stackId && !selectedStackId) {
      onSelectStack(hex.stackId);
      return;
    }
    // 4. No action applies → open hex info panel.
    setInfoHexKey(k);
  };

  // === Pan / rotate / zoom handlers ===
  // Shift+drag (or middle button) rotates; plain drag with no selection pans.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Right button (button===2) must fall through so `contextmenu` fires on the hex.
    if (e.button === 2) return;
    // Rotate: Shift+left or middle button.
    if ((e.shiftKey && e.button === 0) || e.button === 1) {
      e.preventDefault();
      isDragging.current = 'rotate';
      didDrag.current = false;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    // Pan: plain left-button drag when no stack selected.
    if (e.button === 0 && !selectedStackId) {
      isDragging.current = 'pan';
      didDrag.current = false;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [selectedStackId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (isDragging.current === 'rotate') {
      setRotateZ(prev => Math.max(-45, Math.min(45, prev + dx * 0.3)));
      setRotateX(prev => Math.max(5, Math.min(65, prev - dy * 0.3)));
    } else {
      setPanX(prev => prev + dx);
      setPanY(prev => prev + dy);
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.max(0.4, Math.min(2.2, prev - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard movement — QWEASD + arrow keys step the selected stack one hex.
  // Directions (engine order): 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE.
  useEffect(() => {
    if (!selectedStack || !canControlStack(selectedStack)) return;
    if (pendingAttack) return;

    const keyToDir: Record<string, number> = {
      // QWEASD hex layout
      'e': 0, 'd': 0, 'arrowright': 0,
      'w': 1, 'arrowup': 1,
      'q': 2,
      'a': 3, 'arrowleft': 3,
      's': 4,
      'x': 5, 'arrowdown': 5,
    };

    const onKey = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea.
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const key = e.key.toLowerCase();

      if (key === 'escape') {
        if (pendingAttack) setPendingAttack(null);
        else if (selectedStackId) onSelectStack(null);
        return;
      }

      const dirIdx = keyToDir[key];
      if (dirIdx === undefined) return;
      e.preventDefault();

      const dir = DIRECTIONS[dirIdx];
      const target: HexCoord = {
        q: selectedStack.position.q + dir.q,
        r: selectedStack.position.r + dir.r,
      };
      const targetKey = hexKey(target);
      const targetHex = map.hexes[targetKey];
      if (!targetHex) return;

      // 1. If target has enemy Dhakhan stack → prompt confirmation.
      if (targetHex.stackId) {
        const targetStack = stacks[targetHex.stackId];
        if (targetStack && targetStack.ownerId === DHAKHAN_OWNER_ID) {
          if (!onAttackStack) return;
          if (selectedStack.units.every(u => u.hasAttackedThisTurn)) return;
          setPendingAttack({ attackerStackId: selectedStack.id, coord: target });
          return;
        }
        // Own stack on the hex — no-op.
        return;
      }

      // 2. Empty hex → move if reachable in one step.
      if (!onMoveStack || !reach) return;
      if (!reach.has(targetKey)) return;
      if ((reach.get(targetKey) ?? 0) <= 0) return;

      const path = findPath(
        map, stacks, selectedStack.id,
        selectedStack.position, target,
        selectedStack.movementLeft,
      );
      if (path && path.length > 0) {
        onMoveStack(selectedStack.id, path);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selectedStack, selectedStackId, canControlStack, pendingAttack,
    map, stacks, reach, onMoveStack, onAttackStack, onSelectStack,
  ]);

  // ESC cancels build-road mode.
  useEffect(() => {
    if (!buildingRoad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancelBuildRoad) {
        e.preventDefault();
        onCancelBuildRoad();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buildingRoad, onCancelBuildRoad]);

  // Keyboard zoom — +/= to zoom in, -/_ to zoom out. Works regardless of selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(prev => Math.min(2.2, prev + 0.15));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(prev => Math.max(0.4, prev - 0.15));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const resetView = () => { setZoom(0.9); setRotateX(28); setRotateZ(0); setPanX(0); setPanY(0); };
  const centerMyCapital = () => {
    // Center is always (0,0) in axial space; resetting rotation focuses the
    // citadel. The player's capital is offset, but after 3D reset, panning is
    // not supported — rotation + zoom already give a wide view of the disc.
    resetView();
  };

  return (
    <div
      id="era3-hex-map"
      ref={containerRef}
      className="relative w-full h-full min-h-[420px] overflow-hidden select-none touch-manipulation"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
        <button type="button" onClick={() => setZoom(prev => Math.min(2.2, prev + 0.15))}
          className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/80 hover:text-text-primary transition-colors text-sm font-bold"
          title={t.era3.map?.zoomIn ?? 'Zoom in'}>+</button>
        <button type="button" onClick={() => setZoom(prev => Math.max(0.4, prev - 0.15))}
          className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/80 hover:text-text-primary transition-colors text-sm font-bold"
          title={t.era3.map?.zoomOut ?? 'Zoom out'}>−</button>
        <div className="h-px bg-border-medium my-0.5" />
        <button type="button" onClick={resetView}
          className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-text-primary/80 hover:text-text-primary transition-colors"
          title={t.era3.map?.resetView ?? 'Reset view'}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button type="button" onClick={centerMyCapital}
          className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center bg-game-surface/90 border border-border-medium rounded-lg text-game-gold/90 hover:text-game-gold transition-colors"
          title={t.era3.map?.center ?? 'Center'}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-1 left-2 z-20 text-text-faint text-[9px] pointer-events-none hidden sm:block">
        {t.era3.map?.hint ?? 'Shift+drag · scroll zoom'}
        {selectedStack && canControlStack(selectedStack) && (
          <div className="mt-0.5">{t.era3.map?.keyboardHint ?? 'QWE/ASD or arrows to move'}</div>
        )}
      </div>

      {/* Keyboard attack confirmation overlay */}
      {pendingAttack && onAttackStack && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="panel-accent max-w-xs w-[90%] text-center space-y-3">
            <div className="text-3xl">⚔️</div>
            <div className="text-text-primary font-bold">
              {t.era3.confirmAttack?.title ?? 'Confirm attack'}
            </div>
            <div className="text-text-secondary text-xs">
              {t.era3.confirmAttack?.body ?? 'Attack the enemy stack? Adjacent friendly stacks will flank.'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingAttack(null)}
                className="btn-sm btn-ghost flex-1"
              >
                {t.era3.confirmAttack?.cancel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onAttackStack(pendingAttack.attackerStackId, pendingAttack.coord);
                  setPendingAttack(null);
                }}
                className="btn-sm btn-danger flex-1"
              >
                {t.era3.confirmAttack?.attack ?? 'Attack'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hex info popover (non-action click) */}
      {infoHexKey && map.hexes[infoHexKey] && (
        <HexInfoPanel
          hex={map.hexes[infoHexKey]}
          stack={map.hexes[infoHexKey].stackId ? stacks[map.hexes[infoHexKey].stackId!] ?? null : null}
          onClose={() => setInfoHexKey(null)}
        />
      )}

      {/* 3D perspective wrapper */}
      <div
        className="w-full h-full"
        style={{ perspective: '1100px', perspectiveOrigin: '50% 40%' }}
      >
        <div
          className="w-full h-full transition-transform duration-100"
          style={{
            transformStyle: 'preserve-3d',
            transform: `translate(${panX}px, ${panY}px) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${zoom})`,
          }}
        >
          <svg
            viewBox={viewBox}
            className="w-full h-full hex-board-svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={t.era3.mapTitle}
          >
            <defs>
              {/* Radial pulse for spawn zones */}
              <radialGradient id="spawnPulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
                <stop offset="60%" stopColor="#ef4444" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
              </radialGradient>
              {/* Glow for the citadel */}
              <radialGradient id="citadelGlow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#f5c518" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f5c518" stopOpacity="0" />
              </radialGradient>
              {/* Glow for selected stack */}
              <radialGradient id="selectedGlow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
              </radialGradient>
              {/* Unit sprite shading: cylinder front gradient */}
              <linearGradient id="unitBody" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                <stop offset="55%" stopColor="#000000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
              </linearGradient>
              {/* Top-face shading per terrain — directional light from top-left */}
              {(Object.keys(TERRAIN_FILL) as HexTerrain[]).map(tr => (
                <radialGradient
                  key={`topgrad-${tr}`}
                  id={`topgrad-${tr}`}
                  cx="30%" cy="25%" r="75%"
                >
                  <stop offset="0%" stopColor={shade(TERRAIN_FILL[tr], 0.35)} />
                  <stop offset="60%" stopColor={TERRAIN_FILL[tr]} />
                  <stop offset="100%" stopColor={shade(TERRAIN_FILL[tr], -0.25)} />
                </radialGradient>
              ))}
            </defs>

            {hexList.map(h => {
              const key = `${h.coord.q},${h.coord.r}`;
              const stack = h.stackId ? stacks[h.stackId] : null;
              const isLocalPlayer = !!stack && stack.ownerId === localPlayerId;
              const isWrought = !!stack && stack.ownerId === DHAKHAN_OWNER_ID && stack.id !== BOSS_STACK_ID;
              const isBoss = !!stack && stack.id === BOSS_STACK_ID;
              const isSelected = selectedStack?.id === h.stackId;
              const reachCost = reach?.get(key);
              const isReachable = reachCost !== undefined && reachCost > 0;
              const isAttackable = attackable.has(key);
              const isRoadEligible = buildingRoad && (eligibleRoadHexes?.has(key) ?? false);
              return (
                <HexCell
                  key={key}
                  hex={h}
                  stack={stack}
                  isLocalPlayer={isLocalPlayer}
                  isWrought={isWrought}
                  isBoss={isBoss}
                  isSelected={isSelected}
                  isReachable={isReachable}
                  isAttackable={isAttackable}
                  isRoadEligible={isRoadEligible}
                  onClick={() => {
                    if (didDrag.current) return;
                    handleHexClick(h);
                  }}
                  onContextMenu={() => setInfoHexKey(key)}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function HexCell({
  hex,
  stack,
  isLocalPlayer,
  isWrought,
  isBoss,
  isSelected,
  isReachable,
  isAttackable,
  isRoadEligible,
  onClick,
  onContextMenu,
}: {
  hex: Hex;
  stack: Stack | null;
  isLocalPlayer: boolean;
  isWrought: boolean;
  isBoss: boolean;
  isSelected: boolean;
  isReachable: boolean;
  isAttackable: boolean;
  isRoadEligible: boolean;
  onClick: () => void;
  onContextMenu: () => void;
}) {
  const t = useI18n(s => s.t);
  const { x, y } = hexToPixel(hex.coord.q, hex.coord.r);
  const depth = TERRAIN_DEPTH[hex.terrain];
  const fill = TERRAIN_FILL[hex.terrain];

  // Side wall points for 3D effect (bottom three edges extruded downward).
  const topCorners = hexCorners(x, y);
  const botCorners = topCorners.map(p => ({ x: p.x, y: p.y + depth }));
  // Draw only the three "front" sides for depth illusion.
  // Indices: 0=E(right), 1=NE, 2=NW, 3=W(left), 4=SW, 5=SE.
  // Front walls (toward viewer after rotateX) are SE(3→4), S/bottom(4→5), SW(5→0).
  const sidePoly = (idx1: number, idx2: number) => {
    const a = topCorners[idx1], b = topCorners[idx2];
    const ab = botCorners[idx2], bb = botCorners[idx1];
    return [a, b, ab, bb];
  };
  // Per-wall shading — simulate directional light from top-left:
  // SE wall = darkest (away from light), S = mid-dark, SW = slightly less dark.
  const wallShade: Array<{ edges: [number, number]; factor: number }> = [
    { edges: [2, 3], factor: -0.15 }, // SW (catches some light)
    { edges: [3, 4], factor: -0.45 }, // Bottom (shadow)
    { edges: [4, 5], factor: -0.3 },  // SE
  ];

  const baseStroke = isRoadEligible
    ? '#fbbf24'
    : isSelected
      ? '#fde68a'
      : isAttackable
        ? '#f87171'
        : isReachable
          ? '#60a5fa'
          : hex.isCapital
            ? '#f5c518'
            : hex.isSpawnZone
              ? '#ef4444'
              : TERRAIN_STROKE[hex.terrain];
  const strokeWidth = isRoadEligible ? 3 : isSelected ? 3 : isAttackable ? 2.5 : isReachable ? 2 : hex.isCapital || hex.isSpawnZone ? 2 : 0.5;

  const stackHp = stack ? stack.units.reduce((a, u) => a + Math.max(0, u.currentHp), 0) : 0;
  const title =
    `${t.era3.terrain[hex.terrain]} (${hex.coord.q},${hex.coord.r})` +
    (hex.isCapital ? ` — ${t.era3.legend.capital}` : '') +
    (hex.isSpawnZone ? ` — ${t.era3.legend.spawnZone}` : '') +
    (isBoss ? ` — ${t.era3.bossLabel}` : '') +
    (stack ? ` — ${stack.units.length} ${t.era3.unitsHp} ${stackHp} HP` : '');

  return (
    <g
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(); }}
      style={{ cursor: 'pointer' }}
    >
      {/* Ground shadow under the prism (softens the base) */}
      {depth > 4 && (
        <ellipse
          cx={x}
          cy={y + depth + 1}
          rx={HEX_SIZE * 0.95}
          ry={HEX_SIZE * 0.3}
          fill="#000"
          opacity={0.22}
          pointerEvents="none"
        />
      )}

      {/* 3D side walls (drawn first, underneath) with per-side shading */}
      {wallShade.map(({ edges, factor }, k) => (
        <polygon
          key={`wall-${k}`}
          points={pointsStr(sidePoly(edges[0], edges[1]))}
          fill={shade(fill, factor)}
          stroke={shade(fill, factor - 0.15)}
          strokeWidth={0.4}
        />
      ))}

      {/* Citadel glow under the hex */}
      {hex.terrain === 'citadel' && (
        <circle cx={x} cy={y} r={HEX_SIZE * 1.6} fill="url(#citadelGlow)" pointerEvents="none" />
      )}

      {/* Spawn zone pulsing aura */}
      {hex.isSpawnZone && (
        <>
          <circle cx={x} cy={y} r={HEX_SIZE * 1.3} fill="url(#spawnPulse)" pointerEvents="none">
            <animate attributeName="r" values={`${HEX_SIZE * 1.1};${HEX_SIZE * 1.5};${HEX_SIZE * 1.1}`} dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.35;0.8" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Selected halo */}
      {isSelected && (
        <circle cx={x} cy={y} r={HEX_SIZE * 1.4} fill="url(#selectedGlow)" pointerEvents="none" />
      )}

      {/* Top face with directional lighting gradient */}
      <polygon
        points={pointsStr(topCorners)}
        fill={`url(#topgrad-${hex.terrain})`}
        stroke={baseStroke}
        strokeWidth={strokeWidth}
      >
        <title>{title}</title>
      </polygon>

      {/* Capital overlay tint on top */}
      {hex.isCapital && (
        <polygon
          points={pointsStr(topCorners)}
          fill="#f5c518"
          fillOpacity={0.15}
          pointerEvents="none"
        />
      )}

      {/* Terrain relief accents — small 3D shapes on top of the hex */}
      {hex.terrain === 'mountain' && !hex.isCapital && !hex.isSpawnZone && (
        <g pointerEvents="none">
          <polygon
            points={`${x - HEX_SIZE * 0.4},${y + HEX_SIZE * 0.3} ${x - HEX_SIZE * 0.15},${y - HEX_SIZE * 0.2} ${x + HEX_SIZE * 0.05},${y + HEX_SIZE * 0.3}`}
            fill={shade(fill, 0.2)}
            stroke={shade(fill, -0.4)}
            strokeWidth={0.6}
          />
          <polygon
            points={`${x - HEX_SIZE * 0.05},${y + HEX_SIZE * 0.3} ${x + HEX_SIZE * 0.2},${y - HEX_SIZE * 0.35} ${x + HEX_SIZE * 0.45},${y + HEX_SIZE * 0.3}`}
            fill={shade(fill, 0.1)}
            stroke={shade(fill, -0.4)}
            strokeWidth={0.6}
          />
        </g>
      )}
      {hex.terrain === 'forest' && !hex.isCapital && !hex.isSpawnZone && (
        <g pointerEvents="none">
          {[[-0.3, 0.1], [0.25, -0.15], [0.0, 0.25]].map(([dx, dy], i) => (
            <g key={i}>
              <circle
                cx={x + HEX_SIZE * dx}
                cy={y + HEX_SIZE * dy}
                r={HEX_SIZE * 0.18}
                fill={shade(fill, -0.2)}
                stroke={shade(fill, -0.5)}
                strokeWidth={0.4}
              />
              <circle
                cx={x + HEX_SIZE * (dx - 0.05)}
                cy={y + HEX_SIZE * (dy - 0.05)}
                r={HEX_SIZE * 0.08}
                fill={shade(fill, 0.2)}
                opacity={0.6}
              />
            </g>
          ))}
        </g>
      )}
      {hex.terrain === 'swamp' && !hex.isCapital && !hex.isSpawnZone && (
        <g pointerEvents="none">
          <ellipse
            cx={x - HEX_SIZE * 0.1}
            cy={y + HEX_SIZE * 0.15}
            rx={HEX_SIZE * 0.25}
            ry={HEX_SIZE * 0.08}
            fill={shade(fill, -0.3)}
            opacity={0.8}
          />
          <ellipse
            cx={x + HEX_SIZE * 0.2}
            cy={y - HEX_SIZE * 0.15}
            rx={HEX_SIZE * 0.15}
            ry={HEX_SIZE * 0.05}
            fill={shade(fill, -0.3)}
            opacity={0.8}
          />
        </g>
      )}
      {hex.terrain === 'ruins' && !hex.isSpawnZone && (
        <g pointerEvents="none">
          <rect
            x={x - HEX_SIZE * 0.3}
            y={y - HEX_SIZE * 0.05}
            width={HEX_SIZE * 0.2}
            height={HEX_SIZE * 0.35}
            fill={shade(fill, -0.3)}
            stroke={shade(fill, -0.6)}
            strokeWidth={0.4}
          />
          <rect
            x={x + HEX_SIZE * 0.05}
            y={y - HEX_SIZE * 0.2}
            width={HEX_SIZE * 0.2}
            height={HEX_SIZE * 0.5}
            fill={shade(fill, -0.25)}
            stroke={shade(fill, -0.6)}
            strokeWidth={0.4}
          />
        </g>
      )}
      {hex.terrain === 'road' && (
        <line
          x1={x - HEX_SIZE * 0.7}
          y1={y}
          x2={x + HEX_SIZE * 0.7}
          y2={y}
          stroke={shade(fill, -0.25)}
          strokeWidth={HEX_SIZE * 0.25}
          strokeLinecap="round"
          opacity={0.7}
          pointerEvents="none"
        />
      )}

      {/* Reachable dot */}
      {isReachable && !stack && (
        <circle cx={x} cy={y} r={HEX_SIZE * 0.18} fill="#60a5fa" fillOpacity={0.55} pointerEvents="none" />
      )}

      {/* Capital — small castle contained fully within hex */}
      {hex.isCapital && (
        <g pointerEvents="none">
          {/* Castle base */}
          <rect
            x={x - HEX_SIZE * 0.32}
            y={y + HEX_SIZE * 0.02}
            width={HEX_SIZE * 0.64}
            height={HEX_SIZE * 0.28}
            fill="#3a3a4a"
            stroke="#f5c518"
            strokeWidth={0.8}
          />
          {/* Crenellations */}
          {[-0.26, -0.12, 0.02, 0.16].map((dx, i) => (
            <rect
              key={i}
              x={x + HEX_SIZE * dx}
              y={y - HEX_SIZE * 0.06}
              width={HEX_SIZE * 0.07}
              height={HEX_SIZE * 0.1}
              fill="#3a3a4a"
              stroke="#f5c518"
              strokeWidth={0.5}
            />
          ))}
          {/* Central small tower */}
          <rect
            x={x - HEX_SIZE * 0.09}
            y={y - HEX_SIZE * 0.28}
            width={HEX_SIZE * 0.18}
            height={HEX_SIZE * 0.3}
            fill="#2a2a3a"
            stroke="#f5c518"
            strokeWidth={0.8}
          />
          {/* Tower roof */}
          <polygon
            points={`${x - HEX_SIZE * 0.11},${y - HEX_SIZE * 0.28} ${x},${y - HEX_SIZE * 0.42} ${x + HEX_SIZE * 0.11},${y - HEX_SIZE * 0.28}`}
            fill="#f5c518"
            stroke="#0a0a1a"
            strokeWidth={0.4}
          />
          {/* Crown mark above the roof */}
          <text
            x={x}
            y={y - HEX_SIZE * 0.45}
            textAnchor="middle"
            fontSize={HEX_SIZE * 0.22}
            fill="#f5c518"
            style={{ paintOrder: 'stroke', stroke: '#0a0a1a', strokeWidth: 0.8 }}
          >
            ♚
          </text>
        </g>
      )}

      {/* Spawn-zone skull (behind pulse to stay visible) */}
      {hex.isSpawnZone && !stack && (
        <text x={x} y={y + HEX_SIZE * 0.3} textAnchor="middle" fontSize={HEX_SIZE * 0.7}
          fill="#fca5a5" pointerEvents="none"
          style={{ paintOrder: 'stroke', stroke: '#450a0a', strokeWidth: 2 }}>
          ☠
        </text>
      )}

      {/* Citadel tower — 3D fortress contained fully within hex */}
      {hex.terrain === 'citadel' && !isBoss && (
        <g pointerEvents="none">
          {/* Outer walls */}
          <rect
            x={x - HEX_SIZE * 0.45}
            y={y - HEX_SIZE * 0.02}
            width={HEX_SIZE * 0.9}
            height={HEX_SIZE * 0.32}
            fill="#2a2a3a"
            stroke="#f5c518"
            strokeWidth={1}
          />
          {/* Crenellations */}
          {[-0.4, -0.2, 0, 0.2, 0.4].map((dx, i) => (
            <rect
              key={i}
              x={x + HEX_SIZE * (dx - 0.05)}
              y={y - HEX_SIZE * 0.12}
              width={HEX_SIZE * 0.1}
              height={HEX_SIZE * 0.12}
              fill="#2a2a3a"
              stroke="#f5c518"
              strokeWidth={0.7}
            />
          ))}
          {/* Central tower */}
          <rect
            x={x - HEX_SIZE * 0.18}
            y={y - HEX_SIZE * 0.38}
            width={HEX_SIZE * 0.36}
            height={HEX_SIZE * 0.4}
            fill="#1a1a2e"
            stroke="#f5c518"
            strokeWidth={1}
          />
          {/* Tower roof */}
          <polygon
            points={`${x - HEX_SIZE * 0.22},${y - HEX_SIZE * 0.38} ${x},${y - HEX_SIZE * 0.6} ${x + HEX_SIZE * 0.22},${y - HEX_SIZE * 0.38}`}
            fill="#8b1a1a"
            stroke="#f5c518"
            strokeWidth={0.8}
          />
          {/* Dark window */}
          <rect
            x={x - HEX_SIZE * 0.07}
            y={y - HEX_SIZE * 0.25}
            width={HEX_SIZE * 0.14}
            height={HEX_SIZE * 0.15}
            fill="#450a0a"
          />
          {/* Skull mark */}
          <text
            x={x}
            y={y - HEX_SIZE * 0.63}
            textAnchor="middle"
            fontSize={HEX_SIZE * 0.2}
            fill="#f5c518"
            style={{ paintOrder: 'stroke', stroke: '#0a0a1a', strokeWidth: 0.8 }}
          >
            💀
          </text>
        </g>
      )}

      {/* Attackable target marker */}
      {isAttackable && (
        <g pointerEvents="none">
          <circle cx={x} cy={y} r={HEX_SIZE * 0.9} fill="none" stroke="#f87171" strokeWidth={2} strokeDasharray="3 3">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="6s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* === Stack rendering (unit sprites) === */}
      {stack && (
        <StackGlyph
          stack={stack}
          cx={x}
          cy={y}
          isLocalPlayer={isLocalPlayer}
          isWrought={isWrought}
          isBoss={isBoss}
        />
      )}
    </g>
  );
}

const UNIT_ICON: Record<UnitType, string> = {
  infantry: '🛡',
  ranged: '🏹',
  mounted: '🐎',
  siege: '🏰',
  flying: '🦅',
};

function StackGlyph({
  stack, cx, cy, isLocalPlayer, isWrought, isBoss,
}: {
  stack: Stack;
  cx: number;
  cy: number;
  isLocalPlayer: boolean;
  isWrought: boolean;
  isBoss: boolean;
}) {
  // Choose the dominant unit type (most numerous, tiebreak: strongest attack).
  const counts = new Map<UnitType, number>();
  for (const u of stack.units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const dominant: UnitType =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || 0)[0]?.[0] ?? 'infantry';

  const primaryColor = isBoss
    ? '#450a0a'
    : isWrought
      ? '#7f1d1d'
      : isLocalPlayer
        ? '#10b981'
        : '#3b82f6';
  const strokeColor = isBoss
    ? '#f5c518'
    : isWrought
      ? '#fca5a5'
      : '#0a0a1a';

  // Boss — large multi-layer figure with wings/aura.
  if (isBoss) {
    return (
      <g pointerEvents="none">
        {/* Ground shadow */}
        <ellipse cx={cx} cy={cy + HEX_SIZE * 0.55} rx={HEX_SIZE * 0.55} ry={HEX_SIZE * 0.15} fill="#000" opacity={0.5} />
        {/* Pulsing menace ring */}
        <circle cx={cx} cy={cy} r={HEX_SIZE * 0.75} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.55}>
          <animate attributeName="r" values={`${HEX_SIZE * 0.7};${HEX_SIZE * 0.9};${HEX_SIZE * 0.7}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="3s" repeatCount="indefinite" />
        </circle>
        {/* Body base cylinder */}
        <ellipse cx={cx} cy={cy + HEX_SIZE * 0.25} rx={HEX_SIZE * 0.5} ry={HEX_SIZE * 0.16} fill={shade(primaryColor, -0.3)} stroke={strokeColor} strokeWidth={1.5} />
        <rect x={cx - HEX_SIZE * 0.5} y={cy - HEX_SIZE * 0.15} width={HEX_SIZE} height={HEX_SIZE * 0.4} fill={primaryColor} stroke={strokeColor} strokeWidth={1.5} />
        <ellipse cx={cx} cy={cy - HEX_SIZE * 0.15} rx={HEX_SIZE * 0.5} ry={HEX_SIZE * 0.16} fill={shade(primaryColor, 0.2)} stroke={strokeColor} strokeWidth={1.5} />
        {/* Cylindrical shading overlay */}
        <rect x={cx - HEX_SIZE * 0.5} y={cy - HEX_SIZE * 0.15} width={HEX_SIZE} height={HEX_SIZE * 0.4} fill="url(#unitBody)" />
        {/* Head dome */}
        <ellipse cx={cx} cy={cy - HEX_SIZE * 0.35} rx={HEX_SIZE * 0.28} ry={HEX_SIZE * 0.24} fill={shade(primaryColor, 0.1)} stroke={strokeColor} strokeWidth={1.2} />
        {/* Horn-like spikes */}
        <polygon points={`${cx - HEX_SIZE * 0.28},${cy - HEX_SIZE * 0.35} ${cx - HEX_SIZE * 0.4},${cy - HEX_SIZE * 0.7} ${cx - HEX_SIZE * 0.12},${cy - HEX_SIZE * 0.5}`} fill="#f5c518" stroke={strokeColor} strokeWidth={0.8} />
        <polygon points={`${cx + HEX_SIZE * 0.28},${cy - HEX_SIZE * 0.35} ${cx + HEX_SIZE * 0.4},${cy - HEX_SIZE * 0.7} ${cx + HEX_SIZE * 0.12},${cy - HEX_SIZE * 0.5}`} fill="#f5c518" stroke={strokeColor} strokeWidth={0.8} />
        {/* Skull face */}
        <text x={cx} y={cy - HEX_SIZE * 0.25} textAnchor="middle" fontSize={HEX_SIZE * 0.4}>💀</text>
        {/* Unit count badge */}
        <g>
          <circle cx={cx + HEX_SIZE * 0.55} cy={cy - HEX_SIZE * 0.45} r={HEX_SIZE * 0.25} fill="#0a0a1a" stroke="#f5c518" strokeWidth={1.2} />
          <text x={cx + HEX_SIZE * 0.55} y={cy - HEX_SIZE * 0.37} textAnchor="middle" fontSize={HEX_SIZE * 0.3} fontWeight="bold" fill="#fef3c7">
            {stack.units.length}
          </text>
        </g>
      </g>
    );
  }

  const dominantColor = UNIT_COLOR[dominant];
  // Body dimensions.
  const bodyTop = cy - HEX_SIZE * 0.15;
  const bodyBot = cy + HEX_SIZE * 0.15;
  const bodyRx = HEX_SIZE * 0.33;
  const bodyRy = HEX_SIZE * 0.1;
  // Head dimensions.
  const headCy = cy - HEX_SIZE * 0.4;
  const headR = HEX_SIZE * 0.2;

  return (
    <g pointerEvents="none">
      {/* Ground shadow */}
      <ellipse cx={cx} cy={cy + HEX_SIZE * 0.32} rx={HEX_SIZE * 0.35} ry={HEX_SIZE * 0.1} fill="#000" opacity={0.35} />

      {/* Cylindrical body (bottom ellipse = foot, rect = side wall, top ellipse = shoulder) */}
      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={bodyRy} fill={shade(primaryColor, -0.4)} stroke={strokeColor} strokeWidth={1.1} />
      <rect x={cx - bodyRx} y={bodyTop} width={bodyRx * 2} height={bodyBot - bodyTop} fill={primaryColor} stroke={strokeColor} strokeWidth={1.1} />
      <ellipse cx={cx} cy={bodyTop} rx={bodyRx} ry={bodyRy} fill={shade(primaryColor, 0.25)} stroke={strokeColor} strokeWidth={1.1} />
      {/* Vertical shading overlay for volume */}
      <rect x={cx - bodyRx} y={bodyTop} width={bodyRx * 2} height={bodyBot - bodyTop} fill="url(#unitBody)" />

      {/* Head dome (sphere illusion via circle + highlight) */}
      <circle cx={cx} cy={headCy} r={headR} fill={shade(primaryColor, 0.1)} stroke={strokeColor} strokeWidth={1.1} />
      {/* Head highlight (top-left bright spot) */}
      <ellipse cx={cx - headR * 0.3} cy={headCy - headR * 0.35} rx={headR * 0.35} ry={headR * 0.25} fill="#fff" opacity={0.35} />
      {/* Head shadow (bottom-right) */}
      <path d={`M ${cx + headR * 0.1},${headCy + headR * 0.5} A ${headR},${headR} 0 0 1 ${cx - headR * 0.7},${headCy + headR * 0.1} Z`} fill="#000" opacity={0.25} />

      {/* Dominant unit icon on the body */}
      <text
        x={cx}
        y={cy + HEX_SIZE * 0.12}
        textAnchor="middle"
        fontSize={HEX_SIZE * 0.4}
        style={{ paintOrder: 'stroke', stroke: strokeColor, strokeWidth: 1.3 }}
      >
        {UNIT_ICON[dominant]}
      </text>

      {/* Unit-type accent band across body */}
      <rect
        x={cx - bodyRx}
        y={cy - HEX_SIZE * 0.02}
        width={bodyRx * 2}
        height={HEX_SIZE * 0.08}
        fill={dominantColor}
        opacity={0.8}
      />

      {/* Unit count badge */}
      <g>
        <circle cx={cx + HEX_SIZE * 0.4} cy={cy - HEX_SIZE * 0.42} r={HEX_SIZE * 0.22} fill="#0a0a1a" stroke={isLocalPlayer ? '#10b981' : isWrought ? '#fca5a5' : '#3b82f6'} strokeWidth={1.2} />
        <text
          x={cx + HEX_SIZE * 0.4}
          y={cy - HEX_SIZE * 0.35}
          textAnchor="middle"
          fontSize={HEX_SIZE * 0.3}
          fontWeight="bold"
          fill="#fef3c7"
        >
          {stack.units.length}
        </text>
      </g>
    </g>
  );
}

function HexInfoPanel({
  hex, stack, onClose,
}: {
  hex: Hex;
  stack: Stack | null;
  onClose: () => void;
}) {
  const t = useI18n(s => s.t);
  const unitCounts = new Map<UnitType, number>();
  let totalHp = 0;
  if (stack) {
    for (const u of stack.units) {
      unitCounts.set(u.type, (unitCounts.get(u.type) ?? 0) + 1);
      totalHp += u.currentHp;
    }
  }
  const isBoss = stack?.id === BOSS_STACK_ID;
  const isDhakhan = stack?.ownerId === DHAKHAN_OWNER_ID;

  return (
    <div className="absolute top-2 left-2 z-30 panel-tight w-60 max-w-[85vw] space-y-2">
      <div className="flex items-center justify-between">
        <div className="eyebrow">
          {t.era3.terrain[hex.terrain]}
        </div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary text-xs">✕</button>
      </div>
      <div className="text-text-muted text-[10px] tabular-nums">
        ({hex.coord.q}, {hex.coord.r})
      </div>

      {hex.isCapital && (
        <div className="bg-game-gold/10 border border-game-gold/40 rounded-md p-2">
          <div className="text-game-gold text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.capital}
          </div>
          <div className="text-text-primary text-xs mt-0.5">
            {hex.capitalOwnerId
              ? `${t.era3.stackInfo.owner}: ${hex.capitalOwnerId}`
              : ''}
          </div>
        </div>
      )}

      {hex.terrain === 'citadel' && (
        <div className="bg-game-accent/10 border border-game-accent/40 rounded-md p-2">
          <div className="text-game-accent text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.citadel}
          </div>
          <div className="text-text-secondary text-[11px] mt-0.5">
            {t.era3.citadelHint ?? 'The heart of Dhakhan. Defeat the boss here to win.'}
          </div>
        </div>
      )}

      {hex.isSpawnZone && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-md p-2">
          <div className="text-red-400 text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.spawnZone}
          </div>
          <div className="text-text-secondary text-[11px] mt-0.5">
            {t.era3.spawnZoneHint ?? 'Wrought units appear here each cycle.'}
          </div>
        </div>
      )}

      {stack && (
        <div className="border-t border-border-subtle pt-2">
          <div className="eyebrow mb-1.5">
            {isBoss ? t.era3.bossLabel : isDhakhan ? t.era3.wrought : t.era3.stackInfo.title}
          </div>
          <div className="flex flex-wrap gap-1">
            {[...unitCounts.entries()].map(([type, count]) => (
              <div key={type} className="flex items-center gap-1 bg-game-bg/60 border border-border-subtle rounded px-1.5 py-0.5">
                <span className="text-xs">{UNIT_ICON[type]}</span>
                <span className="text-text-primary text-[10px] tabular-nums">×{count}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1.5 text-[10px]">
            <div className="bg-game-bg/40 rounded px-1.5 py-0.5">
              <span className="text-text-muted">{t.era3.stackInfo.totalHp}: </span>
              <span className="text-game-gold font-semibold tabular-nums">{totalHp}</span>
            </div>
            <div className="bg-game-bg/40 rounded px-1.5 py-0.5">
              <span className="text-text-muted">{t.era3.movementLeft}: </span>
              <span className="text-game-gold font-semibold tabular-nums">{stack.movementLeft}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
