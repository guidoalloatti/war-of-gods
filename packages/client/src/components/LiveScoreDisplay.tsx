import { useState, useMemo } from 'react';
import { getRaceById, getRoadBonus } from '@war-of-gods/engine';
import type { TerrainType, RaceId } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';
import type { HexCell } from './HexBoard.js';

/** Axial hex neighbors (pointy-top): the 6 adjacent directions */
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/**
 * Calculate adjacency bonus from hex board positions.
 * +1 for each pair of adjacent favorable terrain tiles.
 * -1 for each pair of adjacent unfavorable terrain tiles.
 * Each edge is counted once (not double-counted).
 */
export function calculateAdjacencyBonus(
  board: HexCell[],
  favorableTerrain: string,
  unfavorableTerrain: string,
): number {
  const cellMap = new Map<string, HexCell>();
  for (const cell of board) {
    cellMap.set(`${cell.coord.q},${cell.coord.r}`, cell);
  }

  let bonus = 0;

  for (const cell of board) {
    if (!cell.terrain) continue;

    for (let d = 0; d < 3; d++) {
      const dir = HEX_DIRECTIONS[d];
      const nq = cell.coord.q + dir.q;
      const nr = cell.coord.r + dir.r;
      const neighbor = cellMap.get(`${nq},${nr}`);
      if (!neighbor || !neighbor.terrain) continue;

      if (cell.terrain === favorableTerrain && neighbor.terrain === favorableTerrain) {
        bonus += 1;
      }
      if (cell.terrain === unfavorableTerrain && neighbor.terrain === unfavorableTerrain) {
        bonus -= 1;
      }
    }
  }

  return bonus;
}

/**
 * Calculate road connection bonus.
 * Uses BFS to find how many distinct continuous road paths connect
 * the center hex (0,0) to any border hex (level 3).
 * Each path reaching the border gives +3 points.
 */
export function calculateRoadConnectionBonus(board: HexCell[]): number {
  const cellMap = new Map<string, HexCell>();
  for (const cell of board) {
    cellMap.set(`${cell.coord.q},${cell.coord.r}`, cell);
  }

  // BFS from road tiles adjacent to center (0,0) through connected road tiles.
  // The center hex is the village — roads connecting to it count as center-connected.
  const visited = new Set<string>();
  const queue: string[] = [];

  // Seed BFS with road tiles adjacent to center
  for (const dir of HEX_DIRECTIONS) {
    const nk = `${dir.q},${dir.r}`;
    const neighbor = cellMap.get(nk);
    if (neighbor?.terrain === 'road' && !visited.has(nk)) {
      visited.add(nk);
      queue.push(nk);
    }
  }

  // Also allow center itself if it happens to be a road
  const center = cellMap.get('0,0');
  if (center?.terrain === 'road' && !visited.has('0,0')) {
    visited.add('0,0');
    queue.push('0,0');
  }

  if (queue.length === 0) return 0;

  let borderRoadsReached = 0;

  while (queue.length > 0) {
    const key = queue.shift()!;
    const [q, r] = key.split(',').map(Number);

    // Check if this road cell is on the border
    const s = -q - r;
    const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (level === 3) {
      borderRoadsReached++;
    }

    // Explore road neighbors
    for (const dir of HEX_DIRECTIONS) {
      const nk = `${q + dir.q},${r + dir.r}`;
      if (visited.has(nk)) continue;
      const neighbor = cellMap.get(nk);
      if (!neighbor || neighbor.terrain !== 'road') continue;
      visited.add(nk);
      queue.push(nk);
    }
  }

  return borderRoadsReached * 3;
}

/**
 * Calculate ring completion bonus.
 * Ring 1 (level 1, 6 hexes around center): +4 if all filled.
 * Ring 2 (level 2, 12 hexes): +6 if all filled.
 * Center hex (level 0) is the village and is excluded.
 */
export function calculateRingBonus(board: HexCell[]): { ring1: number; ring2: number; total: number } {
  const ring1Cells = board.filter(c => c.level === 1);
  const ring2Cells = board.filter(c => c.level === 2);

  const ring1Complete = ring1Cells.length === 6 && ring1Cells.every(c => c.terrain !== null);
  const ring2Complete = ring2Cells.length === 12 && ring2Cells.every(c => c.terrain !== null);

  const ring1Bonus = ring1Complete ? 4 : 0;
  const ring2Bonus = ring2Complete ? 6 : 0;

  return { ring1: ring1Bonus, ring2: ring2Bonus, total: ring1Bonus + ring2Bonus };
}

// ── Scoring hint tooltips ────────────────────────────────────────

const SCORE_HINTS: Record<string, { en: string; es: string }> = {
  base: {
    en: 'Each tile scores its racial terrain value. Place tiles matching your race\'s strengths.',
    es: 'Cada ficha puntúa su valor racial de terreno. Coloca fichas que coincidan con las fortalezas de tu raza.',
  },
  terrainBonus: {
    en: 'Count of favorable terrain tiles minus unfavorable tiles. Focus on your race\'s preferred terrain.',
    es: 'Fichas de terreno favorable menos desfavorables. Enfócate en el terreno preferido de tu raza.',
  },
  roadBonus: {
    en: 'Based on total roads placed: 0=-9, 1=-6, 2=-3, 3=0, 4=+1, 5=+3, 6=+5, 7+=+6',
    es: 'Según total de rutas colocadas: 0=-9, 1=-6, 2=-3, 3=0, 4=+1, 5=+3, 6=+5, 7+=+6',
  },
  diversityBonus: {
    en: 'Having 4 terrain types gives +5, having 3 gives +2. Don\'t put all eggs in one basket.',
    es: 'Tener 4 tipos de terreno da +5, tener 3 da +2. No pongas todos los huevos en una canasta.',
  },
  concentrationPenalty: {
    en: '-1 for each tile beyond 8 of any single terrain type. Avoid over-concentrating.',
    es: '-1 por cada ficha más allá de 8 del mismo tipo de terreno. Evita sobre-concentrar.',
  },
  balanceBonus: {
    en: '+3 if all 4 terrain types have at least 2 tiles each. Balanced kingdoms prosper.',
    es: '+3 si los 4 tipos de terreno tienen al menos 2 fichas cada uno. Los reinos equilibrados prosperan.',
  },
  adjacencyBonus: {
    en: '+1 per pair of adjacent favorable tiles, -1 per pair of adjacent unfavorable tiles.',
    es: '+1 por par de fichas favorables adyacentes, -1 por par de fichas desfavorables adyacentes.',
  },
  roadConnectionBonus: {
    en: '+3 for each road path connecting center to border. Build trade routes!',
    es: '+3 por cada camino de rutas conectando el centro al borde. ¡Construye rutas comerciales!',
  },
  ringBonus: {
    en: '+4 for completing ring 1 (6 tiles around village), +6 for ring 2 (12 tiles). Surround your village!',
    es: '+4 por completar anillo 1 (6 fichas alrededor de la aldea), +6 por anillo 2 (12 fichas). ¡Rodea tu aldea!',
  },
  cardEffects: {
    en: 'Bonus points from world cards, era cards, and relics applied at scoring.',
    es: 'Puntos bonus de cartas de mundo, era y reliquias aplicados al puntuar.',
  },
};

function InfoTooltip({ hintKey }: { hintKey: string }) {
  const [show, setShow] = useState(false);
  const locale = useI18n(s => s.locale);
  const hint = SCORE_HINTS[hintKey];
  if (!hint) return null;
  const text = locale === 'es' ? hint.es : hint.en;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-text-muted hover:text-text-secondary border border-border-medium hover:border-text-muted transition-colors leading-none"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2.5 bg-game-surface border border-border-medium rounded-lg shadow-2xl z-50 text-xs text-text-primary/80 leading-relaxed pointer-events-none animate-fade-in backdrop-blur-md">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-game-surface border-r border-b border-border-medium rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────

type Props = {
  raceId: RaceId;
  placedCounts: Record<TerrainType, number>;
  cardBonusPoints: number;
  board?: HexCell[];
};

export function LiveScoreDisplay({ raceId, placedCounts, cardBonusPoints, board }: Props) {
  const t = useI18n(s => s.t);
  const race = getRaceById(raceId);

  const breakdown = useMemo(() => {
    const base =
      placedCounts.plain * race.terrainValues.plain +
      placedCounts.mountain * race.terrainValues.mountain +
      placedCounts.forest * race.terrainValues.forest +
      placedCounts.swamp * race.terrainValues.swamp;

    const favorableCount = placedCounts[race.favorableTerrain as TerrainType] ?? 0;
    const unfavorableCount = placedCounts[race.unfavorableTerrain as TerrainType] ?? 0;
    const terrainBonus = favorableCount - unfavorableCount;

    const roadBonus = getRoadBonus(placedCounts.road);

    const terrainTypes = ['plain', 'mountain', 'forest', 'swamp'] as const;
    const typesPresent = terrainTypes.filter(t => placedCounts[t] > 0).length;
    const diversityBonus = typesPresent >= 4 ? 5 : typesPresent >= 3 ? 2 : 0;

    let concentrationPenalty = 0;
    for (const t of terrainTypes) {
      if (placedCounts[t] > 8) concentrationPenalty -= (placedCounts[t] - 8);
    }

    const allBalanced = terrainTypes.every(t => placedCounts[t] >= 2);
    const balanceBonus = allBalanced ? 3 : 0;

    const adjacencyBonus = board
      ? calculateAdjacencyBonus(board, race.favorableTerrain, race.unfavorableTerrain)
      : 0;

    const roadConnectionBonus = board
      ? calculateRoadConnectionBonus(board)
      : 0;

    const ringBonus = board
      ? calculateRingBonus(board).total
      : 0;

    const total = base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + adjacencyBonus + roadConnectionBonus + ringBonus + cardBonusPoints;

    return { base, terrainBonus, roadBonus, diversityBonus, concentrationPenalty, balanceBonus, adjacencyBonus, roadConnectionBonus, ringBonus, cardEffects: cardBonusPoints, total };
  }, [placedCounts, race, cardBonusPoints, board]);

  const totalPlaced = Object.values(placedCounts).reduce((a, b) => a + b, 0);

  const rows = [
    { label: t.scoring.base, value: breakdown.base, color: 'text-blue-400', hintKey: 'base' },
    { label: t.scoring.terrainBonus, value: breakdown.terrainBonus, color: 'text-green-400', hintKey: 'terrainBonus' },
    { label: t.scoring.roadBonus, value: breakdown.roadBonus, color: 'text-amber-400', hintKey: 'roadBonus' },
    { label: t.scoring.diversityBonus, value: breakdown.diversityBonus, color: 'text-purple-400', hintKey: 'diversityBonus' },
    { label: t.scoring.concentrationPenalty, value: breakdown.concentrationPenalty, color: 'text-red-400', hintKey: 'concentrationPenalty' },
    { label: t.scoring.balanceBonus, value: breakdown.balanceBonus, color: 'text-teal-400', hintKey: 'balanceBonus' },
    { label: t.scoring.adjacencyBonus, value: breakdown.adjacencyBonus, color: 'text-cyan-400', hintKey: 'adjacencyBonus' },
    { label: t.scoring.roadConnectionBonus, value: breakdown.roadConnectionBonus, color: 'text-orange-400', hintKey: 'roadConnectionBonus' },
    { label: t.scoring.ringBonus, value: breakdown.ringBonus, color: 'text-rose-400', hintKey: 'ringBonus' },
    { label: t.scoring.cardEffects, value: breakdown.cardEffects, color: 'text-yellow-400', hintKey: 'cardEffects' },
  ];

  return (
    <div id="live-score" className="bg-game-surface/80 backdrop-blur-sm rounded-xl border border-border-subtle p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-game-gold text-xs uppercase tracking-wider font-bold">
            {t.hexBoard.liveScore}
          </span>
        </div>
        <span className="text-text-secondary text-xs">{totalPlaced}/37</span>
      </div>

      <div className="space-y-0.5 text-sm">
        {rows.map(row => (
          <div key={row.hintKey} className="flex justify-between items-center py-0.5">
            <span className="text-text-primary/80 flex items-center gap-1">
              {row.label}
              <InfoTooltip hintKey={row.hintKey} />
            </span>
            <span className={`font-mono font-bold ${
              row.value > 0 ? 'text-emerald-400' : row.value < 0 ? 'text-red-400' : 'text-text-muted'
            }`}>
              {row.value > 0 ? '+' : ''}{row.value}
            </span>
          </div>
        ))}

        <div className="border-t border-border-medium/50 pt-1.5 mt-1.5 flex justify-between items-center">
          <span className="text-game-gold font-bold text-sm">{t.scoring.total}</span>
          <span className="text-game-gold font-bold text-xl font-mono tabular-nums">
            {breakdown.total}
          </span>
        </div>
      </div>
    </div>
  );
}
