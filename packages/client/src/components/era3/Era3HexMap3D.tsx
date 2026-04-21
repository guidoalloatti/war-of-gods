import { Suspense, useMemo, useRef, useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Html, Sky, Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';

// Context for map font scale — read by all sub-components that render text
const FontScaleContext = createContext(1.0);
const useFontScale = () => useContext(FontScaleContext);

// Tiny deterministic hash so every hex-decoration looks stable across re-renders.
function hash2(q: number, r: number, salt = 0): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h >>> 0) ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
import {
  reachableHexes,
  findPath,
  hexKey,
  neighbors,
  DIRECTIONS,
  DHAKHAN_OWNER_ID,
  BOSS_STACK_ID,
  UNIT_DEFINITIONS,
  ERA3_RECRUIT_COSTS,
  TERRAFORM_COST,
  BUILD_ROAD_OVERLAY_COST,
  DRAIN_WATER_COST,
  BUILD_BRIDGE_COST,
} from '@war-of-gods/engine';

const UNIT_ICON_MAP: Record<string, string> = {
  infantry: '🛡️', ranged: '🏹', mounted: '🐎', siege: '🏰', flying: '🦅',
};
const RECRUIT_COST_MAP: Record<string, number> = ERA3_RECRUIT_COSTS as Record<string, number>;
import type { GameMap, Hex, HexTerrain, Stack, HexCoord, UnitType } from '@war-of-gods/engine';

function unitMaxHp(type: UnitType): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}
import { useI18n } from '../../i18n/index.js';

const HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);

const TERRAIN_COLOR: Record<HexTerrain, string> = {
  plain: '#7bb07a',
  mountain: '#8a8680',
  hill: '#9aaa7a',
  forest: '#3d8553',
  swamp: '#6b4a20',
  desert: '#d9b97a',
  lake: '#3a6ea5',
  river: '#3a7ab5',
  road: '#c9a571',
  ruins: '#b8805a',
  citadel: '#2a2340',
};

// All hex prisms share the same base height — terrain differences live in decorations above
const HEX_HEIGHT = 0.18;
const TERRAIN_HEIGHT: Record<HexTerrain, number> = {
  plain: HEX_HEIGHT,
  road: HEX_HEIGHT,
  ruins: HEX_HEIGHT,
  swamp: HEX_HEIGHT,
  forest: HEX_HEIGHT,
  desert: HEX_HEIGHT,
  lake: HEX_HEIGHT,
  river: HEX_HEIGHT,
  hill: HEX_HEIGHT,
  mountain: HEX_HEIGHT,
  citadel: HEX_HEIGHT,
};

const UNIT_COLOR: Record<UnitType, string> = {
  infantry: '#94a3b8',
  ranged: '#a78bfa',
  mounted: '#22d3ee',
  siege: '#fb923c',
  flying: '#f472b6',
};

function hexToWorld(q: number, r: number): [number, number] {
  // Flat-top axial → world (XZ plane, Y up).
  const x = HEX_RADIUS * SQRT3 * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return [x, z];
}

export type HexContextAction =
  | { kind: 'build_road'; coord: HexCoord }
  | { kind: 'build_road_overlay'; coord: HexCoord; stackId: string }
  | { kind: 'terraform'; coord: HexCoord; stackId: string }
  | { kind: 'drain_water'; coord: HexCoord; stackId: string }
  | { kind: 'build_bridge'; coord: HexCoord; stackId: string }
  | { kind: 'recruit'; coord: HexCoord; unitType: UnitType }
  | { kind: 'rest_stack'; stackId: string }
  | { kind: 'fortify_stack'; stackId: string }
  | { kind: 'unfortify_stack'; stackId: string }
  | { kind: 'disband_unit'; stackId: string; unitId: string; unitType: UnitType };

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
  onInspectHex?: (hex: Hex, stack: Stack | null) => void;
  /** Context menu actions available when right-clicking a hex. */
  onHexContextAction?: (action: HexContextAction) => void;
  /** Unit types the player can currently recruit (for context menu). */
  recruitableUnits?: UnitType[];
  /** Whether building a road is currently possible. */
  canBuildRoad?: boolean;
  /** Recently-resolved combats — rendered as brief impact bursts on the map. */
  recentCombats?: Array<{ q: number; r: number; id: string }>;
};

export function Era3HexMap3D(props: Props) {
  const {
    map, stacks, localPlayerId, activePlayerId,
    selectedStackId, onSelectStack, onMoveStack, onAttackStack,
    buildingRoad = false, eligibleRoadHexes, onBuildRoad, onCancelBuildRoad,
    onInspectHex, recentCombats, onHexContextAction, recruitableUnits, canBuildRoad,
  } = props;

  // Context menu state — pixel position + which hex was right-clicked.
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; hex: Hex;
  } | null>(null);

  // Hex info panel — shown in bottom-left on left-click.
  const [inspectedHex, setInspectedHex] = useState<Hex | null>(null);

  const t = useI18n(s => s.t);
  const mapFontScale = useI18n(s => s.mapFontScale);

  const selectedStack = selectedStackId ? stacks[selectedStackId] ?? null : null;

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
    const isFlying = selectedStack.units.length > 0 && selectedStack.units.every(u => u.type === 'flying');
    return reachableHexes(map, stacks, selectedStack.id, selectedStack.position, selectedStack.movementLeft, isFlying);
  }, [selectedStack, map, stacks, onMoveStack, canControlStack]);

  const attackable = useMemo(() => {
    if (!selectedStack || !onAttackStack) return new Set<string>();
    if (!canControlStack(selectedStack)) return new Set<string>();
    if (selectedStack.units.length > 0 && selectedStack.units.every(u => u.hasAttackedThisTurn)) {
      return new Set<string>();
    }
    const hasSiege = selectedStack.units.some(u => u.type === 'siege' && !u.hasAttackedThisTurn);
    const out = new Set<string>();
    // Adjacency (all units)
    for (const n of neighbors(selectedStack.position)) {
      const k = hexKey(n);
      const h = map.hexes[k];
      if (!h?.stackId) continue;
      const s = stacks[h.stackId];
      if (s && s.ownerId === DHAKHAN_OWNER_ID) out.add(k);
    }
    // Distance-2 (siege only)
    if (hasSiege) {
      for (const n1 of neighbors(selectedStack.position)) {
        for (const n2 of neighbors(n1)) {
          const k = hexKey(n2);
          if (hexKey(selectedStack.position) === k) continue;
          if (out.has(k)) continue; // already adjacent
          const h = map.hexes[k];
          if (!h?.stackId) continue;
          const s = stacks[h.stackId];
          if (s && s.ownerId === DHAKHAN_OWNER_ID) out.add(k);
        }
      }
    }
    return out;
  }, [selectedStack, map, stacks, onAttackStack, canControlStack]);

  const handleHexClick = useCallback((hex: Hex) => {
    const k = hexKey(hex.coord);
    if (buildingRoad) {
      if (eligibleRoadHexes?.has(k) && onBuildRoad) onBuildRoad(hex.coord);
      else if (onCancelBuildRoad) onCancelBuildRoad();
      return;
    }
    if (hex.stackId) {
      const s = stacks[hex.stackId];
      if (s && canControlStack(s)) {
        onSelectStack(selectedStackId === s.id ? null : s.id);
        return;
      }
    }
    if (selectedStack) {
      if (attackable.has(k) && onAttackStack) {
        onAttackStack(selectedStack.id, hex.coord);
        return;
      }
      if (onMoveStack && reach) {
        if (k === hexKey(selectedStack.position)) {
          onSelectStack(null);
          return;
        }
        if (reach.has(k) && (reach.get(k) ?? 0) > 0) {
          const isFlying = selectedStack.units.length > 0 && selectedStack.units.every(u => u.type === 'flying');
          const path = findPath(
            map, stacks, selectedStack.id, selectedStack.position, hex.coord,
            selectedStack.movementLeft, isFlying,
          );
          if (path && path.length > 0) {
            onMoveStack(selectedStack.id, path);
            onSelectStack(null);
            return;
          }
        }
      }
    }
    if (hex.stackId && !selectedStackId) {
      onSelectStack(hex.stackId);
    }
    // Always update info panel on left-click.
    setInspectedHex(hex);
  }, [
    buildingRoad, eligibleRoadHexes, onBuildRoad, onCancelBuildRoad,
    stacks, canControlStack, onSelectStack, selectedStackId, selectedStack,
    attackable, onAttackStack, onMoveStack, reach, map,
  ]);

  const handleHexContext = useCallback((hex: Hex, e: MouseEvent) => {
    // Always show context menu on right-click.
    const rect = (e.target as HTMLElement).closest('#era3-hex-map-3d')?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;
    setCtxMenu({ x, y, hex });
  }, []);

  // Keyboard movement — QWE/ASD + arrows; same semantics as the SVG map.
  const [pendingAttack, setPendingAttack] = useState<{ attackerStackId: string; coord: HexCoord } | null>(null);

  useEffect(() => {
    if (!selectedStack || !canControlStack(selectedStack)) return;
    if (pendingAttack) return;

    const keyToDir: Record<string, number> = {
      e: 0, d: 0, arrowright: 0,
      w: 1, arrowup: 1,
      q: 2,
      a: 3, arrowleft: 3,
      s: 4,
      x: 5, arrowdown: 5,
    };

    const onKey = (e: KeyboardEvent) => {
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
      if (targetHex.stackId) {
        const ts = stacks[targetHex.stackId];
        if (ts && ts.ownerId === DHAKHAN_OWNER_ID) {
          if (!onAttackStack) return;
          if (selectedStack.units.every(u => u.hasAttackedThisTurn)) return;
          setPendingAttack({ attackerStackId: selectedStack.id, coord: target });
          return;
        }
        return;
      }
      if (!onMoveStack || !reach) return;
      if (!reach.has(targetKey)) return;
      if ((reach.get(targetKey) ?? 0) <= 0) return;
      const isFlying = selectedStack.units.length > 0 && selectedStack.units.every(u => u.type === 'flying');
      const path = findPath(
        map, stacks, selectedStack.id,
        selectedStack.position, target,
        selectedStack.movementLeft, isFlying,
      );
      if (path && path.length > 0) onMoveStack(selectedStack.id, path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selectedStack, selectedStackId, canControlStack, pendingAttack,
    map, stacks, reach, onMoveStack, onAttackStack, onSelectStack,
  ]);

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

  const hexList = useMemo(() => Object.values(map.hexes), [map]);

  return (
    <div
      id="era3-hex-map-3d"
      className="relative w-full h-full min-h-[420px] overflow-hidden select-none touch-manipulation rounded-lg"
      onContextMenu={e => e.preventDefault()}
    >
      <FontScaleContext.Provider value={mapFontScale}>
      <Canvas
        camera={{ position: [0, 22, 22], fov: 45, near: 0.1, far: 500 }}
        shadows
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#1a2140']} />
          <fog attach="fog" args={['#2a2f55', 28, 70]} />
          <Sky
            distance={450000}
            sunPosition={[60, 18, 40]}
            inclination={0.48}
            azimuth={0.25}
            turbidity={6}
            rayleigh={1.2}
            mieCoefficient={0.01}
            mieDirectionalG={0.85}
          />
          <Clouds material={THREE.MeshBasicMaterial} limit={40}>
            <Cloud position={[-12, 14, -10]} seed={3} segments={18} bounds={[6, 1.5, 4]} volume={5} color="#e8e6f0" opacity={0.45} />
            <Cloud position={[14, 15, -6]} seed={7} segments={16} bounds={[5, 1.2, 3.5]} volume={4} color="#dfe1ee" opacity={0.4} />
            <Cloud position={[0, 16, 16]} seed={11} segments={20} bounds={[7, 1.5, 4]} volume={6} color="#e8e6f0" opacity={0.35} />
          </Clouds>
          <GroundDisc />
          <DistantMountains />
          <Motes />
          <ambientLight intensity={0.45} />
          <directionalLight
            position={[15, 25, 10]}
            intensity={1.15}
            color="#fff3d9"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={80}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />
          <hemisphereLight args={['#c4d8ff', '#3a2d1e', 0.4]} />

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
            // Count same-terrain neighbors for decoration scaling.
            const neighborCount = DIRECTIONS.reduce((acc, d) => {
              const nk = hexKey({ q: h.coord.q + d.q, r: h.coord.r + d.r });
              const nh = map.hexes[nk];
              return acc + (nh && nh.terrain === h.terrain ? 1 : 0);
            }, 0);
            // Compute which of the 6 neighbors share a road/capital/citadel
            // so RoadDecor can draw connectors toward them.
            const roadDirs = h.terrain === 'road'
              ? DIRECTIONS.map((d, idx) => {
                  const nk = hexKey({ q: h.coord.q + d.q, r: h.coord.r + d.r });
                  const nh = map.hexes[nk];
                  if (!nh) return null;
                  const connects = nh.terrain === 'road' || nh.isCapital || nh.terrain === 'citadel';
                  return connects ? idx : null;
                }).filter((v): v is number => v !== null)
              : [];
            return (
              <HexPrism
                key={key}
                hex={h}
                stack={stack}
                roadDirs={roadDirs}
                neighborCount={neighborCount}
                isLocalPlayer={isLocalPlayer}
                isWrought={isWrought}
                isBoss={isBoss}
                isSelected={isSelected}
                isReachable={isReachable}
                isAttackable={isAttackable}
                isRoadEligible={isRoadEligible}
                onClick={() => handleHexClick(h)}
                onContext={(e) => handleHexContext(h, e)}
              />
            );
          })}

          {recentCombats?.map(c => {
            const [x, z] = hexToWorld(c.q, c.r);
            return <ImpactBurst key={c.id} x={x} z={z} />;
          })}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={6}
            maxDistance={55}
            minPolarAngle={0.12}
            maxPolarAngle={Math.PI / 2.08}
            target={[0, 0, 0]}
            enableDamping
            dampingFactor={0.12}
            zoomSpeed={0.9}
            panSpeed={0.8}
            rotateSpeed={0.6}
            screenSpacePanning={false}
            makeDefault
          />
        </Suspense>
      </Canvas>
      </FontScaleContext.Provider>

      {pendingAttack && onAttackStack && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="panel-accent max-w-xs w-[90%] text-center space-y-3">
            <div className="text-3xl">⚔️</div>
            <div className="text-text-primary font-bold">
              {t.era3.confirmAttack?.title ?? 'Confirm attack'}
            </div>
            <div className="text-text-secondary text-xs">
              {t.era3.confirmAttack?.body ?? 'Attack the enemy stack?'}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingAttack(null)} className="btn-sm btn-ghost flex-1">
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

      {/* Hex right-click context menu */}
      {ctxMenu && onHexContextAction && (
        <>
          {/* backdrop to dismiss */}
          <div
            className="absolute inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="absolute z-50 min-w-[160px] rounded-xl border border-border-medium bg-game-surface/95 backdrop-blur-sm shadow-xl py-1 animate-scale-in"
            style={{ left: Math.min(ctxMenu.x, 9999), top: Math.min(ctxMenu.y, 9999) }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider border-b border-border-subtle mb-1">
              ({ctxMenu.hex.coord.q}, {ctxMenu.hex.coord.r})
              {ctxMenu.hex.isCapital ? ` · ${t.era3.legend.capital}` : ''}
            </div>

            {/* Build road — available on plain/forest/swamp/ruins hexes */}
            {canBuildRoad && !ctxMenu.hex.isCapital && !['mountain', 'desert', 'citadel', 'road', 'river', 'lake'].includes(ctxMenu.hex.terrain) && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-game-gold/10 hover:text-game-gold transition-colors"
                onClick={() => {
                  onHexContextAction({ kind: 'build_road', coord: ctxMenu.hex.coord });
                  setCtxMenu(null);
                }}
              >
                <span>🛤️</span>
                <span>{t.era3.buildRoad?.build ?? 'Build Road'}</span>
              </button>
            )}

            {/* Terrain actions — build road overlay or terraform; require own adjacent/on stack */}
            {(() => {
              const ctxStack2 = ctxMenu.hex.stackId ? stacks[ctxMenu.hex.stackId] ?? null : null;
              const isOwnAdjacentStack = ctxStack2 && ctxStack2.ownerId === localPlayerId && ctxStack2.ownerId === activePlayerId;
              if (!isOwnAdjacentStack || !ctxStack2 || ctxStack2.hasActedThisTurn) return null;
              const terrain = ctxMenu.hex.terrain;
              const canOverlay = (terrain === 'mountain' || terrain === 'desert') && !ctxMenu.hex.hasRoadOverlay;
              const canTerraform = terrain === 'desert' || terrain === 'mountain' || terrain === 'swamp';
              const canDrainWater = terrain === 'lake' || terrain === 'river';
              const canBridge = terrain === 'river' && !ctxMenu.hex.hasBridge;
              if (!canOverlay && !canTerraform && !canDrainWater && !canBridge) return null;
              const rm = t.era3.terraformActions;
              const terraformLabel: Record<string, string> = {
                desert: rm.irrigate,
                mountain: rm.erode,
                swamp: rm.drain,
              };
              return (
                <>
                  <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-t border-border-subtle mt-1">
                    {rm.label}
                  </div>
                  {canOverlay && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'build_road_overlay', coord: ctxMenu.hex.coord, stackId: ctxStack2.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>🛤️</span>
                      <span className="flex-1">{rm.buildRoadOverlay}</span>
                      <span className="text-game-gold text-[11px]">💰{BUILD_ROAD_OVERLAY_COST}</span>
                    </button>
                  )}
                  {canTerraform && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'terraform', coord: ctxMenu.hex.coord, stackId: ctxStack2.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>🌱</span>
                      <span className="flex-1">{terraformLabel[terrain] ?? rm.irrigate}</span>
                      <span className="text-game-gold text-[11px]">💰{TERRAFORM_COST}</span>
                    </button>
                  )}
                  {canDrainWater && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-sky-500/10 hover:text-sky-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'drain_water', coord: ctxMenu.hex.coord, stackId: ctxStack2.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>💧</span>
                      <span className="flex-1">{rm.drainWater}</span>
                      <span className="text-game-gold text-[11px]">💰{DRAIN_WATER_COST}</span>
                    </button>
                  )}
                  {canBridge && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'build_bridge', coord: ctxMenu.hex.coord, stackId: ctxStack2.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>🌉</span>
                      <span className="flex-1">{rm.buildBridge}</span>
                      <span className="text-game-gold text-[11px]">💰{BUILD_BRIDGE_COST}</span>
                    </button>
                  )}
                </>
              );
            })()}

            {/* Recruit units — only at own capital */}
            {ctxMenu.hex.isCapital && ctxMenu.hex.capitalOwnerId === localPlayerId && recruitableUnits && recruitableUnits.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
                  {t.era3.recruit ?? 'Recruit'}
                </div>
                {recruitableUnits.map(ut => (
                  <button
                    key={ut}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                    onClick={() => {
                      onHexContextAction({ kind: 'recruit', coord: ctxMenu.hex.coord, unitType: ut });
                      setCtxMenu(null);
                    }}
                  >
                    <span>{UNIT_ICON_MAP[ut]}</span>
                    <span className="flex-1">{t.units[ut]}</span>
                    <span className="text-game-gold text-[11px]">💰{RECRUIT_COST_MAP[ut]}</span>
                  </button>
                ))}
              </>
            )}

            {/* Stack actions — available when right-clicking own stack */}
            {(() => {
              const ctxStack = ctxMenu.hex.stackId ? stacks[ctxMenu.hex.stackId] ?? null : null;
              const isOwnCtxStack = ctxStack && ctxStack.ownerId === localPlayerId && ctxStack.ownerId === activePlayerId;
              if (!isOwnCtxStack || !ctxStack) return null;
              const allIdle = ctxStack.units.every(u => !u.hasMovedThisTurn && !u.hasAttackedThisTurn);
              return (
                <>
                  <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-t border-border-subtle mt-1">
                    {t.era3.stackActions?.label ?? 'Troop'}
                  </div>
                  {/* Rest */}
                  <button
                    type="button"
                    disabled={!allIdle}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-blue-500/10 hover:text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => {
                      onHexContextAction({ kind: 'rest_stack', stackId: ctxStack.id });
                      setCtxMenu(null);
                    }}
                  >
                    <span>💤</span>
                    <span className="flex-1">{t.era3.stackActions?.rest ?? 'Rest (heal 50%)'}</span>
                  </button>
                  {/* Fortify / Unfortify */}
                  {ctxStack.fortified ? (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'unfortify_stack', stackId: ctxStack.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>🔓</span>
                      <span>{t.era3.stackActions?.unfortify ?? 'Unfortify'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'fortify_stack', stackId: ctxStack.id });
                        setCtxMenu(null);
                      }}
                    >
                      <span>🛡️</span>
                      <span>{t.era3.stackActions?.fortify ?? 'Fortify (×2 defense)'}</span>
                    </button>
                  )}
                  {/* Disband each unit */}
                  <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
                    {t.era3.stackActions?.disband ?? 'Disband unit'}
                  </div>
                  {ctxStack.units.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      onClick={() => {
                        onHexContextAction({ kind: 'disband_unit', stackId: ctxStack.id, unitId: u.id, unitType: u.type });
                        setCtxMenu(null);
                      }}
                    >
                      <span>{UNIT_ICON_MAP[u.type]}</span>
                      <span className="flex-1">{t.units[u.type]}</span>
                      <span className="text-emerald-400 text-[11px]">+💰{Math.floor(RECRUIT_COST_MAP[u.type] * 2 / 3)}</span>
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        </>
      )}

      <div className="absolute bottom-2 left-2 z-20 text-text-faint text-[10px] pointer-events-none hidden sm:block">
        {t.era3.map?.hint ?? 'Drag to pan · Right-drag rotates · Scroll zoom · Right-click hex for actions'}
      </div>

      {/* Hex info panel — bottom-left, shown on left-click */}
      {inspectedHex && (
        <div className="absolute bottom-8 left-2 z-20 min-w-[180px] max-w-[220px] rounded-xl border border-border-medium bg-game-surface/90 backdrop-blur-sm shadow-xl p-3 animate-scale-in text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-game-gold font-bold uppercase tracking-wider text-[10px]">
              ({inspectedHex.coord.q}, {inspectedHex.coord.r})
            </span>
            <button
              type="button"
              className="text-text-muted hover:text-text-primary text-[10px] leading-none"
              onClick={() => setInspectedHex(null)}
            >✕</button>
          </div>
          <div className="text-text-primary font-semibold mb-1">
            {t.era3.terrain?.[inspectedHex.terrain] ?? inspectedHex.terrain}
            {inspectedHex.hasBridge && <span className="ml-1 text-amber-300">🌉</span>}
            {inspectedHex.hasRoadOverlay && <span className="ml-1 text-amber-200">🛤️</span>}
          </div>
          <div className="space-y-0.5 text-text-secondary">
            {inspectedHex.isCapital && (
              <div>🏰 {t.era3.legend?.capital ?? 'Capital'}{inspectedHex.capitalOwnerId ? ` · ${inspectedHex.capitalOwnerId.slice(0, 8)}` : ''}</div>
            )}
            {inspectedHex.isSpawnZone && (
              <div>{inspectedHex.spawnZoneDestroyed ? '💀 Zona destruida' : `☠ ${t.era3.legend?.spawnZone ?? 'Spawn zone'}`}</div>
            )}
            {inspectedHex.hasFort && <div>🛡️ Fortaleza</div>}
            {inspectedHex.ruinsReward && !inspectedHex.ruinsLooted && (
              <div>✨ Ruinas sin saquear</div>
            )}
            {inspectedHex.ruinsLooted && <div className="text-text-faint">{t.era3.ruinsModal?.empty ?? '—'}</div>}
            {(() => {
              const st = inspectedHex.stackId ? stacks[inspectedHex.stackId] : null;
              if (!st) return null;
              return (
                <div className="mt-1 border-t border-border-subtle pt-1">
                  <div className="text-text-primary font-medium mb-0.5">
                    {st.ownerId === DHAKHAN_OWNER_ID ? `☠ ${t.era3.wrought}` : `${t.era3.stackInfo.units}: ${st.units.length}`}
                  </div>
                  {st.units.map(u => (
                    <div key={u.id} className="flex items-center gap-1">
                      <span>{UNIT_ICON_MAP[u.type]}</span>
                      <span>{t.units[u.type]}</span>
                      <span className="ml-auto text-emerald-400">{u.currentHp}hp</span>
                    </div>
                  ))}
                  {st.fortified && <div className="text-amber-300 mt-0.5">🛡 {t.era3.stackActions.fortify}</div>}
                </div>
              );
            })()}
            <div className="mt-1 border-t border-border-subtle pt-1 text-text-faint">
              {t.era3.terrain?.[inspectedHex.terrain] === inspectedHex.terrain ? null : (
                <span className="capitalize">{inspectedHex.terrain}</span>
              )}
              {inspectedHex.terrain === 'river' && !inspectedHex.hasBridge && (
                <span className="text-red-400"> · No cruzable sin puente</span>
              )}
              {inspectedHex.terrain === 'river' && inspectedHex.hasBridge && (
                <span className="text-green-400"> · Puente construido</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HexPrism({
  hex, stack, roadDirs, neighborCount, isLocalPlayer, isWrought, isBoss,
  isSelected, isReachable, isAttackable, isRoadEligible,
  onClick, onContext,
}: {
  hex: Hex;
  stack: Stack | null;
  roadDirs: number[];
  neighborCount: number;
  isLocalPlayer: boolean;
  isWrought: boolean;
  isBoss: boolean;
  isSelected: boolean;
  isReachable: boolean;
  isAttackable: boolean;
  isRoadEligible: boolean;
  onClick: () => void;
  onContext: (e: MouseEvent) => void;
}) {
  const fontScale = useFontScale();
  const [x, z] = hexToWorld(hex.coord.q, hex.coord.r);
  const height = TERRAIN_HEIGHT[hex.terrain];
  // Road hexes show a plain-grass base so the terrain is still visible under the road decor.
  const color = hex.terrain === 'road' ? TERRAIN_COLOR.plain : TERRAIN_COLOR[hex.terrain];
  const [hovered, setHovered] = useState(false);

  const outlineColor = isRoadEligible ? '#fbbf24'
    : isSelected ? '#fde68a'
    : isAttackable ? '#f87171'
    : isReachable ? '#60a5fa'
    : hex.isCapital ? '#f5c518'
    : hex.isSpawnZone ? '#ef4444'
    : null;

  return (
    <group position={[x, 0, z]}>
      {/* Hex prism (cylinder with 6 sides) */}
      <mesh
        position={[0, height / 2, 0]}
        onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onContextMenu={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); e.nativeEvent.preventDefault(); onContext(e.nativeEvent); }}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[HEX_RADIUS * 0.98, HEX_RADIUS * 0.98, height, 6]} />
        <meshStandardMaterial
          color={color}
          roughness={0.75}
          metalness={0.05}
          emissive={hovered ? color : '#000'}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
      </mesh>

      {/* Outline ring — rotated 30° in its own plane (Z axis) to align with hex edges */}
      {outlineColor && (
        <mesh position={[0, height + 0.015, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
          <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.99, 6]} />
          <meshBasicMaterial color={outlineColor} side={THREE.DoubleSide} transparent opacity={0.95} />
        </mesh>
      )}

      {/* Reachable-blue dot on empty, reachable hexes */}
      {isReachable && !stack && (
        <mesh position={[0, height + 0.02, 0]}>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={0.6} />
        </mesh>
      )}

      {/* Capital castle */}
      {hex.isCapital && (
        <group position={[0, height, 0]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            <meshStandardMaterial color="#3a3a4a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.65, 0]} castShadow>
            <boxGeometry args={[0.45, 0.5, 0.45]} />
            <meshStandardMaterial color="#2a2a3a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <coneGeometry args={[0.3, 0.4, 4]} />
            <meshStandardMaterial color="#f5c518" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Citadel fortress */}
      {hex.terrain === 'citadel' && (
        <group position={[0, height, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[1.4, 0.6, 1.4]} />
            <meshStandardMaterial color="#2a2a3a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow>
            <boxGeometry args={[0.7, 0.7, 0.7]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, 0]} castShadow>
            <coneGeometry args={[0.48, 0.5, 4]} />
            <meshStandardMaterial color="#8b1a1a" roughness={0.4} />
          </mesh>
          <pointLight position={[0, 1.5, 0]} intensity={1.2} color="#f5c518" distance={6} />
        </group>
      )}

      {/* Spawn-zone: skull when active, black fortress when destroyed */}
      {hex.isSpawnZone && !hex.spawnZoneDestroyed && !stack && (
        <Text
          position={[0, height + 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={1.4 * fontScale}
          color="#fca5a5"
          outlineColor="#450a0a"
          outlineWidth={0.06}
          anchorX="center"
          anchorY="middle"
        >
          {'☠'}
        </Text>
      )}
      {hex.isSpawnZone && hex.spawnZoneDestroyed && (
        <group position={[0, height, 0]}>
          {/* Base */}
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[1.0, 0.4, 1.0]} />
            <meshStandardMaterial color="#0d0d0d" roughness={0.9} metalness={0.2} />
          </mesh>
          {/* Tower */}
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#111111" roughness={0.85} metalness={0.25} />
          </mesh>
          {/* Broken battlements — two partial crenels */}
          <mesh position={[-0.2, 0.95, 0]} castShadow>
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
          </mesh>
          <mesh position={[0.2, 0.9, 0]} castShadow>
            <boxGeometry args={[0.15, 0.12, 0.15]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
          </mesh>
          {/* Dark ember glow */}
          <pointLight position={[0, 0.5, 0]} intensity={0.5} color="#220000" distance={3} />
        </group>
      )}

      {/* Standalone fort */}
      {hex.hasFort && !hex.isCapital && !hex.isSpawnZone && hex.terrain !== 'citadel' && (
        <group position={[0, height, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.7, 0.3, 0.7]} />
            <meshStandardMaterial color="#4a3f2f" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.38, 0]} castShadow>
            <boxGeometry args={[0.35, 0.25, 0.35]} />
            <meshStandardMaterial color="#3a2f1f" roughness={0.8} />
          </mesh>
          {/* Battlements — four corner nubs */}
          {([ [-0.18, 0, -0.18], [0.18, 0, -0.18], [-0.18, 0, 0.18], [0.18, 0, 0.18] ] as [number, number, number][]).map(([px, py, pz], i) => (
            <mesh key={i} position={[px, 0.55 + py, pz]} castShadow>
              <boxGeometry args={[0.1, 0.12, 0.1]} />
              <meshStandardMaterial color="#4a3f2f" roughness={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {/* Terrain decorations */}
      {hex.terrain === 'plain' && !hex.isCapital && (
        <PlainDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={neighborCount} />
      )}
      {hex.terrain === 'forest' && !hex.isCapital && (
        <ForestDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={neighborCount} />
      )}
      {hex.terrain === 'mountain' && !hex.isCapital && (
        <MountainDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={neighborCount} />
      )}
      {hex.terrain === 'ruins' && !hex.isSpawnZone && (
        <RuinsDecor q={hex.coord.q} r={hex.coord.r} height={height} unlooted={!hex.ruinsLooted && !!hex.ruinsReward && hex.ruinsReward.kind !== 'empty'} />
      )}
      {hex.terrain === 'swamp' && !hex.isCapital && (
        <SwampDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={neighborCount} />
      )}
      {hex.terrain === 'desert' && !hex.isCapital && (
        <DesertDecor q={hex.coord.q} r={hex.coord.r} height={height} />
      )}
      {hex.terrain === 'lake' && (
        <LakeDecor q={hex.coord.q} r={hex.coord.r} height={height} />
      )}
      {hex.terrain === 'river' && (
        <RiverDecor q={hex.coord.q} r={hex.coord.r} height={height} />
      )}
      {/* Bridge structure on river hex */}
      {hex.terrain === 'river' && hex.hasBridge && (
        <group position={[0, height + 0.02, 0]}>
          {/* Bridge deck */}
          <mesh position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.22, 0.06, 1.6]} />
            <meshStandardMaterial color="#7a5a30" roughness={0.85} />
          </mesh>
          {/* Railings */}
          <mesh position={[-0.09, 0.10, 0]}>
            <boxGeometry args={[0.02, 0.14, 1.6]} />
            <meshStandardMaterial color="#5a3a18" roughness={0.9} />
          </mesh>
          <mesh position={[0.09, 0.10, 0]}>
            <boxGeometry args={[0.02, 0.14, 1.6]} />
            <meshStandardMaterial color="#5a3a18" roughness={0.9} />
          </mesh>
          {/* Arch supports */}
          {[-0.5, 0, 0.5].map((dz, i) => (
            <mesh key={i} position={[0, -0.04, dz]}>
              <boxGeometry args={[0.28, 0.08, 0.06]} />
              <meshStandardMaterial color="#6a4a22" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
      {hex.terrain === 'hill' && !hex.isCapital && (
        <HillDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={neighborCount} />
      )}
      {hex.terrain === 'road' && !hex.isCapital && (
        <>
          {/* Sparse grass under the road so terrain base is still visible */}
          <PlainDecor q={hex.coord.q} r={hex.coord.r} height={height} neighborCount={0} />
          <RoadDecor height={height} connections={roadDirs} />
        </>
      )}
      {/* Road overlay on mountain/desert — thin path strip on top */}
      {hex.hasRoadOverlay && hex.terrain !== 'road' && (
        <RoadDecor height={height + 0.02} connections={roadDirs} overlay />
      )}

      {/* Stack visualization — up to 6 unit cylinders in a 3x2 grid, with veteran crown */}
      {stack && (
        <StackGroup
          stack={stack}
          baseY={height}
          isLocalPlayer={isLocalPlayer}
          isWrought={isWrought}
          isBoss={isBoss}
          isSelected={isSelected}
        />
      )}
    </group>
  );
}

function StackGroup({
  stack, baseY, isLocalPlayer, isWrought, isBoss, isSelected,
}: {
  stack: Stack;
  baseY: number;
  isLocalPlayer: boolean;
  isWrought: boolean;
  isBoss: boolean;
  isSelected: boolean;
}) {
  const fontScale = useFontScale();
  // Smooth animation of stack position (from-to target).
  const ref = useRef<THREE.Group>(null);
  const [x, z] = hexToWorld(stack.position.q, stack.position.r);
  const current = useRef<{ x: number; z: number }>({ x, z });

  useFrame((_state, dt) => {
    const g = ref.current;
    if (!g) return;
    // Lerp toward target world position. The parent <group> is already at the
    // target hex; this translates relative offset back to zero smoothly so stacks
    // "slide" when their hex changes.
    current.current.x += (0 - current.current.x) * Math.min(1, dt * 6);
    current.current.z += (0 - current.current.z) * Math.min(1, dt * 6);
    g.position.x = current.current.x;
    g.position.z = current.current.z;
  });

  useEffect(() => {
    // When the stack moves to a new hex, offset current so we animate in.
    const [nx, nz] = hexToWorld(stack.position.q, stack.position.r);
    current.current.x = x - nx;
    current.current.z = z - nz;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.position.q, stack.position.r]);

  // Aggregate HP totals for the whole stack (used by boss and normal stacks).
  const totalHp = stack.units.reduce((s, u) => s + Math.max(0, u.currentHp), 0);
  const totalMaxHp = stack.units.reduce((s, u) => s + unitMaxHp(u.type), 0);
  const hpRatio = totalMaxHp > 0 ? totalHp / totalMaxHp : 0;
  const hpColor = hpRatio > 0.6 ? '#4ade80' : hpRatio > 0.3 ? '#facc15' : '#f87171';

  if (isBoss) {
    return (
      <group ref={ref} position={[0, baseY, 0]}>
        <pointLight position={[0, 1.5, 0]} color="#ef4444" intensity={1.5} distance={5} />
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.65, 1.1, 12]} />
          <meshStandardMaterial color="#450a0a" roughness={0.6} emissive="#7f1d1d" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 1.35, 0]} castShadow>
          <sphereGeometry args={[0.35, 16, 12]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.5} emissive="#450a0a" emissiveIntensity={0.4} />
        </mesh>
        <Text position={[0, 1.35, 0.36]} fontSize={0.3} color="#fef3c7" anchorX="center" anchorY="middle">
          {'💀'}
        </Text>
        {/* Boss aggregate HP bar */}
        <Html
          position={[0, 2.1, 0]}
          center
          distanceFactor={10}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ width: 80 * fontScale, textAlign: 'center' }}>
            <div style={{ fontSize: 13 * fontScale, color: '#fca5a5', fontWeight: 700, marginBottom: 2, textShadow: '0 1px 3px #000' }}>
              💀 {totalHp}/{totalMaxHp}
            </div>
            <div style={{ width: '100%', height: 7 * fontScale, background: '#1a0a0a', borderRadius: 3, border: '1px solid #7f1d1d', overflow: 'hidden' }}>
              <div style={{ width: `${hpRatio * 100}%`, height: '100%', background: '#ef4444', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11 * fontScale, color: '#fca5a5', marginTop: 1, textShadow: '0 1px 3px #000' }}>
              ×{stack.units.length}
            </div>
          </div>
        </Html>
      </group>
    );
  }

  const primary = isWrought ? '#7f1d1d' : isLocalPlayer ? '#10b981' : '#3b82f6';
  const accent = isWrought ? '#fca5a5' : isLocalPlayer ? '#86efac' : '#93c5fd';

  // Place up to 6 unit tokens in a 3×2 grid.
  const units = stack.units.slice(0, 6);
  return (
    <group ref={ref} position={[0, baseY, 0]}>
      {units.map((u, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const ox = (col - 1) * 0.32;
        const oz = (row - 0.5) * 0.35;
        const dead = u.currentHp <= 0;
        const veteran = ((u as Unit & { wins?: number }).wins ?? 0) >= 3;
        const wrought = isWrought;
        const uMaxHp = unitMaxHp(u.type);
        const uRatio = uMaxHp > 0 ? Math.max(0, u.currentHp) / uMaxHp : 0;
        const uColor = uRatio > 0.6 ? '#4ade80' : uRatio > 0.3 ? '#facc15' : '#f87171';
        return (
          <group key={u.id} position={[ox, 0, oz]} rotation={[0, hash2(i, units.length, 9) * Math.PI * 2, 0]}>
            <UnitMesh type={u.type} primary={primary} accent={accent} veteran={veteran} dead={dead} wrought={wrought} />
            {/* Per-unit HP bar — world-space plane above the figure */}
            <Html
              position={[0, 0.88, 0]}
              center
              distanceFactor={6}
              zIndexRange={[15, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div style={{ width: 36 * fontScale }}>
                <div style={{ width: '100%', height: 5 * fontScale, background: '#111', borderRadius: 2, border: '1px solid #333', overflow: 'hidden' }}>
                  <div style={{ width: `${uRatio * 100}%`, height: '100%', background: uColor, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11 * fontScale, color: uColor, textAlign: 'center', textShadow: '0 1px 2px #000', lineHeight: 1.2, fontWeight: 700 }}>
                  {u.currentHp}/{uMaxHp}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
      {/* Stack aggregate HP + count badge */}
      <Html
        position={[0, 1.35, 0]}
        center
        distanceFactor={6}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{ width: 72 * fontScale, textAlign: 'center' }}>
          <div style={{ fontSize: 13 * fontScale, color: '#fff', fontWeight: 700, marginBottom: 2, textShadow: '0 1px 3px #000', letterSpacing: '0.02em' }}>
            ×{stack.units.length} · {totalHp}/{totalMaxHp}❤️
          </div>
          <div style={{ width: '100%', height: 6 * fontScale, background: '#111827', borderRadius: 3, border: `1px solid ${isLocalPlayer ? '#10b981' : isWrought ? '#7f1d1d' : '#3b82f6'}`, overflow: 'hidden' }}>
            <div style={{ width: `${hpRatio * 100}%`, height: '100%', background: hpColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </Html>
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
          <ringGeometry args={[0.68, 0.85, 6]} />
          <meshBasicMaterial color="#fde68a" side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Fortify shield ring — amber pulsing ring at base of stack */}
      {stack.fortified && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
          <ringGeometry args={[0.52, 0.66, 6]} />
          <meshBasicMaterial color="#f59e0b" side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

type Unit = { id: string; currentHp: number; type: UnitType };

// —— Decoration components ——————————————————————————————————————————————

function GroundDisc() {
  return (
    <>
      {/* dark outer plain */}
      <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[100, 64]} />
        <meshStandardMaterial color="#2a2436" roughness={1} />
      </mesh>
      {/* mid-distance tinted ring suggests a shore / horizon glow */}
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[28, 44, 64]} />
        <meshStandardMaterial color="#433a55" transparent opacity={0.55} />
      </mesh>
    </>
  );
}

// Silhouetted distant mountain ring circling the playable disk, offering depth.
function DistantMountains() {
  const peaks = useMemo(() => {
    const out: Array<{ a: number; r: number; h: number; c: string }> = [];
    const n = 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i * 0.17);
      const r = 48 + ((i * 2654435761) % 100) / 100 * 8;
      const h = 3 + ((i * 1103515245 + 12345) % 4000) / 1000;
      const c = i % 3 === 0 ? '#3c3350' : i % 3 === 1 ? '#2f2a44' : '#352e48';
      out.push({ a, r, h, c });
    }
    return out;
  }, []);
  return (
    <group>
      {peaks.map((p, i) => (
        <mesh key={i} position={[Math.cos(p.a) * p.r, p.h / 2 - 0.4, Math.sin(p.a) * p.r]} castShadow>
          <coneGeometry args={[1.6 + (i % 4) * 0.3, p.h, 5]} />
          <meshStandardMaterial color={p.c} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// Floating dust motes / fireflies that drift gently over the map.
function Motes() {
  const ref = useRef<THREE.Points>(null);
  const geom = useMemo(() => {
    const count = 70;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 22;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 1 + Math.random() * 4;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.03;
    const mat = ref.current.material as THREE.PointsMaterial;
    mat.opacity = 0.45 + Math.sin(clock.elapsedTime) * 0.1;
  });
  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial size={0.11} color="#fde68a" transparent opacity={0.5} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function PlainDecor({ q, r, height, neighborCount }: { q: number; r: number; height: number; neighborCount: number }) {
  const spots = useMemo(() => {
    const out: Array<{ x: number; z: number; kind: 'flower' | 'tuft'; c: string; scale: number }> = [];
    // More neighbors → more and larger decorations (grouped meadow effect).
    const baseCount = 3 + Math.floor(hash2(q, r, 1) * 3);
    const count = baseCount + neighborCount;
    const scale = 1 + neighborCount * 0.18;
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 10 + i) * Math.PI * 2;
      const rr = 0.1 + hash2(q, r, 40 + i) * 0.48;
      const kind = hash2(q, r, 70 + i) > 0.55 ? 'flower' : 'tuft';
      const c = kind === 'flower'
        ? (['#f8bbd0', '#fde68a', '#fca5a5', '#c4b5fd'])[Math.floor(hash2(q, r, 90 + i) * 4)]
        : '#5f8b52';
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, kind, c, scale });
    }
    return out;
  }, [q, r, neighborCount]);
  return (
    <group position={[0, height, 0]}>
      {spots.map((s, i) => s.kind === 'flower' ? (
        <group key={i} position={[s.x, 0, s.z]} scale={s.scale}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.14, 5]} />
            <meshStandardMaterial color="#3e6b34" />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={s.c} emissive={s.c} emissiveIntensity={0.15} />
          </mesh>
        </group>
      ) : (
        <mesh key={i} position={[s.x, 0.05, s.z]} scale={s.scale}>
          <coneGeometry args={[0.08, 0.15, 5]} />
          <meshStandardMaterial color={s.c} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function ForestDecor({ q, r, height, neighborCount }: { q: number; r: number; height: number; neighborCount: number }) {
  const trees = useMemo(() => {
    const out: Array<{ x: number; z: number; s: number; c: string }> = [];
    // More forest neighbors → denser, taller forest.
    const baseCount = 4 + Math.floor(hash2(q, r, 2) * 3);
    const count = baseCount + neighborCount;
    const sizeBoost = 1 + neighborCount * 0.2;
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 20 + i) * Math.PI * 2;
      const rr = 0.08 + hash2(q, r, 50 + i) * 0.52;
      const s = (0.75 + hash2(q, r, 80 + i) * 0.45) * sizeBoost;
      const hue = ['#1e4a2c', '#245c36', '#1a3e25', '#2a6b40'][Math.floor(hash2(q, r, 100 + i) * 4)];
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, s, c: hue });
    }
    return out;
  }, [q, r, neighborCount]);
  return (
    <group position={[0, height, 0]}>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.06, 0.18, 6]} />
            <meshStandardMaterial color="#3e2817" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.28, 0]} castShadow>
            <coneGeometry args={[0.2, 0.42, 7]} />
            <meshStandardMaterial color={t.c} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.48, 0]} castShadow>
            <coneGeometry args={[0.13, 0.25, 6]} />
            <meshStandardMaterial color={t.c} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MountainDecor({ q, r, height, neighborCount }: { q: number; r: number; height: number; neighborCount: number }) {
  const peaks = useMemo(() => {
    const out: Array<{ x: number; z: number; w: number; h: number; c: string }> = [];
    // More mountain neighbors → more peaks and taller/wider mountains.
    const count = 2 + Math.floor(hash2(q, r, 3) * 2) + Math.min(neighborCount, 3);
    const heightBoost = 1 + neighborCount * 0.25;
    const widthBoost = 1 + neighborCount * 0.15;
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 30 + i) * Math.PI * 2;
      const rr = 0.05 + hash2(q, r, 60 + i) * 0.35;
      const w = (0.32 + hash2(q, r, 110 + i) * 0.2) * widthBoost;
      const hh = (0.5 + hash2(q, r, 140 + i) * 0.4) * heightBoost;
      const c = ['#5a544e', '#6b6560', '#4b4540'][Math.floor(hash2(q, r, 160 + i) * 3)];
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, w, h: hh, c });
    }
    return out;
  }, [q, r, neighborCount]);
  return (
    <group position={[0, height, 0]}>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]} castShadow>
            <coneGeometry args={[p.w, p.h, 5]} />
            <meshStandardMaterial color={p.c} roughness={0.98} flatShading />
          </mesh>
          {p.h > 0.7 && (
            <mesh position={[0, p.h - 0.08, 0]}>
              <coneGeometry args={[p.w * 0.45, 0.2, 5]} />
              <meshStandardMaterial color="#ecebe8" roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}
      {/* loose boulders */}
      {[0, 1].map(i => {
        const a = hash2(q, r, 200 + i) * Math.PI * 2;
        const rr = 0.35 + hash2(q, r, 220 + i) * 0.2;
        return (
          <mesh key={`b${i}`} position={[Math.cos(a) * rr, 0.08, Math.sin(a) * rr]} castShadow>
            <dodecahedronGeometry args={[0.1 + hash2(q, r, 240 + i) * 0.07]} />
            <meshStandardMaterial color="#6b645d" roughness={0.95} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

function RuinsDecor({ q, r, height, unlooted }: { q: number; r: number; height: number; unlooted: boolean }) {
  const pillars = useMemo(() => {
    const out: Array<{ x: number; z: number; h: number; rot: number }> = [];
    for (let i = 0; i < 3; i++) {
      const a = hash2(q, r, 300 + i) * Math.PI * 2;
      const rr = 0.2 + hash2(q, r, 320 + i) * 0.25;
      const hh = 0.25 + hash2(q, r, 340 + i) * 0.35;
      const rot = hash2(q, r, 360 + i) * 0.4 - 0.2;
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: hh, rot });
    }
    return out;
  }, [q, r]);
  const glowRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!glowRef.current || !unlooted) return;
    const m = glowRef.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.45 + Math.sin(clock.elapsedTime * 2 + q + r) * 0.2;
  });
  return (
    <group position={[0, height, 0]}>
      {pillars.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]} rotation={[p.rot, 0, p.rot * 0.8]} castShadow>
          <boxGeometry args={[0.14, p.h, 0.14]} />
          <meshStandardMaterial color="#9c7b5e" roughness={0.9} />
        </mesh>
      ))}
      {/* broken arch */}
      <mesh position={[0, 0.42, -0.1]} castShadow>
        <torusGeometry args={[0.28, 0.06, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#b08965" roughness={0.9} />
      </mesh>
      {/* scatter stones */}
      <mesh position={[0.1, 0.05, 0.3]} rotation={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.14, 0.1, 0.2]} />
        <meshStandardMaterial color="#8a6149" roughness={0.95} />
      </mesh>
      {unlooted && (
        <>
          <pointLight position={[0, 0.5, 0]} color="#fde68a" intensity={0.8} distance={2.5} />
          <mesh ref={glowRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.35, 0.55, 20]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[0, 0.85, 0]}
            fontSize={0.3}
            color="#fef3c7"
            outlineColor="#78350f"
            outlineWidth={0.02}
            anchorX="center"
            anchorY="middle"
            rotation={[-Math.PI / 8, 0, 0]}
          >
            {'✦'}
          </Text>
        </>
      )}
    </group>
  );
}

function SwampDecor({ q, r, height, neighborCount }: { q: number; r: number; height: number; neighborCount: number }) {
  const mudRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!mudRef.current) return;
    mudRef.current.opacity = 0.60 + Math.sin(clock.elapsedTime * 0.8 + q * 0.7 + r * 0.5) * 0.06;
  });

  // Reeds / cattails
  const reeds = useMemo(() => {
    const count = 3 + Math.floor(hash2(q, r, 4) * 2) + neighborCount;
    return Array.from({ length: count }, (_, i) => {
      const a = hash2(q, r, 400 + i) * Math.PI * 2;
      const rr = 0.15 + hash2(q, r, 420 + i) * 0.38;
      return {
        x: Math.cos(a) * rr,
        z: Math.sin(a) * rr,
        h: 0.15 + hash2(q, r, 440 + i) * 0.18,
      };
    });
  }, [q, r, neighborCount]);

  // Fallen logs — 1 or 2 depending on seed
  const logs = useMemo(() => {
    const count = 1 + Math.floor(hash2(q, r, 7) * 2);
    return Array.from({ length: count }, (_, i) => ({
      x: hash2(q, r, 700 + i) * 0.6 - 0.3,
      z: hash2(q, r, 720 + i) * 0.4 - 0.2,
      rot: hash2(q, r, 740 + i) * Math.PI,
      len: 0.25 + hash2(q, r, 760 + i) * 0.25,
      r: 0.022 + hash2(q, r, 780 + i) * 0.012,
    }));
  }, [q, r]);

  // Crocodile silhouette (half-submerged — just the back ridge and eye nubs)
  const crocAngle = hash2(q, r, 900) * Math.PI * 2;
  const crocDist = 0.18 + hash2(q, r, 910) * 0.22;
  const crocX = Math.cos(crocAngle) * crocDist;
  const crocZ = Math.sin(crocAngle) * crocDist;

  return (
    <group position={[0, height, 0]}>
      {/* Mud pool — dark muddy brown */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, Math.min(0.52 + neighborCount * 0.08, 0.88), 20]} />
        <meshStandardMaterial
          ref={mudRef}
          color="#5a3a1a"
          transparent
          opacity={0.62}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* Reeds / cattails */}
      {reeds.map((rd, i) => (
        <group key={i} position={[rd.x, 0, rd.z]}>
          {/* Stem */}
          <mesh position={[0, rd.h / 2, 0]}>
            <cylinderGeometry args={[0.012, 0.016, rd.h, 4]} />
            <meshStandardMaterial color="#5a4820" roughness={0.95} />
          </mesh>
          {/* Cattail head */}
          <mesh position={[0, rd.h + 0.025, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.06, 6]} />
            <meshStandardMaterial color="#6b3a10" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Fallen logs */}
      {logs.map((lg, i) => (
        <mesh key={i} position={[lg.x, 0.016, lg.z]} rotation={[0, lg.rot, 0]}>
          <cylinderGeometry args={[lg.r, lg.r * 0.9, lg.len, 6, 1]} />
          <meshStandardMaterial color="#4a2e12" roughness={0.95} metalness={0.02} />
        </mesh>
      ))}

      {/* Crocodile — back ridge bumps + two eye nubs */}
      <group position={[crocX, 0.005, crocZ]} rotation={[0, crocAngle + Math.PI, 0]}>
        {/* body ridge — a row of small scale bumps */}
        {[0, 0.06, 0.12, 0.18, 0.24].map((dx, i) => (
          <mesh key={i} position={[dx - 0.12, 0.014 + i * 0.002, 0]}>
            <sphereGeometry args={[0.018 - i * 0.002, 6, 4]} />
            <meshStandardMaterial color="#3a4a20" roughness={0.9} />
          </mesh>
        ))}
        {/* eyes */}
        <mesh position={[0.14, 0.022, 0.024]}>
          <sphereGeometry args={[0.010, 6, 4]} />
          <meshStandardMaterial color="#e8c020" roughness={0.3} emissive="#806000" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0.14, 0.022, -0.024]}>
          <sphereGeometry args={[0.010, 6, 4]} />
          <meshStandardMaterial color="#e8c020" roughness={0.3} emissive="#806000" emissiveIntensity={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function DesertDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const dunes = useMemo(() => {
    const out: Array<{ x: number; z: number; s: number }> = [];
    const count = 2 + Math.floor(hash2(q, r, 5) * 2);
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 600 + i) * Math.PI * 2;
      const rr = 0.1 + hash2(q, r, 620 + i) * 0.4;
      const s = 0.7 + hash2(q, r, 640 + i) * 0.6;
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, s });
    }
    return out;
  }, [q, r]);
  const cactus = hash2(q, r, 660) > 0.7;
  const skull = !cactus && hash2(q, r, 680) > 0.85;
  return (
    <group position={[0, height, 0]}>
      {dunes.map((d, i) => (
        <mesh key={i} position={[d.x, 0.05 * d.s, d.z]} scale={[d.s, 0.6 * d.s, d.s * 0.8]}>
          <sphereGeometry args={[0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#c9a35f" roughness={1} />
        </mesh>
      ))}
      {/* small pebbles */}
      {[0, 1, 2].map(i => (
        <mesh key={`p${i}`} position={[hash2(q, r, 700 + i) * 0.7 - 0.35, 0.02, hash2(q, r, 720 + i) * 0.7 - 0.35]}>
          <sphereGeometry args={[0.03 + hash2(q, r, 740 + i) * 0.03, 5, 4]} />
          <meshStandardMaterial color="#a88754" roughness={1} />
        </mesh>
      ))}
      {cactus && (
        <group position={[hash2(q, r, 760) * 0.4 - 0.2, 0, hash2(q, r, 770) * 0.4 - 0.2]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 0.36, 7]} />
            <meshStandardMaterial color="#3f6b3a" roughness={0.85} />
          </mesh>
          <mesh position={[0.08, 0.22, 0]} rotation={[0, 0, -0.6]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.18, 6]} />
            <meshStandardMaterial color="#3f6b3a" roughness={0.85} />
          </mesh>
          <mesh position={[-0.07, 0.26, 0]} rotation={[0, 0, 0.55]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.16, 6]} />
            <meshStandardMaterial color="#3f6b3a" roughness={0.85} />
          </mesh>
        </group>
      )}
      {skull && (
        <mesh position={[0, 0.06, 0.15]} rotation={[Math.PI / 2, 0, hash2(q, r, 780) * Math.PI]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshStandardMaterial color="#f0eadd" roughness={0.75} />
        </mesh>
      )}
    </group>
  );
}

function LakeDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.35 + Math.sin(t * 1.5 + q * 0.3 + r * 0.2) * 0.08;
    }
    if (rippleRef.current) {
      const s = 1 + ((t + q * 0.5 + r * 0.3) % 2) * 0.3;
      rippleRef.current.scale.set(s, s, s);
      const m = rippleRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, 0.5 - ((t + q * 0.5 + r * 0.3) % 2) * 0.25);
    }
  });
  const lily = hash2(q, r, 810) > 0.6;
  return (
    <group position={[0, height + 0.02, 0]}>
      {/* water surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.92, 20]} />
        <meshStandardMaterial
          ref={matRef}
          color="#2c5a99"
          emissive="#1e3e7a"
          emissiveIntensity={0.35}
          roughness={0.15}
          metalness={0.55}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* ripple ring */}
      <mesh ref={rippleRef} position={[hash2(q, r, 820) * 0.4 - 0.2, 0.005, hash2(q, r, 830) * 0.4 - 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.11, 18]} />
        <meshBasicMaterial color="#a5d6ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {lily && (
        <group position={[hash2(q, r, 840) * 0.5 - 0.25, 0.015, hash2(q, r, 850) * 0.5 - 0.25]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1, 8]} />
            <meshStandardMaterial color="#2e8b5a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color="#f9a8d4" emissive="#f9a8d4" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// World-space angle of each hex DIRECTIONS entry — precomputed once so road
// connectors can be rotated to point at the neighbor centre (pointy-top layout).
const ROAD_DIR_ANGLES: number[] = (() => {
  const out: number[] = [];
  for (const d of DIRECTIONS) {
    const x = HEX_RADIUS * SQRT3 * (d.q + d.r / 2);
    const z = HEX_RADIUS * 1.5 * d.r;
    // Rotate around Y axis so a spoke laid along +X points at (x, z).
    out.push(Math.atan2(z, x));
  }
  return out;
})();

// River flows in one of 3 axis directions based on hex coords (deterministic)
function getRiverAngle(q: number, r: number): number {
  const axis = Math.floor(hash2(q, r, 900) * 3); // 0=horizontal, 1=diagonal-left, 2=diagonal-right
  return (axis * Math.PI) / 3;
}

function RiverDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const angle = getRiverAngle(q, r);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.25 + Math.sin(t * 2.2 + q * 0.4 + r * 0.5) * 0.1;
    }
  });
  return (
    <group position={[0, height + 0.02, 0]}>
      {/* Main river channel — oriented along river direction */}
      <mesh rotation={[-Math.PI / 2, 0, angle]}>
        <planeGeometry args={[0.38, 1.85]} />
        <meshStandardMaterial
          ref={matRef}
          color="#2c6fa3"
          emissive="#1a4a7a"
          emissiveIntensity={0.25}
          roughness={0.1}
          metalness={0.6}
          transparent
          opacity={0.88}
        />
      </mesh>
      {/* Shore banks — subtle dark strips along sides of river */}
      <mesh rotation={[-Math.PI / 2, 0, angle]} position={[0, 0, 0.001]}>
        <planeGeometry args={[0.5, 1.85]} />
        <meshStandardMaterial color="#1a4a2a" roughness={0.9} transparent opacity={0.35} />
      </mesh>
      {/* Flow arrow — small triangle pointing downstream */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, angle + Math.PI / 2]}>
        <coneGeometry args={[0.07, 0.18, 3]} />
        <meshBasicMaterial color="#60b4f0" transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function HillDecor({ q, r, height, neighborCount }: { q: number; r: number; height: number; neighborCount: number }) {
  const count = Math.max(1, Math.round(1 + neighborCount * 0.5));
  return (
    <group position={[0, height, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const ox = (hash2(q, r, 300 + i) - 0.5) * 1.1;
        const oz = (hash2(q, r, 400 + i) - 0.5) * 1.1;
        const rx = 0.2 + hash2(q, r, 500 + i) * 0.22;
        const ry = 0.12 + hash2(q, r, 600 + i) * 0.10;
        return (
          <mesh key={i} position={[ox, ry / 2, oz]} castShadow>
            <sphereGeometry args={[rx, 10, 7]} />
            <meshStandardMaterial color="#8a9e68" roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

function RoadDecor({ height, connections, overlay = false }: { height: number; connections: number[]; overlay?: boolean }) {
  // If the road hex has no connected neighbors (e.g., an orphan segment), draw
  // a simple clearing with pebbles instead of spokes.
  const hasConnections = connections.length > 0;
  const color = overlay ? '#d4a870' : '#b89666';
  const stoneColor = overlay ? '#9a7040' : '#8c7147';
  return (
    <group position={[0, height + 0.005, 0]}>
      {/* cobble clearing — the road surface under the tile */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 14]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* cobble spokes toward each connected neighbor */}
      {hasConnections && connections.map(dirIdx => {
        const angle = ROAD_DIR_ANGLES[dirIdx];
        return (
          <group key={dirIdx} rotation={[0, -angle, 0]}>
            <mesh position={[0.5, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.0, 0.34]} />
              <meshStandardMaterial color={color} roughness={0.95} />
            </mesh>
            {[0.2, 0.45, 0.7, 0.9].map((t, i) => (
              <mesh key={i} position={[t, 0.01, (i % 2 === 0 ? 0.08 : -0.08)]}>
                <boxGeometry args={[0.14, 0.02, 0.1]} />
                <meshStandardMaterial color={stoneColor} roughness={0.95} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* scattered pebbles near the hex rim (decor) */}
      {!hasConnections && [0, 1, 2, 3].map(i => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.4, 0.02, Math.sin(a) * 0.4]}>
            <sphereGeometry args={[0.05, 6, 5]} />
            <meshStandardMaterial color={stoneColor} roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

// —— Unit meshes ——————————————————————————————————————————————————————

type UnitMeshProps = {
  type: UnitType;
  primary: string;
  accent: string;
  veteran: boolean;
  dead: boolean;
  wrought: boolean;
};

function UnitMesh(props: UnitMeshProps) {
  const { type, primary, accent, veteran, dead, wrought } = props;
  const bodyEmissive = veteran ? '#f5c518' : wrought ? '#450a0a' : '#000';
  const bodyEmissiveI = veteran ? 0.35 : wrought ? 0.25 : 0;
  const skin = wrought ? '#7a3434' : '#e4c59e';
  const metal = wrought ? '#3a2a2a' : '#c0c4cc';

  return (
    <group scale={dead ? 0.6 : 1}>
      {type === 'infantry' && (
        <InfantryMesh primary={primary} accent={accent} skin={skin} metal={metal} bodyEmissive={bodyEmissive} bodyEmissiveI={bodyEmissiveI} />
      )}
      {type === 'ranged' && (
        <RangedMesh primary={primary} accent={accent} skin={skin} metal={metal} bodyEmissive={bodyEmissive} bodyEmissiveI={bodyEmissiveI} />
      )}
      {type === 'mounted' && (
        <MountedMesh primary={primary} accent={accent} skin={skin} metal={metal} bodyEmissive={bodyEmissive} bodyEmissiveI={bodyEmissiveI} />
      )}
      {type === 'siege' && (
        <SiegeMesh primary={primary} accent={accent} metal={metal} bodyEmissive={bodyEmissive} bodyEmissiveI={bodyEmissiveI} />
      )}
      {type === 'flying' && (
        <FlyingMesh primary={primary} accent={accent} skin={skin} bodyEmissive={bodyEmissive} bodyEmissiveI={bodyEmissiveI} />
      )}
      {veteran && (
        <mesh position={[0, 0.72, 0]}>
          <torusGeometry args={[0.08, 0.02, 6, 10]} />
          <meshStandardMaterial color="#f5c518" metalness={0.85} roughness={0.2} emissive="#f5c518" emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}

type CommonProps = {
  primary: string; accent: string; skin?: string; metal?: string;
  bodyEmissive: string; bodyEmissiveI: number;
};

function InfantryMesh({ primary, accent, skin, metal, bodyEmissive, bodyEmissiveI }: CommonProps) {
  return (
    <group scale={1.15}>
      {/* boots */}
      <mesh position={[-0.05, 0.03, 0]} castShadow>
        <boxGeometry args={[0.05, 0.05, 0.07]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      <mesh position={[0.05, 0.03, 0]} castShadow>
        <boxGeometry args={[0.05, 0.05, 0.07]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* legs */}
      <mesh position={[-0.05, 0.13, 0]} castShadow>
        <boxGeometry args={[0.05, 0.16, 0.06]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[0.05, 0.13, 0]} castShadow>
        <boxGeometry args={[0.05, 0.16, 0.06]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* cape/surcoat behind */}
      <mesh position={[0, 0.26, -0.06]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[0.16, 0.26, 0.02]} />
        <meshStandardMaterial color={accent} roughness={0.75} side={THREE.DoubleSide} />
      </mesh>
      {/* chest plate */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.18, 0.2, 0.1]} />
        <meshStandardMaterial color={primary} roughness={0.5} emissive={bodyEmissive} emissiveIntensity={bodyEmissiveI} metalness={0.3} />
      </mesh>
      {/* belt */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.19, 0.03, 0.11]} />
        <meshStandardMaterial color="#4a2f1a" roughness={0.85} />
      </mesh>
      {/* shoulder pauldrons */}
      <mesh position={[-0.115, 0.36, 0]} castShadow>
        <sphereGeometry args={[0.06, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.115, 0.36, 0]} castShadow>
        <sphereGeometry args={[0.06, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.25} />
      </mesh>
      {/* neck */}
      <mesh position={[0, 0.43, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.04, 6]} />
        <meshStandardMaterial color={skin ?? '#e4c59e'} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <sphereGeometry args={[0.075, 12, 10]} />
        <meshStandardMaterial color={skin ?? '#e4c59e'} roughness={0.6} />
      </mesh>
      {/* helm (visored) */}
      <mesh position={[0, 0.51, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.085, 0.11, 10]} />
        <meshStandardMaterial color={metal} metalness={0.85} roughness={0.2} />
      </mesh>
      {/* helm visor slit */}
      <mesh position={[0, 0.49, 0.085]}>
        <boxGeometry args={[0.06, 0.015, 0.01]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      {/* crest/plume */}
      <mesh position={[0, 0.62, 0]} rotation={[0.2, 0, 0]} castShadow>
        <coneGeometry args={[0.04, 0.14, 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      {/* kite shield */}
      <mesh position={[-0.15, 0.3, 0.05]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.022, 0.24, 0.14]} />
        <meshStandardMaterial color={accent} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[-0.15, 0.3, 0.051]} rotation={[0, 0.3, 0]}>
        <ringGeometry args={[0.025, 0.04, 12]} />
        <meshBasicMaterial color="#f5c518" side={THREE.DoubleSide} />
      </mesh>
      {/* sword (pommel+blade+crossguard) */}
      <mesh position={[0.17, 0.32, 0]} rotation={[0, 0, 0.15]} castShadow>
        <boxGeometry args={[0.024, 0.3, 0.024]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.88} roughness={0.15} />
      </mesh>
      <mesh position={[0.17, 0.18, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.1, 0.02, 0.03]} />
        <meshStandardMaterial color={metal} metalness={0.7} />
      </mesh>
      <mesh position={[0.175, 0.15, 0]} rotation={[0, 0, 0.15]}>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshStandardMaterial color="#f5c518" metalness={0.6} />
      </mesh>
    </group>
  );
}

function RangedMesh({ primary, accent, skin, metal, bodyEmissive, bodyEmissiveI }: CommonProps) {
  return (
    <group scale={1.15}>
      {/* boots */}
      <mesh position={[-0.05, 0.03, 0]} castShadow>
        <boxGeometry args={[0.05, 0.05, 0.07]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      <mesh position={[0.05, 0.03, 0]} castShadow>
        <boxGeometry args={[0.05, 0.05, 0.07]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* legs */}
      <mesh position={[-0.05, 0.13, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.06]} />
        <meshStandardMaterial color="#2e2a24" />
      </mesh>
      <mesh position={[0.05, 0.13, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.06]} />
        <meshStandardMaterial color="#2e2a24" />
      </mesh>
      {/* tunic */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.16, 0.2, 0.1]} />
        <meshStandardMaterial color={primary} roughness={0.75} emissive={bodyEmissive} emissiveIntensity={bodyEmissiveI} />
      </mesh>
      {/* hooded cape back */}
      <mesh position={[0, 0.32, -0.06]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.19, 0.32, 0.02]} />
        <meshStandardMaterial color="#2a3d2e" side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      {/* quiver with fletchings */}
      <mesh position={[0.06, 0.34, -0.08]} rotation={[0.3, 0, -0.3]} castShadow>
        <cylinderGeometry args={[0.038, 0.045, 0.22, 8]} />
        <meshStandardMaterial color="#6b3f1a" roughness={0.9} />
      </mesh>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0.075 + i * 0.01, 0.44, -0.1]} rotation={[0.3, 0, -0.3]}>
          <coneGeometry args={[0.018, 0.05, 4]} />
          <meshStandardMaterial color={accent} />
        </mesh>
      ))}
      {/* head */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial color={skin ?? '#e4c59e'} />
      </mesh>
      {/* hood (cowl) */}
      <mesh position={[0, 0.5, -0.015]} rotation={[0.2, 0, 0]} castShadow>
        <coneGeometry args={[0.1, 0.16, 10]} />
        <meshStandardMaterial color="#2a3d2e" roughness={0.85} />
      </mesh>
      {/* bow (taller, ornate) */}
      <mesh position={[0.15, 0.33, 0.03]} rotation={[0, 0, 0.05]}>
        <torusGeometry args={[0.22, 0.014, 6, 20, Math.PI * 1.1]} />
        <meshStandardMaterial color="#5b2f10" roughness={0.8} emissive="#1a0a03" emissiveIntensity={0.2} />
      </mesh>
      {/* bowstring */}
      <mesh position={[0.15, 0.33, 0.03]}>
        <cylinderGeometry args={[0.003, 0.003, 0.44, 4]} />
        <meshStandardMaterial color="#d4d4d4" />
      </mesh>
      {/* nocked arrow */}
      <mesh position={[0.12, 0.33, 0.03]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.28, 4]} />
        <meshStandardMaterial color="#c9a070" />
      </mesh>
      <mesh position={[-0.02, 0.33, 0.03]}>
        <coneGeometry args={[0.015, 0.04, 4]} />
        <meshStandardMaterial color={metal} metalness={0.8} />
      </mesh>
    </group>
  );
}

function MountedMesh({ primary, accent, skin, metal, bodyEmissive, bodyEmissiveI }: CommonProps) {
  return (
    <group scale={1.2}>
      {/* horse body */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.34, 0.16, 0.13]} />
        <meshStandardMaterial color="#5a3312" roughness={0.85} />
      </mesh>
      {/* horse barding (armored chest) */}
      <mesh position={[0.16, 0.2, 0]} castShadow>
        <boxGeometry args={[0.06, 0.18, 0.14]} />
        <meshStandardMaterial color={metal} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* horse saddle blanket */}
      <mesh position={[0, 0.31, 0]} castShadow>
        <boxGeometry args={[0.32, 0.02, 0.15]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
      {/* horse legs */}
      {[[-0.13, 0.06, -0.05], [-0.13, 0.06, 0.05], [0.13, 0.06, -0.05], [0.13, 0.06, 0.05]].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} castShadow>
          <boxGeometry args={[0.035, 0.14, 0.035]} />
          <meshStandardMaterial color="#3e2817" />
        </mesh>
      ))}
      {/* hooves */}
      {[[-0.13, -0.02, -0.05], [-0.13, -0.02, 0.05], [0.13, -0.02, -0.05], [0.13, -0.02, 0.05]].map((p, i) => (
        <mesh key={`h${i}`} position={[p[0], p[1], p[2]]}>
          <boxGeometry args={[0.04, 0.03, 0.04]} />
          <meshStandardMaterial color="#1a1208" />
        </mesh>
      ))}
      {/* horse head */}
      <mesh position={[0.2, 0.3, 0]} rotation={[0, 0, -0.25]} castShadow>
        <boxGeometry args={[0.12, 0.09, 0.07]} />
        <meshStandardMaterial color="#5a3312" />
      </mesh>
      {/* horse muzzle */}
      <mesh position={[0.27, 0.26, 0]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.06, 0.06, 0.06]} />
        <meshStandardMaterial color="#3e2817" />
      </mesh>
      {/* horse ears */}
      <mesh position={[0.17, 0.37, 0.025]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.015, 0.04, 4]} />
        <meshStandardMaterial color="#5a3312" />
      </mesh>
      <mesh position={[0.17, 0.37, -0.025]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.015, 0.04, 4]} />
        <meshStandardMaterial color="#5a3312" />
      </mesh>
      {/* tail */}
      <mesh position={[-0.19, 0.24, 0]} rotation={[0, 0, 0.6]}>
        <coneGeometry args={[0.04, 0.14, 6]} />
        <meshStandardMaterial color="#3e2817" roughness={0.9} />
      </mesh>
      {/* rider torso */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.14, 0.16, 0.11]} />
        <meshStandardMaterial color={primary} roughness={0.45} emissive={bodyEmissive} emissiveIntensity={bodyEmissiveI} metalness={0.3} />
      </mesh>
      {/* rider cape */}
      <mesh position={[0, 0.42, -0.07]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.17, 0.24, 0.02]} />
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} />
      </mesh>
      {/* pauldrons */}
      <mesh position={[-0.09, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.05, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.09, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.05, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.25} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0.58, 0]} castShadow>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial color={skin ?? '#e4c59e'} />
      </mesh>
      {/* great-helm */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.075, 0.11, 10]} />
        <meshStandardMaterial color={metal} metalness={0.85} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.6, 0.075]}>
        <boxGeometry args={[0.05, 0.012, 0.01]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      {/* plume */}
      <mesh position={[0, 0.72, -0.02]} rotation={[0.35, 0, 0]} castShadow>
        <coneGeometry args={[0.03, 0.16, 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.2} />
      </mesh>
      {/* lance */}
      <mesh position={[0.22, 0.5, 0]} rotation={[0, 0, 1.1]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.48, 5]} />
        <meshStandardMaterial color="#6b3f1a" />
      </mesh>
      {/* lance tip */}
      <mesh position={[0.4, 0.66, 0]}>
        <coneGeometry args={[0.022, 0.08, 6]} />
        <meshStandardMaterial color={metal} metalness={0.9} roughness={0.15} emissive={metal} emissiveIntensity={0.15} />
      </mesh>
      {/* lance pennant */}
      <mesh position={[0.32, 0.62, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.12, 0.04, 0.001]} />
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function SiegeMesh({ primary, accent, metal, bodyEmissive, bodyEmissiveI }: Omit<CommonProps, 'skin'>) {
  return (
    <group scale={1.2}>
      {/* wheels with spokes */}
      {[[-0.12, 0.08, -0.11], [-0.12, 0.08, 0.11], [0.12, 0.08, -0.11], [0.12, 0.08, 0.11]].map((p, i) => (
        <group key={i} position={[p[0], p[1], p[2]]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.08, 0.025, 6, 14]} />
            <meshStandardMaterial color="#2a1a0c" roughness={0.9} />
          </mesh>
          {/* spokes */}
          {[0, 1, 2, 3].map(s => (
            <mesh key={s} rotation={[0, 0, (s * Math.PI) / 4]}>
              <boxGeometry args={[0.14, 0.012, 0.012]} />
              <meshStandardMaterial color="#3e2817" />
            </mesh>
          ))}
          {/* hub */}
          <mesh>
            <sphereGeometry args={[0.02, 8, 6]} />
            <meshStandardMaterial color={metal} metalness={0.7} />
          </mesh>
        </group>
      ))}
      {/* chassis */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.36, 0.1, 0.26]} />
        <meshStandardMaterial color="#5a3d22" roughness={0.9} />
      </mesh>
      {/* cross braces */}
      <mesh position={[0, 0.18, 0.12]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.4, 0.02, 0.02]} />
        <meshStandardMaterial color="#3e2817" />
      </mesh>
      {/* vertical supports */}
      <mesh position={[-0.12, 0.3, 0]} castShadow>
        <boxGeometry args={[0.04, 0.25, 0.04]} />
        <meshStandardMaterial color="#6b4926" />
      </mesh>
      <mesh position={[0.12, 0.3, 0]} castShadow>
        <boxGeometry args={[0.04, 0.25, 0.04]} />
        <meshStandardMaterial color="#6b4926" />
      </mesh>
      {/* throwing arm */}
      <mesh position={[0.08, 0.38, 0]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[0.05, 0.38, 0.05]} />
        <meshStandardMaterial color="#6b4926" />
      </mesh>
      {/* flaming payload */}
      <mesh position={[-0.16, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#9c2a0a" roughness={0.4} emissive="#fb923c" emissiveIntensity={0.85} />
      </mesh>
      <pointLight position={[-0.16, 0.5, 0]} color="#fb923c" intensity={0.6} distance={1.4} />
      {/* bucket */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.08, 10]} />
        <meshStandardMaterial color={primary} roughness={0.6} emissive={bodyEmissive} emissiveIntensity={bodyEmissiveI} />
      </mesh>
      {/* banner pole + flag */}
      <mesh position={[0.2, 0.45, 0.1]}>
        <cylinderGeometry args={[0.006, 0.006, 0.4, 4]} />
        <meshStandardMaterial color="#3e2817" />
      </mesh>
      <mesh position={[0.26, 0.52, 0.1]} castShadow>
        <boxGeometry args={[0.14, 0.1, 0.002]} />
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      {/* rivets */}
      {[[0.14, 0.16, 0.13], [-0.14, 0.16, 0.13], [0.14, 0.16, -0.13], [-0.14, 0.16, -0.13]].map((p, i) => (
        <mesh key={`rv${i}`} position={[p[0], p[1], p[2]]}>
          <sphereGeometry args={[0.017, 6, 5]} />
          <meshStandardMaterial color={metal} metalness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function ImpactBurst({ x, z }: { x: number; z: number }) {
  const flashRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const start = useRef<number>(0);
  const DURATION = 0.8;

  useFrame(({ clock }) => {
    if (start.current === 0) start.current = clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / DURATION;
    const k = Math.max(0, 1 - t);
    if (flashRef.current) {
      const s = 0.3 + t * 0.8;
      flashRef.current.scale.set(s, s, s);
      const m = flashRef.current.material as THREE.MeshStandardMaterial;
      m.opacity = k;
    }
    if (ringRef.current) {
      const s = 0.3 + t * 2.2;
      ringRef.current.scale.set(s, s, s);
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = k * 0.9;
    }
    if (lightRef.current) {
      lightRef.current.intensity = k * 2.5;
    }
  });

  return (
    <group position={[x, 0.6, z]}>
      <pointLight ref={lightRef} color="#fb923c" intensity={2.5} distance={4} />
      <mesh ref={flashRef}>
        <sphereGeometry args={[0.35, 12, 10]} />
        <meshStandardMaterial color="#fde68a" emissive="#fb923c" emissiveIntensity={2} transparent opacity={1} />
      </mesh>
      <mesh ref={ringRef} position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.5, 24]} />
        <meshBasicMaterial color="#fca5a5" side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function FlyingMesh({ primary, accent, skin, bodyEmissive, bodyEmissiveI }: CommonProps) {
  const ref = useRef<THREE.Group>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = 0.3 + Math.sin(t * 2.2) * 0.06;
    ref.current.rotation.z = Math.sin(t * 3) * 0.08;
    // wing flap
    const flap = Math.sin(t * 7) * 0.55;
    if (wingLRef.current) wingLRef.current.rotation.z = -0.1 - flap;
    if (wingRRef.current) wingRRef.current.rotation.z = 0.1 + flap;
  });
  return (
    <group ref={ref} scale={1.25}>
      {/* elongated scaled body */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.14, 6, 10]} />
        <meshStandardMaterial color={primary} roughness={0.55} emissive={bodyEmissive} emissiveIntensity={bodyEmissiveI} metalness={0.3} />
      </mesh>
      {/* chest scales (highlight) */}
      <mesh position={[0, 0.1, 0.07]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color={skin ?? '#d9b383'} roughness={0.45} />
      </mesh>
      {/* neck */}
      <mesh position={[0.1, 0.19, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.035, 0.05, 0.1, 8]} />
        <meshStandardMaterial color={primary} roughness={0.55} />
      </mesh>
      {/* head */}
      <mesh position={[0.16, 0.22, 0]} castShadow>
        <sphereGeometry args={[0.065, 12, 10]} />
        <meshStandardMaterial color={primary} roughness={0.5} />
      </mesh>
      {/* snout */}
      <mesh position={[0.22, 0.21, 0]} rotation={[0, 0, -0.15]} castShadow>
        <coneGeometry args={[0.04, 0.08, 6]} />
        <meshStandardMaterial color={primary} roughness={0.55} />
      </mesh>
      {/* horns */}
      <mesh position={[0.16, 0.28, 0.03]} rotation={[0.2, 0, 0.35]}>
        <coneGeometry args={[0.012, 0.06, 5]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0.16, 0.28, -0.03]} rotation={[-0.2, 0, 0.35]}>
        <coneGeometry args={[0.012, 0.06, 5]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* glowing eyes */}
      <mesh position={[0.2, 0.23, 0.035]}>
        <sphereGeometry args={[0.012, 6, 5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fb923c" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.2, 0.23, -0.035]}>
        <sphereGeometry args={[0.012, 6, 5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fb923c" emissiveIntensity={1.2} />
      </mesh>
      {/* tail (long, pointed) */}
      <mesh position={[-0.14, 0.1, 0]} rotation={[0, 0, 0.35]}>
        <coneGeometry args={[0.045, 0.28, 6]} />
        <meshStandardMaterial color={primary} roughness={0.6} />
      </mesh>
      <mesh position={[-0.26, 0.13, 0]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.06, 0.04, 0.005]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      {/* wing membranes (flapping) */}
      <mesh ref={wingLRef} position={[0, 0.18, -0.1]} rotation={[0, 0, -0.1]} castShadow>
        <boxGeometry args={[0.36, 0.012, 0.2]} />
        <meshStandardMaterial color={accent} transparent opacity={0.78} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      <mesh ref={wingRRef} position={[0, 0.18, 0.1]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[0.36, 0.012, 0.2]} />
        <meshStandardMaterial color={accent} transparent opacity={0.78} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      {/* wing ribs (darker lines) */}
      <mesh position={[0, 0.18, -0.1]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.36, 0.008, 0.008]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.18, 0.1]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.36, 0.008, 0.008]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}
