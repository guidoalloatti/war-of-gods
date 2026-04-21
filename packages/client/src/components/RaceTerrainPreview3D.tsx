import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import * as THREE from 'three';

// ─── Shared constants (mirrored from Era3HexMap3D, no import cycle) ───────────
const HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);

type TerrainType = 'plain' | 'mountain' | 'forest' | 'swamp' | 'road' | 'ruins';

const TERRAIN_COLOR: Record<TerrainType, string> = {
  plain: '#7bb07a',
  mountain: '#8a8680',
  forest: '#3d8553',
  swamp: '#6d4782',
  road: '#c9a571',
  ruins: '#b8805a',
};

const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  plain: 0.04,
  road: 0.04,
  ruins: 0.05,
  swamp: 0.04,
  forest: 0.32,
  mountain: 0.72,
};

function hexToWorld(q: number, r: number): [number, number] {
  const x = HEX_RADIUS * SQRT3 * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return [x, z];
}

function hash2(q: number, r: number, salt = 0): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h >>> 0) ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// ─── Hex layout for preview: 1 center + 6 ring ────────────────────────────────
const PREVIEW_HEXES: Array<{ q: number; r: number }> = [
  { q: 0, r: 0 },
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  // second ring (partial)
  { q: 2, r: 0 }, { q: 2, r: -1 }, { q: 2, r: -2 },
  { q: 0, r: -2 }, { q: -1, r: -1 }, { q: -2, r: 0 },
  { q: -2, r: 1 }, { q: -2, r: 2 }, { q: 0, r: 2 },
  { q: 1, r: 1 }, { q: -1, r: 2 }, { q: 1, r: -2 },
];

// ─── Decoration components ────────────────────────────────────────────────────

function ForestDecor({ q, r, h }: { q: number; r: number; h: number }) {
  const trees = useMemo(() => {
    const out: Array<{ x: number; z: number; s: number; c: string }> = [];
    const count = 3 + Math.floor(hash2(q, r, 2) * 3);
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 20 + i) * Math.PI * 2;
      const rr = 0.1 + hash2(q, r, 50 + i) * 0.5;
      const s = 0.75 + hash2(q, r, 80 + i) * 0.5;
      const c = ['#1e4a2c', '#245c36', '#1a3e25', '#2a6b40'][Math.floor(hash2(q, r, 100 + i) * 4)];
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, s, c });
    }
    return out;
  }, [q, r]);
  return (
    <group position={[0, h, 0]}>
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

function MountainDecor({ q, r, h }: { q: number; r: number; h: number }) {
  const peaks = useMemo(() => {
    const out: Array<{ x: number; z: number; w: number; ph: number; c: string }> = [];
    const count = 2 + Math.floor(hash2(q, r, 3) * 3);
    for (let i = 0; i < count; i++) {
      const a = hash2(q, r, 30 + i) * Math.PI * 2;
      const rr = 0.05 + hash2(q, r, 60 + i) * 0.35;
      const w = 0.32 + hash2(q, r, 110 + i) * 0.25;
      const ph = 0.5 + hash2(q, r, 140 + i) * 0.55;
      const c = ['#5a544e', '#6b6560', '#4b4540'][Math.floor(hash2(q, r, 160 + i) * 3)];
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, w, ph, c });
    }
    return out;
  }, [q, r]);
  return (
    <group position={[0, h, 0]}>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.ph / 2, 0]} castShadow>
            <coneGeometry args={[p.w, p.ph, 5]} />
            <meshStandardMaterial color={p.c} roughness={0.98} flatShading />
          </mesh>
          {p.ph > 0.65 && (
            <mesh position={[0, p.ph - 0.08, 0]}>
              <coneGeometry args={[p.w * 0.45, 0.2, 5]} />
              <meshStandardMaterial color="#ecebe8" roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function SwampDecor({ q, r, h }: { q: number; r: number; h: number }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.opacity = 0.55 + Math.sin(clock.elapsedTime + q * 0.7 + r * 0.5) * 0.08;
  });
  const reeds = useMemo(() => {
    const out: Array<{ x: number; z: number; rh: number }> = [];
    for (let i = 0; i < 5; i++) {
      const a = hash2(q, r, 400 + i) * Math.PI * 2;
      const rr = 0.2 + hash2(q, r, 420 + i) * 0.3;
      const rh = 0.2 + hash2(q, r, 440 + i) * 0.18;
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, rh });
    }
    return out;
  }, [q, r]);
  return (
    <group position={[0, h, 0]}>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.55, 20]} />
        <meshStandardMaterial
          ref={matRef}
          color="#4a2e66"
          transparent
          opacity={0.6}
          roughness={0.2}
          metalness={0.4}
          emissive="#2a1440"
          emissiveIntensity={0.3}
        />
      </mesh>
      {reeds.map((rd, i) => (
        <mesh key={i} position={[rd.x, rd.rh / 2, rd.z]}>
          <cylinderGeometry args={[0.015, 0.02, rd.rh, 4]} />
          <meshStandardMaterial color="#4a5240" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[hash2(q, r, 500) * 0.3 - 0.15, 0.15, hash2(q, r, 520) * 0.3 - 0.15]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color="#a5f3fc" emissive="#06b6d4" emissiveIntensity={0.6} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function PlainDecor({ q, r, h }: { q: number; r: number; h: number }) {
  const spots = useMemo(() => {
    const out: Array<{ x: number; z: number; kind: 'flower' | 'tuft'; c: string }> = [];
    for (let i = 0; i < 5; i++) {
      const a = hash2(q, r, 10 + i) * Math.PI * 2;
      const rr = 0.1 + hash2(q, r, 40 + i) * 0.5;
      const kind = hash2(q, r, 70 + i) > 0.5 ? 'flower' : 'tuft';
      const c = kind === 'flower'
        ? (['#f8bbd0', '#fde68a', '#fca5a5', '#c4b5fd'])[Math.floor(hash2(q, r, 90 + i) * 4)]
        : '#5f8b52';
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, kind, c });
    }
    return out;
  }, [q, r]);
  return (
    <group position={[0, h, 0]}>
      {spots.map((s, i) => s.kind === 'flower' ? (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.14, 5]} />
            <meshStandardMaterial color="#3e6b34" />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={s.c} emissive={s.c} emissiveIntensity={0.2} />
          </mesh>
        </group>
      ) : (
        <mesh key={i} position={[s.x, 0.05, s.z]}>
          <coneGeometry args={[0.07, 0.13, 5]} />
          <meshStandardMaterial color={s.c} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function RuinsDecor({ q, r, h }: { q: number; r: number; h: number }) {
  const pillars = useMemo(() => {
    const out: Array<{ x: number; z: number; ph: number; rot: number }> = [];
    for (let i = 0; i < 3; i++) {
      const a = hash2(q, r, 300 + i) * Math.PI * 2;
      const rr = 0.2 + hash2(q, r, 320 + i) * 0.25;
      const ph = 0.25 + hash2(q, r, 340 + i) * 0.35;
      const rot = hash2(q, r, 360 + i) * 0.4 - 0.2;
      out.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph, rot });
    }
    return out;
  }, [q, r]);
  return (
    <group position={[0, h, 0]}>
      {pillars.map((p, i) => (
        <mesh key={i} position={[p.x, p.ph / 2, p.z]} rotation={[p.rot, 0, p.rot * 0.8]} castShadow>
          <boxGeometry args={[0.14, p.ph, 0.14]} />
          <meshStandardMaterial color="#9c7b5e" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, -0.1]} castShadow>
        <torusGeometry args={[0.28, 0.06, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#b08965" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─── Scene content ────────────────────────────────────────────────────────────

function PreviewScene({ favorableTerrain, raceColor }: { favorableTerrain: TerrainType; raceColor: string }) {
  // Assign terrain types to the hex cluster: center + ring = favorable, outer ring = mixed
  const hexData = useMemo(() => {
    return PREVIEW_HEXES.map((hc, idx) => {
      // Center is capital (always plain base), inner ring mostly favorable, outer mixed
      const dist = Math.max(Math.abs(hc.q), Math.abs(hc.r), Math.abs(-hc.q - hc.r));
      let terrain: TerrainType;
      if (idx === 0) {
        terrain = 'plain'; // center always flat (capital placeholder)
      } else if (dist <= 1) {
        terrain = favorableTerrain;
      } else {
        // Outer ring: alternate between favorable and complementary terrain
        const alt: TerrainType[] = ['plain', 'road', 'ruins'];
        terrain = hash2(hc.q, hc.r, 99) > 0.55 ? favorableTerrain : alt[idx % alt.length];
      }
      return { q: hc.q, r: hc.r, terrain };
    });
  }, [favorableTerrain]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.12;
    }
  });

  return (
    <>
      <color attach="background" args={['#0e1228']} />
      <fog attach="fog" args={['#1a2140', 16, 40]} />
      <Sky
        distance={450000}
        sunPosition={[60, 18, 40]}
        inclination={0.48}
        azimuth={0.25}
        turbidity={5}
        rayleigh={1.0}
        mieCoefficient={0.01}
        mieDirectionalG={0.85}
      />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.2}
        color="#fff3d9"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <hemisphereLight args={['#c4d8ff', '#3a2d1e', 0.35]} />

      {/* Ground disc */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[28, 48]} />
        <meshStandardMaterial color="#1e1930" roughness={1} />
      </mesh>

      <group ref={groupRef}>
        {hexData.map(({ q, r, terrain }) => {
          const [x, z] = hexToWorld(q, r);
          const h = TERRAIN_HEIGHT[terrain];
          const color = TERRAIN_COLOR[terrain];
          const isCenter = q === 0 && r === 0;

          return (
            <group key={`${q},${r}`} position={[x, 0, z]}>
              {/* Hex prism */}
              <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[HEX_RADIUS * 0.97, HEX_RADIUS * 0.97, h, 6]} />
                <meshStandardMaterial
                  color={isCenter ? '#3a3050' : color}
                  roughness={0.75}
                  metalness={isCenter ? 0.3 : 0.05}
                />
              </mesh>

              {/* Capital castle at center */}
              {isCenter && (
                <group position={[0, h, 0]}>
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
                    <meshStandardMaterial color={raceColor} metalness={0.6} roughness={0.3} />
                  </mesh>
                  <pointLight position={[0, 1.2, 0]} intensity={0.8} color={raceColor} distance={4} />
                </group>
              )}

              {/* Terrain decorations */}
              {!isCenter && terrain === 'forest' && <ForestDecor q={q} r={r} h={h} />}
              {!isCenter && terrain === 'mountain' && <MountainDecor q={q} r={r} h={h} />}
              {!isCenter && terrain === 'swamp' && <SwampDecor q={q} r={r} h={h} />}
              {!isCenter && terrain === 'plain' && <PlainDecor q={q} r={r} h={h} />}
              {!isCenter && terrain === 'ruins' && <RuinsDecor q={q} r={r} h={h} />}
            </group>
          );
        })}
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate={false}
        makeDefault
      />
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

type Props = {
  favorableTerrain: string;
  raceColor: string;
  className?: string;
};

export function RaceTerrainPreview3D({ favorableTerrain, raceColor, className = '' }: Props) {
  const terrain = (favorableTerrain as TerrainType) in TERRAIN_COLOR
    ? (favorableTerrain as TerrainType)
    : 'plain';

  return (
    <div className={`w-full h-full rounded-xl overflow-hidden ${className}`}>
      <Canvas
        camera={{ position: [0, 7, 8], fov: 42, near: 0.1, far: 80 }}
        shadows
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <PreviewScene favorableTerrain={terrain} raceColor={raceColor} />
        </Suspense>
      </Canvas>
    </div>
  );
}
