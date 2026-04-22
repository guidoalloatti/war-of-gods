# War of Gods — Claude Code Guide

## Project Overview

Fantasy board game (1–6 players) as a pnpm monorepo. Players build kingdoms, trade tiles, allocate tech, and wage war against Dhakhan across **three fully playable eras**: Reshape the World (I), Forge Alliances (II), The Final War (III).

## Architecture

```
packages/
├── engine/   # Pure game logic — zero UI/network deps, runs in Node or browser
├── client/   # React 18 + Vite + Tailwind frontend (mobile-first)
└── server/   # Express + Socket.io + SQLite multiplayer backend
```

### Key Patterns

- **Immutable state**: `gameReducer(state, action) → newState`. Dispatches to `era1Reducer`, `era2Reducer`, or `era3Reducer` based on `state.phase`. Never mutate `GameState` or its nested objects.
- **Deterministic RNG**: Mulberry32 seeded from `state.seed + OFFSET`. All randomness must go through `createRng()`. Different subsystems use different offsets (map gen, card draw, tile draw) so seeds remain reproducible.
- **Discriminated unions**: `GameAction`, `CardEffect`, `Era2Phase`, `Era3Phase`. Switches must be exhaustive — add a `never` assertion or default case that throws.
- **Plain-JSON state**: `GameState` is serializable end-to-end (no `Map`/`Set`). Stored in SQLite as TEXT, broadcast over Socket.io via `JSON.stringify`, autosaved to `localStorage`.
- **Zustand stores**: `gameStore.ts` (game state, multiplayer, autosave), `i18n/index.ts` (locale, localStorage-persisted).

### Engine public API (`packages/engine/src/index.ts`)

All public types/functions re-exported from `@war-of-gods/engine`. **Never** import internal engine paths in client/server.

- **Types**: `TerrainType`, `RaceId`, `Race`, `WorldCard`, `EraCard`, `RelicCard`, `CardEffect`, `Player`, `GameState`, `GameConfig`, `GameMode`, `GameAction`, `ScoreBreakdown`, `Bot`, `TechType`, `UnitType`, `HexCoord`, `Hex`, `GameMap`, `Stack`, `Unit`, `Era3Phase`, `PlayerEra3State`
- **Constants**: `getRoadBonus`, `TECH_TYPES`, `UNIT_DEFINITIONS`, `RACIAL_BONUSES`, `ERA3_RECRUIT_COSTS`, `ERA3_BASE_INCOME`, `BOSS_STACK_ID`, `CITADEL_COORD`, `DHAKHAN_OWNER_ID`, `ERA3_SCIENCE_UNIT_REQS`
- **Fns**: `getAllRaces`, `getRaceById`, `createGame`, `createRng`, `era1Reducer`, `calculateScoreBreakdown`, `hexKey`, `distance`, `neighbors`, `reachableHexes`, `findPath`, `validateRecruit`, `validateBuildRoad`, `isBossAlive`, `buildBossStack`, `scienceAllowsUnit`, `recruitsPerTurn`, `maxStackSize`
- **Bots**: `EasyBot` (handles all three eras)
- **Names**: `generateFullName`

## Commands

```bash
pnpm install          # Install all deps
pnpm dev              # Client (5173) + server (3001) concurrently
pnpm test             # Vitest — 432 tests across engine (29 suites)
pnpm build            # Production build
./run.sh start        # Start server in background
./run.sh stop         # Stop server
```

## Environment Variables

- `VITE_SERVER_URL` — Client: server URL (default: `http://localhost:3001`)
- `CORS_ORIGINS` — Server: comma-separated allowed origins

## Testing

- 29 suites, 432 tests at `packages/engine/src/__tests__/`
- Run: `pnpm test` or `npx vitest run`
- Coverage: hex math, map gen determinism, path-finding, combat, Dhakhan AI, card effects, Era II costs, King's Table, transitions (I→II, II→III), endgame (heroic turn, boss kill, defeat), exhaustive Era I scoring
- **Scoring consistency**: `scoring-exhaustive.test.ts` validates `total === sum of components` across 65 cases. If you change scoring, recalculate all cases.

## i18n

- Default locale: **English** (`en`), persisted to `localStorage` key `wog-locale`
- Translations: `packages/client/src/i18n/es.ts` (Spanish, canonical type source), `en.ts`
- Card data JSON: `name`/`name_en`, `flavorText`/`flavorText_en`, `mechanicalText`/`mechanicalText_en`
- **Always add both ES and EN** when adding i18n keys or card text.

## Card System

- Data: `packages/engine/src/cards/data/*.json` (15 world, 30 era, 12 relics)
- Effects dispatcher: `packages/engine/src/cards/effect-dispatcher.ts`
- **Implemented (16)**: `modify_draw_count`, `modify_trade_limit`, `skip_trade_phase`, `bonus_per_terrain`, `flat_bonus`, `free_tech_level`, `swap_relic`, `grant_relic_to_all`, `draw_two_era_cards_keep_one`, `bonus_per_favorable`, `bonus_per_road`, `bonus_for_all_terrains`, `all_players_bonus`, `double_if_positive`, `modify_road_requirement`, `waive_road_requirement`
- **Stubs (9)**: `discard_and_redraw`, `free_unit`, `scry_pile`, `manual_pick`, `extra_relic`, `preview_next_era_deck`, `view_opponents_tiles`, `double_favorable_tiles`, `return_tiles_to_pile`
- Adding new effects: update `CardEffect` union in `cards/types.ts`, implement in dispatcher, extend exhaustive switch.

## Scoring (Era I)

`base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + cardEffects`

- **base**: tiles × race terrain values; **terrainBonus**: favorable − unfavorable tiles
- **roadBonus**: table (0 roads = -9, 7+ = +6); respects `waive_road_requirement` / `modify_road_requirement`
- **diversityBonus**: 4 types → +5, 3 → +2; **concentrationPenalty**: each tile beyond 8 of one type → -1
- **balanceBonus**: all 4 terrains ≥2 tiles → +3; **cardEffects**: `player.cardBonusPoints`

## Era II — Kingdom Construction

Phases: `world_card_reveal → era_cards_deal → apply_penalties → apply_era1_effects → kings_table → tech_allocation → review → convert_surplus → complete`

- Era I score → Construction Points budget. Tech levels (War/Science/Resources/Economy) 0–5 (0–6 with card).
- Racial bonuses: each race gets one free tech level. `RACIAL_BONUSES` in `era2/constants.ts`.
- King's Table: voluntary point transfers. `calculateTechCost` in `era2/costs.ts`.
- On `complete`: `on_era2_close` effects → `transitionEra2ToEra3` → `on_era3_start` effects.
- Free units: `player.era2State.freeUnitsForEra3` consumed as Era III starting army.

## Era III — The Final War

### Map
- Disc radius 10 (~331 hexes), generated deterministically via `createRng(state.seed + OFFSET_ERA3_MAP)`.
- Terrain types: `plain`, `mountain`, `forest`, `swamp`, `road`, `ruins`, `citadel`, `lake`, `river`, `hill`, `desert`.
- **Roads**: `terrain: 'road'` stores `roadTerrain` (original terrain under the road) for visual rendering. Road overlay on any terrain = `hasRoadOverlay: true`. All terrains can be paved or terraformed.
- Citadel at `(0,0)`. Capitals ring radius 8. Wrought spawn zones radius 4.
- Hex coords: axial `(q, r)`. Keys: `"q,r"`.

### Hex type (`packages/engine/src/types/era3.ts`)
```ts
Hex = {
  terrain: HexTerrain; isCapital; capitalOwnerId; isSpawnZone; spawnZoneDestroyed;
  stackId; ruinsReward; ruinsLooted; hasFort; hasRoadOverlay; hasBridge;
  roadTerrain?: HexTerrain;  // original terrain before road was paved (visual only)
}
```

### State shape
- `GameState.map: GameMap` — hexes by key, `stackId` ref only.
- `GameState.era3Stacks: Record<string, Stack>` — all stacks (player + Dhakhan).
- `GameState.era3Phase`: `awaiting_next_session | game_loop | final_heroic_turn | victory | defeat`.
- Stacks: up to 6 units. `ownerId` = player ID or `'dhakhan'`.

### Movement costs (×3 scale so road = 1)
`road=1`, `river+bridge=1`, `plain/hill/ruins/citadel=3`, `swamp=4`, `forest/desert/mountain=6`, `lake=Infinity`. `hasRoadOverlay` reduces cost to 1 for any terrain.

### Turn flow (`game_loop`)
1. Play one Era III card (optional, once/turn).
2. Recruit at own capital (gold + science tech check, per-turn limit by war tech).
3. Move/attack with stacks (`movementLeft` reset each turn).
4. End turn → gold income → Wrought spawn → Dhakhan AI.

### Science tech unit requirements (`ERA3_SCIENCE_UNIT_REQS`)
`infantry=0`, `ranged=1`, `mounted=2`, `siege=3`, `flying=4`. Use `scienceAllowsUnit(player, unitType)` to check.

### Combat
`resolveCombat(attacker, defender, hex, turnNumber, bonuses?)` in `era3/combat.ts`. Deterministic, no RNG. Boss at citadel (`BOSS_STACK_ID`) stays put; wiping it = victory.

### Endgame
- **Heroic trigger**: player stack within distance ≤1 of citadel while boss alive.
- **Victory**: boss wiped → `era3BossKillerId`, phase = `victory`.
- **Defeat**: all capitals fallen, OR heroic phase ends with boss alive.

### Bots
`EasyBot.decideEra3`: start loop → play card → recruit (`mounted→ranged→siege→flying→infantry`) → attack adjacent Dhakhan if favorable → move toward citadel → end turn.

## 3D Map Rendering (`Era3HexMap3D.tsx`)

- React Three Fiber + @react-three/drei. Hex prism = `cylinderGeometry` 6 sides.
- **Road rendering**: `terrain='road'` hexes render `roadTerrain` base decorations + `RoadDecor` overlay. `hasRoadOverlay` on non-road terrain adds thin road strip on top.
- **Water border**: `WaterHex` components fill one ring outside the playable disk boundary.
- **Tech-locked units**: `techLockedUnits` prop passes science-blocked units to show greyed-out in context menu and sidebar.
- Context menu (right-click): build road, build road overlay, terraform, drain water, build bridge, recruit, stack actions.
- `roadTerrain` field on `Hex` tells the renderer which terrain decor to draw under the road.

## Races (8 total)

All total construction value = 5. IDs: `elf`, `dwarf`, `human`, `halfelf`, `orc`, `giant`, `goblin`, `halforc`.

| Race | Fav | P/M/F/S | Free Tech |
|---|---|---|---|
| Elf | Forest | 1/0/3/1 | Science |
| Dwarf | Mountain | 0/4/0/1 | Resources |
| Human | Plain | 3/0/1/1 | Economy |
| Half-Elf | Plain | 2/1/2/0 | Science |
| Orc | Swamp | 1/0/1/3 | War |
| Giant | Mountain | 0/3/1/1 | War |
| Goblin | Forest | 1/1/2/1 | Economy |
| Half-Orc | Swamp | 2/1/0/2 | Resources |

Race names in `packages/engine/src/races/index.ts` are Spanish. i18n via `t.races[raceId]`.

## Multiplayer

- Socket.io: `create_room`, `join_room` (`{code, name, raceId}`), `player_action`, `reconnect_room`, `disconnect`
- Room management: `roomManager.ts` — validation, rate limiting, 2h TTL, stale room cleanup
- Socket handler: `gameSocket.ts` — rate limiting (30 actions/10s), authorization, debounced broadcast (50ms)
- Max 6 players/room, duplicate race check. Full `GameState` broadcast on each action.

## Tile System (Era I)

- 150 tiles (30 each: plain, mountain, forest, swamp, road)
- Each player draws 18 + `drawCountModifier`. Guaranteed ≥2 favorable tiles.
- Solo trade: discard 1, draw 1. Trade limit per player via `tradeLimit` (default 1).

## Persistence

- SQLite at `packages/server/data/wog.db` (better-sqlite3). Tables: `users`, `saves`.
- Autosave: `gameStore.ts#autoSave` → `localStorage` (guest) or server API (logged-in).
- Reconnect: `reconnect_room` with `{code, playerId}`.

## Mobile Support

All screens responsive (mobile-first):
- `Era3Screen`: sidebar stacks above map on mobile, left on `lg:`. Width `w-60 xl:w-64`.
- Minimum tap target 44×44px. `touch-manipulation` on map. Safe-area insets honored.

## Style

- Theme: `game-bg` (#0a0a1a), `game-gold` (#f5c518), `game-accent` (#e94560), `game-ember` (#ff6b35).
- Animations: `animate-fade-in-up`, `animate-scale-in`, `animate-title-glow`, `animate-border-glow`, `animate-shimmer`, `animate-float-{1,2,3}`. `prefers-reduced-motion` disables all.
- **Reusable UI tokens** in `index.css`: `.panel` / `.panel-accent` / `.panel-danger` / `.panel-active`, `.chip-gold` / `.chip-muted`, `.eyebrow`, `.btn` + `.btn-sm` with variants `primary` / `ghost` / `danger`. Use these over ad-hoc Tailwind clusters.
