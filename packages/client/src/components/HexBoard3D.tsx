import { Suspense, useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Sky, Clouds, Cloud, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrainType, RaceId } from '@war-of-gods/engine';
import type { HexCell, HexCoord } from './HexBoard.js';
import { useI18n } from '../i18n/index.js';

// ── Constants ─────────────────────────────────────────────────────
const HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);
const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function hash2(q: number, r: number, salt = 0): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h >>> 0) ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function hexToWorld(q: number, r: number): [number, number] {
  const x = HEX_RADIUS * SQRT3 * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return [x, z];
}

// ── Terrain config ─────────────────────────────────────────────────
const TERRAIN_COLOR: Record<TerrainType, string> = {
  plain:    '#7a9e50',
  mountain: '#8a8680',
  forest:   '#3d8553',
  swamp:    '#6b4a20',
  road:     '#c9a571',
};

const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  plain:    0.18,
  road:     0.18,
  swamp:    0.18,
  forest:   0.18,
  mountain: 0.18,
};

const TERRAIN_ROUGHNESS: Record<TerrainType, number> = {
  plain: 0.85, road: 0.65, swamp: 0.92, forest: 0.80, mountain: 0.60,
};

const TERRAIN_EMISSIVE: Record<TerrainType, string> = {
  plain: '#2a4010', mountain: '#202020', forest: '#0a2814', swamp: '#1a0810', road: '#4a3010',
};

// ── Decorations ───────────────────────────────────────────────────

function PlainDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const stalks = useMemo(() => (
    Array.from({ length: 9 }, (_, i) => {
      const angle = hash2(q, r, i * 17) * Math.PI * 2;
      const dist = 0.15 + hash2(q, r, i * 31) * 0.55;
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        h: 0.10 + hash2(q, r, i * 7) * 0.12,
        lean: (hash2(q, r, i * 3) - 0.5) * 0.3,
        color: ['#c8b030', '#d4c040', '#b89820', '#e0c838'][Math.floor(hash2(q, r, i * 5) * 4)],
      };
    })
  ), [q, r]);
  const flowers = useMemo(() => (
    Array.from({ length: 3 }, (_, i) => ({
      x: (hash2(q, r, i * 101) - 0.5) * 0.9,
      z: (hash2(q, r, i * 103) - 0.5) * 0.9,
      color: ['#ff8040', '#ff4488', '#ffdd44'][i],
    }))
  ), [q, r]);
  return (
    <group position={[0, height, 0]}>
      {stalks.map((s, i) => (
        <mesh key={i} position={[s.x, s.h / 2, s.z]} rotation={[s.lean, 0, s.lean * 0.5]}>
          <cylinderGeometry args={[0.010, 0.015, s.h, 4]} />
          <meshStandardMaterial color={s.color} roughness={0.9} />
        </mesh>
      ))}
      {flowers.map((f, i) => (
        <mesh key={`f${i}`} position={[f.x, 0.16, f.z]}>
          <sphereGeometry args={[0.030, 5, 4]} />
          <meshStandardMaterial color={f.color} roughness={0.6} emissive={f.color} emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function ForestDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const trees = useMemo(() => (
    Array.from({ length: 6 }, (_, i) => {
      const angle = hash2(q, r, i * 13) * Math.PI * 2;
      const dist = 0.12 + hash2(q, r, i * 29) * 0.55;
      const treeH = 0.50 + hash2(q, r, i * 11) * 0.45;
      const variant = Math.floor(hash2(q, r, i * 7) * 3); // 0=pine, 1=oak, 2=birch
      const greens = ['#1a6828', '#207838', '#256030'];
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        trunkH: treeH * 0.32,
        crownH: treeH * 0.80,
        crownR: 0.08 + hash2(q, r, i * 5) * 0.09,
        color: greens[variant],
        topColor: hash2(q, r, i) > 0.5 ? '#28a050' : '#1e8040',
        trunkColor: variant === 2 ? '#c0b0a0' : '#4a2808',
        tiers: 2 + variant,
      };
    })
  ), [q, r]);
  return (
    <group position={[0, height, 0]}>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.trunkH / 2, 0]}>
            <cylinderGeometry args={[0.022, 0.032, t.trunkH, 5]} />
            <meshStandardMaterial color={t.trunkColor} roughness={0.95} />
          </mesh>
          {Array.from({ length: t.tiers }, (_, tier) => {
            const frac = tier / (t.tiers - 1 || 1);
            return (
              <mesh key={tier} position={[0, t.trunkH + t.crownH * (0.25 + frac * 0.55), 0]}>
                <coneGeometry args={[t.crownR * (1.4 - frac * 0.7), t.crownH * (0.45 - frac * 0.1), 6]} />
                <meshStandardMaterial color={frac > 0.6 ? t.topColor : t.color} roughness={0.82} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function MountainDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const peaks = useMemo(() => (
    Array.from({ length: 4 }, (_, i) => {
      const angle = (i / 4) * Math.PI * 2 + hash2(q, r, i) * 0.6;
      const dist = 0.06 + hash2(q, r, i * 7) * 0.40;
      const peakH = 0.30 + hash2(q, r, i * 3) * 0.28;
      return {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        h: peakH,
        r: 0.14 + hash2(q, r, i * 5) * 0.12,
        snow: peakH > 0.38,
        snowFrac: 0.65 + hash2(q, r, i * 9) * 0.15,
      };
    })
  ), [q, r]);
  return (
    <group position={[0, height, 0]}>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]}>
            <coneGeometry args={[p.r, p.h, 6]} />
            <meshStandardMaterial color="#5868a0" roughness={0.55} metalness={0.08} />
          </mesh>
          <mesh position={[0, p.h * 0.62, 0]}>
            <coneGeometry args={[p.r * 0.55, p.h * 0.38, 6]} />
            <meshStandardMaterial color="#7080b8" roughness={0.50} metalness={0.10} />
          </mesh>
          {p.snow && (
            <mesh position={[0, p.h * p.snowFrac, 0]}>
              <coneGeometry args={[p.r * 0.38, p.h * 0.36, 6]} />
              <meshStandardMaterial color="#e8f2ff" roughness={0.45} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function SwampDecor({ q, r, height }: { q: number; r: number; height: number }) {
  const pools = useMemo(() => (
    Array.from({ length: 4 }, (_, i) => ({
      x: (hash2(q, r, i * 19) - 0.5) * 1.2,
      z: (hash2(q, r, i * 23) - 0.5) * 1.0,
      rx: 0.09 + hash2(q, r, i * 7) * 0.10,
      rz: 0.05 + hash2(q, r, i * 11) * 0.07,
      color: i % 2 === 0 ? '#2a4a4e' : '#1e3840',
    }))
  ), [q, r]);
  const reeds = useMemo(() => (
    Array.from({ length: 5 }, (_, i) => {
      const angle = hash2(q, r, i * 37) * Math.PI * 2;
      return {
        x: Math.cos(angle) * (0.25 + hash2(q, r, i * 41) * 0.45),
        z: Math.sin(angle) * (0.20 + hash2(q, r, i * 43) * 0.35),
        h: 0.14 + hash2(q, r, i * 47) * 0.10,
      };
    })
  ), [q, r]);
  return (
    <group position={[0, height, 0]}>
      {pools.map((p, i) => (
        <mesh key={i} position={[p.x, 0.005, p.z]} scale={[p.rx * 9, 0.012, p.rz * 9]}>
          <sphereGeometry args={[1, 8, 4]} />
          <meshStandardMaterial color={p.color} roughness={0.15} metalness={0.12} transparent opacity={0.80} />
        </mesh>
      ))}
      {reeds.map((reed, i) => (
        <mesh key={`r${i}`} position={[reed.x, reed.h / 2, reed.z]}>
          <cylinderGeometry args={[0.012, 0.016, reed.h, 4]} />
          <meshStandardMaterial color="#6a5840" roughness={0.9} />
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
    for (const d of HEX_DIRS) {
      const nb = coordMap.get(`${q + d.q},${r + d.r}`);
      if (!nb || nb.terrain !== 'road') continue;
      const [nx, nz] = hexToWorld(d.q, d.r);
      const len = Math.sqrt(nx * nx + nz * nz);
      segs.push({ dx: nx / len * 0.50, dz: nz / len * 0.50, angle: Math.atan2(nx, nz) });
    }
    return segs;
  }, [q, r, coordMap]);

  return (
    <group position={[0, height + 0.010, 0]}>
      {/* Central cobblestone disc */}
      <mesh rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.012, 6]} />
        <meshStandardMaterial color="#a89060" roughness={0.65} />
      </mesh>
      {/* Inner detail ring */}
      <mesh rotation={[-Math.PI / 2, Math.PI / 6, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[0.12, 0.22, 6]} />
        <meshBasicMaterial color="#b8a070" side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>
      {segments.map((s, i) => (
        <mesh key={i} position={[s.dx, 0, s.dz]} rotation={[0, s.angle, Math.PI / 2]}>
          <cylinderGeometry args={[0.075, 0.075, 1.0, 5]} />
          <meshStandardMaterial color="#c4a570" roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

// ── Village Center ────────────────────────────────────────────────

function VillageCenter() {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 1.5) * 0.15;
    }
  });

  const housePositions = [
    { x: 0.44, z: 0.0, rot: 0 }, { x: -0.44, z: 0.0, rot: Math.PI },
    { x: 0.0, z: 0.44, rot: -Math.PI / 2 }, { x: 0.0, z: -0.44, rot: Math.PI / 2 },
  ];

  return (
    <group>
      {/* Cobblestone plaza */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.88, 0.88, 0.08, 6]} />
        <meshStandardMaterial color="#9a8878" roughness={0.72} />
      </mesh>
      {/* Inner plaza ring */}
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
        <ringGeometry args={[0.30, 0.82, 6]} />
        <meshBasicMaterial color="#8a7868" side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>

      {/* Central well */}
      <mesh position={[0, 0.20, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.22, 10]} />
        <meshStandardMaterial color="#7a6a58" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <torusGeometry args={[0.115, 0.018, 8, 14]} />
        <meshStandardMaterial color="#504030" roughness={0.9} />
      </mesh>
      {/* Well support posts */}
      {[0, Math.PI / 2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.115, 0.45, Math.sin(a) * 0.115]}>
          <boxGeometry args={[0.022, 0.28, 0.022]} />
          <meshStandardMaterial color="#382818" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.60, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.26, 0.022, 0.022]} />
        <meshStandardMaterial color="#382818" roughness={0.9} />
      </mesh>
      {/* Flag */}
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.30, 5]} />
        <meshStandardMaterial color="#c0a050" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh ref={flagRef} position={[0.08, 0.74, 0]}>
        <boxGeometry args={[0.18, 0.10, 0.003]} />
        <meshStandardMaterial color="#e84040" roughness={0.7} emissive="#601010" emissiveIntensity={0.3} />
      </mesh>

      {/* Houses */}
      {housePositions.map((h, i) => (
        <group key={i} position={[h.x, 0.085, h.z]} rotation={[0, h.rot, 0]}>
          {/* Walls */}
          <mesh position={[0, 0.11, 0]}>
            <boxGeometry args={[0.19, 0.21, 0.17]} />
            <meshStandardMaterial color={['#d0b898', '#c4a888', '#bca080', '#c8b090'][i]} roughness={0.85} />
          </mesh>
          {/* Roof */}
          <mesh position={[0, 0.26, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.15, 0.16, 4]} />
            <meshStandardMaterial color={['#8b3a20', '#7a3218', '#9a4228', '#833020'][i]} roughness={0.80} />
          </mesh>
          {/* Door */}
          <mesh position={[0, 0.07, 0.086]}>
            <boxGeometry args={[0.055, 0.12, 0.01]} />
            <meshStandardMaterial color="#4a3018" roughness={0.9} />
          </mesh>
          {/* Window */}
          <mesh position={[0.07, 0.13, 0.086]}>
            <boxGeometry args={[0.045, 0.045, 0.01]} />
            <meshStandardMaterial color="#a0c0e0" roughness={0.3} metalness={0.2} transparent opacity={0.7} />
          </mesh>
        </group>
      ))}

      {/* Road paths between houses */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
        <mesh key={`path${i}`} position={[Math.cos(a) * 0.22, 0.086, Math.sin(a) * 0.22]} rotation={[0, a, 0]}>
          <boxGeometry args={[0.10, 0.005, 0.22]} />
          <meshStandardMaterial color="#8a7868" roughness={0.80} />
        </mesh>
      ))}
    </group>
  );
}

// ── Water border hex ──────────────────────────────────────────────

function WaterHex({ q, r }: { q: number; r: number }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const wave1Ref = useRef<THREE.Mesh>(null);
  const wave2Ref = useRef<THREE.Mesh>(null);
  const [x, z] = hexToWorld(q, r);
  const phase = (q * 0.37 + r * 0.61) * Math.PI;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) matRef.current.emissiveIntensity = 0.22 + Math.sin(t * 0.8 + phase) * 0.06;
    if (wave1Ref.current) {
      const cycle = ((t * 0.55 + phase) % 2) / 2;
      const s = 0.3 + cycle * 0.7;
      wave1Ref.current.scale.set(s, 1, s);
      (wave1Ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.45;
    }
    if (wave2Ref.current) {
      const cycle = ((t * 0.55 + phase + 1) % 2) / 2;
      const s = 0.3 + cycle * 0.7;
      wave2Ref.current.scale.set(s, 1, s);
      (wave2Ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.35;
    }
  });
  return (
    <group position={[x, -0.04, z]}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[HEX_RADIUS * 0.98, HEX_RADIUS * 0.98, 0.18, 6]} />
        <meshStandardMaterial ref={matRef} color="#2a6aaa" emissive="#1a4a80" emissiveIntensity={0.22} roughness={0.08} metalness={0.5} />
      </mesh>
      <mesh ref={wave1Ref} position={[0, 0.186, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.22, 10]} />
        <meshBasicMaterial color="#6ac0f0" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wave2Ref} position={[0, 0.186, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.18, 10]} />
        <meshBasicMaterial color="#88d0ff" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Ghost preview ─────────────────────────────────────────────────

function GhostHex({ q, r, terrain }: { q: number; r: number; terrain: TerrainType }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const height = TERRAIN_HEIGHT[terrain];
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.40 + Math.sin(clock.getElapsedTime() * 3) * 0.18;
    }
  });
  const [x, z] = hexToWorld(q, r);
  return (
    <group position={[x, 0, z]}>
      <mesh ref={meshRef} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[HEX_RADIUS * 0.97, HEX_RADIUS * 0.97, height, 6]} />
        <meshStandardMaterial color={TERRAIN_COLOR[terrain]} roughness={0.75} transparent opacity={0.50} />
      </mesh>
      <mesh position={[0, height + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.97, 6]} />
        <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} transparent opacity={0.90} />
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
  onPlaceTile?: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile?: (coord: HexCoord) => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const { q, r } = cell.coord;
  const [x, z] = hexToWorld(q, r);

  const terrain = cell.terrain;
  const isEmpty = terrain === null && !isCenter;

  const baseColor = isCenter ? '#b89060' : terrain ? TERRAIN_COLOR[terrain] : '#1a2030';
  const finalHeight = 0.18;
  const roughness = terrain ? TERRAIN_ROUGHNESS[terrain] : 0.92;
  const emissive = terrain ? TERRAIN_EMISSIVE[terrain] : '#000';

  const outlineColor = hovered && !readOnly && ((!isCenter && isEmpty && dragTerrain && canPlace) || (terrain && !readOnly))
    ? (isEmpty ? '#22c55e' : '#fbbf24')
    : isCenter ? '#f5c518'
    : null;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (readOnly || isCenter) return;
    if (terrain) onRemoveTile?.({ q, r });
    else if (dragTerrain && canPlace) onPlaceTile?.({ q, r }, dragTerrain);
  }, [readOnly, isCenter, terrain, dragTerrain, canPlace, onPlaceTile, onRemoveTile, q, r]);

  return (
    <group position={[x, 0, z]}>
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
          emissive={hovered ? baseColor : emissive}
          emissiveIntensity={hovered ? 0.22 : 0.15}
        />
      </mesh>

      {/* Side edge — slightly darker */}
      <mesh position={[0, finalHeight / 2, 0]}>
        <cylinderGeometry args={[HEX_RADIUS * 0.97, HEX_RADIUS * 0.99, finalHeight, 6, 1, true]} />
        <meshStandardMaterial color={baseColor} roughness={roughness + 0.1} side={THREE.BackSide} />
      </mesh>

      {outlineColor && (
        <mesh position={[0, finalHeight + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[HEX_RADIUS * 0.82, HEX_RADIUS * 0.97, 6]} />
          <meshBasicMaterial color={outlineColor} side={THREE.DoubleSide} transparent opacity={0.92} />
        </mesh>
      )}

      {isEmpty && !hovered && (
        <mesh position={[0, finalHeight + 0.010, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[HEX_RADIUS * 0.80, HEX_RADIUS * 0.97, 6]} />
          <meshBasicMaterial color="#2a3a55" side={THREE.DoubleSide} transparent opacity={0.38} />
        </mesh>
      )}

      {isCenter && <VillageCenter />}
      {terrain === 'plain'    && <PlainDecor    q={q} r={r} height={finalHeight} />}
      {terrain === 'forest'   && <ForestDecor   q={q} r={r} height={finalHeight} />}
      {terrain === 'mountain' && <MountainDecor q={q} r={r} height={finalHeight} />}
      {terrain === 'swamp'    && <SwampDecor    q={q} r={r} height={finalHeight} />}
      {terrain === 'road'     && <RoadDecor     q={q} r={r} height={finalHeight} board={board} />}
    </group>
  );
}

// ── Sea floor ─────────────────────────────────────────────────────

function SeaFloor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.30, 0]} receiveShadow>
        <circleGeometry args={[20, 64]} />
        <meshStandardMaterial color="#0a0a1a" roughness={0.98} />
      </mesh>
      {/* Island base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <circleGeometry args={[7.5, 6]} />
        <meshStandardMaterial color="#1a1814" roughness={0.90} />
      </mesh>
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────

type Props = {
  board: HexCell[];
  onPlaceTile?: (coord: HexCoord, terrain: TerrainType) => void;
  onRemoveTile?: (coord: HexCoord) => void;
  dragTerrain?: TerrainType | null;
  raceId?: RaceId;
  onResetBoard?: () => void;
  readOnly?: boolean;
};

// ── Main 3D board ─────────────────────────────────────────────────

export function HexBoard3D({ board, onPlaceTile, onRemoveTile, dragTerrain, readOnly }: Props) {
  const t = useI18n(s => s.t);
  const [hoveredCoord, setHoveredCoord] = useState<string | null>(null);

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
        camera={{ position: [0, 15, 16], fov: 40, near: 0.1, far: 300 }}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#0a0a1a']} />

          <Sky
            distance={450000}
            sunPosition={[35, 18, 25]}
            inclination={0.48}
            azimuth={0.22}
            turbidity={4}
            rayleigh={1.2}
            mieCoefficient={0.006}
            mieDirectionalG={0.88}
          />
          <Stars radius={80} depth={40} count={800} factor={3} fade />
          <Clouds material={THREE.MeshBasicMaterial} limit={20}>
            <Cloud position={[-10, 14, -8]} seed={2} segments={14} bounds={[6, 1.4, 3.5]} volume={5} color="#d8dff0" opacity={0.32} />
            <Cloud position={[11, 13, 9]}  seed={7} segments={11} bounds={[5, 1.2, 3]}   volume={4} color="#cfd5e8" opacity={0.28} />
            <Cloud position={[-3, 15, -14]} seed={12} segments={8} bounds={[4, 1.0, 2.5]} volume={3} color="#e0e5f5" opacity={0.22} />
          </Clouds>

          <ambientLight intensity={0.50} color="#b0c0e0" />
          <directionalLight
            position={[14, 22, 10]}
            intensity={1.20}
            color="#fff5e0"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={55}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={16}
            shadow-camera-bottom={-16}
          />
          <directionalLight position={[-8, 10, -5]} intensity={0.28} color="#a0c0ff" />
          <hemisphereLight args={['#b0c8ff', '#302218', 0.40]} />
          {/* Warm fill from below-left for depth */}
          <pointLight position={[-4, 1, 3]} intensity={0.35} color="#ff8040" distance={14} />

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
                  dragTerrain={dragTerrain ?? null}
                  canPlace={canPlace}
                  onPlaceTile={onPlaceTile}
                  onRemoveTile={onRemoveTile}
                  readOnly={readOnly}
                />
              </group>
            );
          })}

          {ghostCell && dragTerrain && (
            <GhostHex q={ghostCell.coord.q} r={ghostCell.coord.r} terrain={dragTerrain} />
          )}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={4}
            maxDistance={32}
            minPolarAngle={0.10}
            maxPolarAngle={Math.PI / 2.05}
            target={[0, 0.5, 0]}
            makeDefault
          />
        </Suspense>
      </Canvas>

      <div className="absolute bottom-2 left-2 z-10 text-text-faint text-[10px] pointer-events-none hidden sm:block">
        {t.hexBoard.dragHint}
      </div>

      {dragTerrain && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-game-surface/80 backdrop-blur-sm border border-border-subtle text-xs text-game-gold font-semibold pointer-events-none">
          {dragTerrain}
        </div>
      )}
    </div>
  );
}
