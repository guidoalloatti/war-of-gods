import { Suspense, useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Sky, Clouds, Cloud } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrainType, RaceId } from '@war-of-gods/engine';
import type { HexCell, HexCoord } from './HexBoard.js';
import { useI18n } from '../i18n/index.js';

// ── Constants ─────────────────────────────────────────────────────
const HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);

// Deterministic hash for stable decoration placement.
function hash2(q: number, r: number, salt = 0): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h >>> 0) ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

const TERRAIN_COLOR: Record<TerrainType, string> = {
  plain:    '#9db870',
  mountain: '#8a8a8a',
  forest:   '#2e7a45',
  swamp:    '#5a4270',
  road:     '#c9a060',
};

const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  plain:    0.08,
  road:     0.06,
  swamp:    0.06,
  forest:   0.40,
  mountain: 0.80,
};

const TERRAIN_ROUGHNESS: Record<TerrainType, number> = {
  plain: 0.85, road: 0.70, swamp: 0.90, forest: 0.80, mountain: 0.65,
};

const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function hexToWorld(q: number, r: number): [number, number] {
  const x = HEX_RADIUS * SQRT3 * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return [x, z];
}

// ── Terrain decorations ───────────────────────────────────────────

function PlainDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const stalks = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = hash2(q, r, i * 17) * Math.PI * 2;
      const dist = 0.2 + hash2(q, r, i * 31) * 0.45;
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        h: 0.10 + hash2(q, r, i * 7) * 0.08,
        color: hash2(q, r, i) > 0.5 ? '#d4b840' : '#c8a030',
      };
    });
  }, [q, r]);
  return (
    <group position={[0, height, 0]}>
      {stalks.map((s, i) => (
        <mesh key={i} position={[s.x, s.h / 2, s.z]}>
          <cylinderGeometry args={[0.012, 0.018, s.h, 4]} />
          <meshStandardMaterial color={s.color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function ForestDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const trees = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const angle = hash2(q, r, i * 13) * Math.PI * 2;
      const dist = 0.15 + hash2(q, r, i * 29) * 0.50;
      const treeH = 0.45 + hash2(q, r, i * 11) * 0.35;
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        trunkH: treeH * 0.35,
        crownH: treeH * 0.75,
        crownR: 0.10 + hash2(q, r, i * 5) * 0.07,
        color: hash2(q, r, i * 3) > 0.5 ? '#1e7835' : '#28904a',
      };
    });
  }, [q, r]);
  return (
    <group position={[0, height, 0]}>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.trunkH / 2, 0]}>
            <cylinderGeometry args={[0.025, 0.035, t.trunkH, 5]} />
            <meshStandardMaterial color="#4a2808" roughness={0.95} />
          </mesh>
          {/* Crown — two cone tiers */}
          <mesh position={[0, t.trunkH + t.crownH * 0.35, 0]}>
            <coneGeometry args={[t.crownR * 1.3, t.crownH * 0.65, 6]} />
            <meshStandardMaterial color={t.color} roughness={0.85} />
          </mesh>
          <mesh position={[0, t.trunkH + t.crownH * 0.80, 0]}>
            <coneGeometry args={[t.crownR * 0.8, t.crownH * 0.50, 6]} />
            <meshStandardMaterial color="#34a858" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MountainDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const peaks = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const angle = (i / 3) * Math.PI * 2 + hash2(q, r, i) * 0.5;
      const dist = 0.08 + hash2(q, r, i * 7) * 0.38;
      const peakH = 0.28 + hash2(q, r, i * 3) * 0.22;
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        h: peakH,
        r: 0.15 + hash2(q, r, i * 5) * 0.10,
        snow: peakH > 0.36,
      };
    });
  }, [q, r]);
  return (
    <group position={[0, height, 0]}>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]}>
            <coneGeometry args={[p.r, p.h, 6]} />
            <meshStandardMaterial color="#6878a0" roughness={0.60} metalness={0.05} />
          </mesh>
          {p.snow && (
            <mesh position={[0, p.h * 0.72, 0]}>
              <coneGeometry args={[p.r * 0.45, p.h * 0.30, 6]} />
              <meshStandardMaterial color="#e8f0ff" roughness={0.50} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function SwampDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const pools = useMemo(() => (
    Array.from({ length: 3 }, (_, i) => {
      const angle = hash2(q, r, i * 19) * Math.PI * 2;
      return {
        x: Math.cos(angle) * (0.2 + hash2(q, r, i) * 0.35),
        z: Math.sin(angle) * (0.1 + hash2(q, r, i * 3) * 0.25),
        rx: 0.08 + hash2(q, r, i * 7) * 0.08,
        rz: 0.04 + hash2(q, r, i * 11) * 0.06,
      };
    })
  ), [q, r]);
  return (
    <group position={[0, height + 0.004, 0]}>
      {pools.map((p, i) => (
        <mesh key={i} position={[p.x, 0, p.z]} scale={[p.rx * 8, 0.01, p.rz * 8]}>
          <sphereGeometry args={[1, 8, 4]} />
          <meshStandardMaterial color="#3a5a60" roughness={0.2} metalness={0.1} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

function RoadDecor({ q, r, height, board }: { q: number; r: number; height: number; board: HexCell[] }) {
  const coordMap = useMemo(
    () => new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c])),
    [board],
  );
  const segments = useMemo(() => {
    const segs: Array<{ dx: number; dz: number; angle: number }> = [];
    HEX_DIRS.forEach(d => {
      const nb = coordMap.get(`${q + d.q},${r + d.r}`);
      if (!nb || nb.terrain !== 'road') return;
      const [nx, nz] = hexToWorld(d.q, d.r);
      const len = Math.sqrt(nx * nx + nz * nz);
      segs.push({ dx: nx / len * 0.5, dz: nz / len * 0.5, angle: Math.atan2(nx, nz) });
    });
    return segs;
  }, [q, r, coordMap]);

  return (
    <group position={[0, height + 0.008, 0]}>
      {/* Central paving stone */}
      <mesh rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.01, 6]} />
        <meshStandardMaterial color="#b09060" roughness={0.7} />
      </mesh>
      {segments.map((s, i) => (
        <mesh key={i} position={[s.dx, 0, s.dz]} rotation={[0, s.angle, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 1.0, 5]} />
          <meshStandardMaterial color="#c9a571" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ── Village center (level 0) ───────────────────────────────────────

function VillageCenter() {
  return (
    <group>
      {/* Cobblestone base */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.80, 0.80, 0.06, 6]} />
        <meshStandardMaterial color="#a09080" roughness={0.7} />
      </mesh>
      {/* Well */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.20, 8]} />
        <meshStandardMaterial color="#6a5a48" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <torusGeometry args={[0.12, 0.018, 8, 12]} />
        <meshStandardMaterial color="#4a3a28" roughness={0.9} />
      </mesh>
      {/* Support posts */}
      {[0, Math.PI / 2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.12, 0.38, Math.sin(a) * 0.12]}>
          <boxGeometry args={[0.025, 0.26, 0.025]} />
          <meshStandardMaterial color="#3a2a18" roughness={0.9} />
        </mesh>
      ))}
      {/* Roof beam */}
      <mesh position={[0, 0.52, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.28, 0.025, 0.025]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.9} />
      </mesh>
      {/* Tiny houses */}
      {[0.38, -0.38, 0, 0].map((dx, i) => {
        const dz = i < 2 ? 0 : (i === 2 ? 0.38 : -0.38);
        return (
          <group key={i} position={[dx, 0, dz]}>
            <mesh position={[0, 0.10, 0]}>
              <boxGeometry args={[0.16, 0.18, 0.16]} />
              <meshStandardMaterial color="#c8b088" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <coneGeometry args={[0.13, 0.14, 4]} />
              <meshStandardMaterial color="#8b4a28" roughness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Hover ghost tile ──────────────────────────────────────────────

function GhostHex({ q, r, terrain }: { q: number; r: number; terrain: TerrainType }) {
  const opacityRef = useRef(0.55);
  const meshRef = useRef<THREE.Mesh>(null);
  const height = TERRAIN_HEIGHT[terrain];

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.45 + Math.sin(clock.getElapsedTime() * 3) * 0.15;
      opacityRef.current = mat.opacity;
    }
  });

  const [x, z] = hexToWorld(q, r);
  return (
    <group position={[x, 0, z]}>
      <mesh ref={meshRef} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[HEX_RADIUS * 0.97, HEX_RADIUS * 0.97, height, 6]} />
        <meshStandardMaterial
          color={TERRAIN_COLOR[terrain]}
          roughness={0.75}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Green outline ring */}
      <mesh position={[0, height + 0.01, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.98, 6]} />
        <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// ── Single hex prism ──────────────────────────────────────────────

function Era1HexPrism({
  cell,
  board,
  neighborCount,
  isCenter,
  dragTerrain,
  canPlace,
  onPlaceTile,
  onRemoveTile,
  readOnly,
}: {
  cell: HexCell;
  board: HexCell[];
  neighborCount: number;
  isCenter: boolean;
  dragTerrain: TerrainType | null;
  canPlace: boolean;
  onPlaceTile: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile: (coord: HexCoord) => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const { q, r } = cell.coord;
  const [x, z] = hexToWorld(q, r);

  const terrain = cell.terrain;
  const isEmpty = terrain === null && !isCenter;

  const baseColor = isCenter ? '#b08060' : terrain ? TERRAIN_COLOR[terrain] : '#1e2835';
  const height = isCenter ? 0.10 : terrain ? TERRAIN_HEIGHT[terrain] : 0.04;
  const heightScale = terrain && (['mountain', 'forest', 'swamp'] as TerrainType[]).includes(terrain)
    ? 0.45 + 0.55 * (neighborCount / 6)
    : 1;
  const finalHeight = height * heightScale;
  const roughness = terrain ? TERRAIN_ROUGHNESS[terrain] : 0.90;

  const outlineColor = hovered && !readOnly && ((!isCenter && isEmpty && dragTerrain && canPlace) || (terrain && !readOnly))
    ? (isEmpty ? '#22c55e' : '#fbbf24')
    : isCenter ? '#f5c518'
    : null;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (readOnly || isCenter) return;
    if (terrain) {
      onRemoveTile({ q, r });
    } else if (dragTerrain && canPlace) {
      onPlaceTile({ q, r }, dragTerrain);
    }
  }, [readOnly, isCenter, terrain, dragTerrain, canPlace, onPlaceTile, onRemoveTile, q, r]);

  return (
    <group position={[x, 0, z]}>
      {/* Hex prism body */}
      <mesh
        position={[0, finalHeight / 2, 0]}
        onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[HEX_RADIUS * 0.97, HEX_RADIUS * 0.97, finalHeight, 6]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={roughness}
          metalness={0.04}
          emissive={hovered ? baseColor : '#000'}
          emissiveIntensity={hovered ? 0.18 : 0}
        />
      </mesh>

      {/* Outline highlight */}
      {outlineColor && (
        <mesh position={[0, finalHeight + 0.01, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
          <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.97, 6]} />
          <meshBasicMaterial color={outlineColor} side={THREE.DoubleSide} transparent opacity={0.90} />
        </mesh>
      )}

      {/* Empty slot indicator */}
      {isEmpty && !hovered && (
        <mesh position={[0, finalHeight + 0.01, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
          <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.97, 6]} />
          <meshBasicMaterial color="#334155" side={THREE.DoubleSide} transparent opacity={0.40} />
        </mesh>
      )}

      {/* Terrain decorations */}
      {isCenter && <VillageCenter />}
      {terrain === 'plain'    && <PlainDecor    q={q} r={r} height={finalHeight} />}
      {terrain === 'forest'   && <ForestDecor   q={q} r={r} height={finalHeight} />}
      {terrain === 'mountain' && <MountainDecor q={q} r={r} height={finalHeight} />}
      {terrain === 'swamp'    && <SwampDecor    q={q} r={r} height={finalHeight} />}
      {terrain === 'road'     && <RoadDecor     q={q} r={r} height={finalHeight} board={board} />}
    </group>
  );
}

// ── Ground plane ──────────────────────────────────────────────────

function GroundDisc() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <circleGeometry args={[12, 64]} />
      <meshStandardMaterial color="#1a1e28" roughness={0.95} />
    </mesh>
  );
}

// ── Props ─────────────────────────────────────────────────────────

type Props = {
  board: HexCell[];
  onPlaceTile: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile: (coord: HexCoord) => void;
  dragTerrain: TerrainType | null;
  raceId?: RaceId;
  onResetBoard?: () => void;
  readOnly?: boolean;
};

// ── Main 3D board ─────────────────────────────────────────────────

export function HexBoard3D({ board, onPlaceTile, onRemoveTile, dragTerrain, readOnly }: Props) {
  const t = useI18n(s => s.t);
  const [hoveredCoord, setHoveredCoord] = useState<string | null>(null);

  // Per-terrain placed counts (to enforce inventory limits).
  const placedCounts = useMemo(() => {
    const counts: Partial<Record<TerrainType, number>> = {};
    for (const cell of board) {
      if (cell.terrain) counts[cell.terrain] = (counts[cell.terrain] ?? 0) + 1;
    }
    return counts;
  }, [board]);

  // Neighbor-count map for decoration scaling.
  const coordMap = useMemo(
    () => new Map(board.map(c => [`${c.coord.q},${c.coord.r}`, c])),
    [board],
  );
  const neighborCount = useCallback((cell: HexCell): number => {
    if (!cell.terrain) return 0;
    let n = 0;
    for (const d of HEX_DIRS) {
      const nb = coordMap.get(`${cell.coord.q + d.q},${cell.coord.r + d.r}`);
      if (nb?.terrain === cell.terrain) n++;
    }
    return n;
  }, [coordMap]);

  // Ghost hex for hover-over-empty-slot preview.
  const ghostCell = useMemo(() => {
    if (!dragTerrain || !hoveredCoord) return null;
    const cell = coordMap.get(hoveredCoord);
    if (!cell || cell.terrain !== null || (cell.coord.q === 0 && cell.coord.r === 0)) return null;
    return cell;
  }, [dragTerrain, hoveredCoord, coordMap]);

  return (
    <div
      className="relative w-full h-full min-h-[380px] overflow-hidden select-none touch-manipulation rounded-xl"
      onContextMenu={e => e.preventDefault()}
    >
      <Canvas
        camera={{ position: [0, 14, 14], fov: 42, near: 0.1, far: 300 }}
        shadows
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#0d1220']} />
          <fog attach="fog" args={['#1a2140', 20, 55]} />

          <Sky
            distance={450000}
            sunPosition={[40, 20, 30]}
            inclination={0.50}
            azimuth={0.25}
            turbidity={5}
            rayleigh={1.0}
            mieCoefficient={0.008}
            mieDirectionalG={0.85}
          />
          <Clouds material={THREE.MeshBasicMaterial} limit={20}>
            <Cloud position={[-8, 12, -6]}  seed={1} segments={12} bounds={[5, 1.2, 3]} volume={4} color="#e8e6f0" opacity={0.40} />
            <Cloud position={[9,  12,  8]}  seed={5} segments={10} bounds={[4, 1.0, 3]} volume={3} color="#dfe1ee" opacity={0.35} />
          </Clouds>

          <ambientLight intensity={0.55} />
          <directionalLight
            position={[12, 20, 8]}
            intensity={1.10}
            color="#fff3d9"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={50}
            shadow-camera-left={-14}
            shadow-camera-right={14}
            shadow-camera-top={14}
            shadow-camera-bottom={-14}
          />
          <hemisphereLight args={['#c4d8ff', '#3a2d1e', 0.35]} />

          <GroundDisc />

          {board.map(cell => {
            const key = `${cell.coord.q},${cell.coord.r}`;
            const isCenter = cell.coord.q === 0 && cell.coord.r === 0;
            const nb = neighborCount(cell);
            const canPlace = !readOnly && !!dragTerrain;

            return (
              <group
                key={key}
                onPointerOver={e => { e.stopPropagation(); setHoveredCoord(key); }}
                onPointerOut={() => setHoveredCoord(prev => prev === key ? null : prev)}
              >
                <Era1HexPrism
                  cell={cell}
                  board={board}
                  neighborCount={nb}
                  isCenter={isCenter}
                  dragTerrain={dragTerrain}
                  canPlace={canPlace}
                  onPlaceTile={onPlaceTile}
                  onRemoveTile={onRemoveTile}
                  readOnly={readOnly}
                />
              </group>
            );
          })}

          {/* Ghost preview for the tile being placed */}
          {ghostCell && dragTerrain && (
            <GhostHex q={ghostCell.coord.q} r={ghostCell.coord.r} terrain={dragTerrain} />
          )}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={5}
            maxDistance={30}
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI / 2.1}
            target={[0, 0, 0]}
            makeDefault
          />
        </Suspense>
      </Canvas>

      {/* Controls hint */}
      <div className="absolute bottom-2 left-2 z-10 text-text-faint text-[10px] pointer-events-none hidden sm:block">
        {t.hexBoard.dragHint}
      </div>

      {/* Terrain label overlay while dragging */}
      {dragTerrain && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-game-surface/80 backdrop-blur-sm border border-border-subtle text-xs text-game-gold font-semibold pointer-events-none">
          {dragTerrain}
        </div>
      )}
    </div>
  );
}
