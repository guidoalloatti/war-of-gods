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

### Engine public API (from `packages/engine/src/index.ts`)

All public types and functions are re-exported from `@war-of-gods/engine`. **Never** import from internal engine paths in client/server code.

Current public exports:
- **Types**: `TerrainType`, `RaceId`, `Race`, `WorldCard`, `EraCard`, `RelicCard`, `CardEffect`, `Player`, `GameState`, `GameConfig`, `GameMode`, `GameAction`, `ScoreBreakdown`, `Bot`, `TechType`, `UnitType`, `HexCoord`, `Hex`, `GameMap`, `Stack`, `Unit`, `Era3Phase`, `PlayerEra3State`
- **Constants**: `getRoadBonus`, `TECH_TYPES`, `UNIT_DEFINITIONS`, `RACIAL_BONUSES`, `ERA3_RECRUIT_COSTS`, `ERA3_BASE_INCOME`, `BOSS_STACK_ID`, `CITADEL_COORD`, `DHAKHAN_OWNER_ID`
- **Races**: `getAllRaces`, `getRaceById`
- **State**: `createGame`, `createRng`
- **Era I**: `era1Reducer`, `calculateScoreBreakdown`
- **Era III utilities**: `hexKey`, `distance`, `neighbors`, `reachableHexes`, `findPath`, `validateRecruit`, `isBossAlive`, `buildBossStack`
- **Bots**: `EasyBot` (handles all three eras)
- **Names**: `generateFullName`

## Commands

```bash
pnpm install          # Install all deps
pnpm dev              # Client (5173) + server (3001) concurrently
pnpm test             # Vitest — 393 tests across engine
pnpm build            # Production build (engine + client + server)
./run.sh start        # Start server in background
./run.sh stop         # Stop server
```

## Environment Variables

- `VITE_SERVER_URL` — Client: server URL (default: `http://localhost:3001`)
- `CORS_ORIGINS` — Server: comma-separated allowed origins (default: `http://localhost:5173,http://localhost:3000`)

## Testing

- 25 suites, 393 tests at `packages/engine/src/__tests__/`
- Run: `pnpm test` or `npx vitest run`
- Coverage: hex math, map gen determinism, path-finding, combat, Dhakhan AI, card effects, Era II costs, King's Table, transitions (I→II, II→III), endgame (heroic turn, boss kill, defeat), exhaustive Era I scoring
- **Scoring consistency**: `scoring-exhaustive.test.ts` validates `total === sum of components` across 65 parameterized cases. If you change the scoring formula, every test case needs recalculating.

## i18n

- Default locale: **English** (`en`), persisted to `localStorage` key `wog-locale`
- Translations: `packages/client/src/i18n/es.ts` (Spanish, canonical type), `en.ts`
- Card data: JSON files have `name`/`name_en`, `flavorText`/`flavorText_en`, `mechanicalText`/`mechanicalText_en`
- Name generator: `generateFullName(raceId, seed, locale)` — locale determines title language
- **Always add both ES and EN** when adding new i18n keys or card text. ES is the canonical type source.

## Card System

- Data: `packages/engine/src/cards/data/*.json` (15 world cards, 30 era cards, 12 relics)
- Loader: `packages/engine/src/cards/loader.ts` validates at module load
- Effects: `packages/engine/src/cards/effect-dispatcher.ts` — 16 implemented, 9 stubs throwing `NotImplementedError`
- **Implemented (16)**: `modify_draw_count`, `modify_trade_limit`, `skip_trade_phase`, `bonus_per_terrain`, `flat_bonus`, `free_tech_level`, `swap_relic`, `grant_relic_to_all`, `draw_two_era_cards_keep_one`, `bonus_per_favorable`, `bonus_per_road`, `bonus_for_all_terrains`, `all_players_bonus`, `double_if_positive`, `modify_road_requirement`, `waive_road_requirement`
- **Stubs (9)**: `discard_and_redraw`, `free_unit`, `scry_pile`, `manual_pick`, `extra_relic`, `preview_next_era_deck`, `view_opponents_tiles`, `double_favorable_tiles`, `return_tiles_to_pile`
- When adding new effects: update `CardEffect` union in `cards/types.ts`, implement in dispatcher, extend the exhaustive switch.

## Scoring (Era I)

Formula: `base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + cardEffects`

- **base**: tiles × race terrain values
- **terrainBonus**: favorable tiles − unfavorable tiles
- **roadBonus**: lookup table (0 roads = -9, 7+ = +6); respects `waive_road_requirement` / `modify_road_requirement` effects
- **diversityBonus**: 4 types → +5, 3 → +2
- **concentrationPenalty**: each tile beyond 8 of one type → -1
- **balanceBonus**: all 4 terrains ≥2 tiles → +3
- **cardEffects**: accumulated from card effects (`player.cardBonusPoints`)

## Era II — Kingdom Construction

Phases: `world_card_reveal → era_cards_deal → apply_penalties → apply_era1_effects → kings_table → tech_allocation → review → convert_surplus → complete`.

- Era I score → Construction Points budget.
- Tech levels (War / Science / Resources / Economy) 0–5, or 0–6 with `allow_level_6` card effect.
- Racial bonuses: each race gets one free tech level. See `RACIAL_BONUSES` in `era2/constants.ts`.
- King's Table: voluntary point transfers between players.
- `calculateTechCost` in `era2/costs.ts` handles flat + per-level cost modifiers.
- On `complete`: triggers `on_era2_close` effects → `transitionEra2ToEra3` → `on_era3_start` effects.
- Free units accumulate in `player.era2State.freeUnitsForEra3` (from tech × racial bonuses), consumed as Era III starting army.

## Era III — The Final War

### Map
- Disc of radius 10 (~331 hexes), generated deterministically via `createRng(state.seed + OFFSET_ERA3_MAP)`.
- 7 terrain types: `plain`, `mountain`, `forest`, `swamp`, `road`, `ruins`, `citadel`.
- Citadel at `(0, 0)`. Player capitals on ring radius 8, equispaced by player count. Wrought spawn zones at radius 4 (midpoint capital ↔ citadel).
- Hex coords: axial `(q, r)`. Keys are strings `"q,r"`.

### State shape
- `GameState.map: GameMap` — hexes by key, referencing `stackId` only (stacks stored separately).
- `GameState.era3Stacks: Record<string, Stack>` — all stacks (player + Dhakhan).
- `GameState.era3Phase`: `awaiting_next_session | game_loop | final_heroic_turn | victory | defeat` (+ legacy unused phases).
- Stacks: up to 6 units. `ownerId` is either a player ID or `'dhakhan'`.

### Turn flow (`game_loop`)
1. Play one Era III card (optional, once/turn).
2. Recruit one unit at own capital (if gold allows, once/turn).
3. Move/attack with stacks (each stack has `movementLeft` reset at turn start).
4. End turn.

At end of cycle (all players acted): gold income → Wrought spawn at spawn zones → Dhakhan AI moves Wrought stacks toward capitals.

### Combat
- `resolveCombat(attacker, defender, hex, turnNumber, bonuses?)` in `era3/combat.ts`. Deterministic, no RNG.
- Damage distributed across defenders. Stacks can be wiped, retreat, or co-occupy if neither is wiped.
- Boss: single stack at citadel with ID `BOSS_STACK_ID`. Built from `buildBossStack(seed)` — 6 diverse units with `hp = defense * BOSS_UNIT_HP_MULT + BOSS_UNIT_HP_BONUS`.
- Boss is excluded from `runDhakhanTurn` movement — he stays at citadel.

### Endgame
- **Heroic trigger**: any player stack within `distance ≤ 1` of citadel while boss alive. Set on `END_TURN`. Phase flips to `final_heroic_turn` on next cycle wrap (Dhakhan turn skipped).
- **Heroic phase**: each living player takes exactly one turn (tracked in `era3HeroicTurnsTaken`). No Dhakhan spawn/move.
- **Victory**: boss wiped → `era3BossKillerId = attacker.ownerId`, phase = `victory`.
- **Defeat**: all player capitals fallen, OR heroic phase ends with boss alive.

### Bots
`EasyBot.decideEra3` priority: start loop → play card (heal-targeted if applicable) → recruit (`mounted → ranged → siege → flying → infantry`) → attack adjacent Dhakhan if `attacker.units.length ≥ target.units.length` → move toward citadel → end turn. Works identically in `game_loop` and `final_heroic_turn`.

## Races (8 total)

All have total construction value = 5. IDs: `elf`, `dwarf`, `human`, `halfelf`, `orc`, `giant`, `goblin`, `halforc`.

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

Race names in `packages/engine/src/races/index.ts` are Spanish (e.g., 'Rey Elfo'). The i18n system provides localized display names via `t.races[raceId]`.

## Multiplayer

- Socket.io events: `create_room`, `join_room` (accepts `{code, name, raceId}`), `player_action`, `reconnect_room`, `disconnect`
- Room management: `packages/server/src/rooms/roomManager.ts` — validation, rate limiting, 2h TTL, stale room cleanup
- Socket handler: `packages/server/src/sockets/gameSocket.ts` — rate limiting (30 actions / 10s per socket), authorization (playerId injection for optional fields), debounced state broadcast (50ms coalescing)
- Players added dynamically on join (not pre-assigned slots). Max 6 per room, duplicate race check on join.
- `GameState` broadcast in full on each action (no delta protocol — cheap because state is compact JSON).

## Tile System (Era I)

- 150 tiles (30 each: plain, mountain, forest, swamp, road)
- Each player draws `TILES_PER_PLAYER` (18) + `drawCountModifier` from card effects
- **Guaranteed minimum**: 2 favorable terrain tiles per player (swapped from pile if initial draw was short)
- Solo trade: discard 1 tile, draw 1 from pile (ensures at least 1 trade action available)
- Trade limit per player via `tradeLimit` (default 1), counter-based

## Persistence

- **SQLite** at `packages/server/data/wog.db` (better-sqlite3).
- Tables: `users`, `saves` (`game_state` stored as TEXT via `JSON.stringify`).
- **Autosave** (`gameStore.ts#autoSave`): roundtrips full `GameState` to `localStorage` key `wog-local-autosave` (guest) or server via API (logged-in). All eras supported automatically since state is plain JSON.
- **Reconnect**: socket sends `reconnect_room` with `{code, playerId}`; server rejoins and broadcasts latest state.

## Mobile Support

All screens are responsive (mobile-first). Key patterns:
- `RaceSelectionScreen`: horizontal-scroll carousel on mobile, snap-x carousel on desktop (via `useMediaQuery` at `src/hooks/useMediaQuery.ts`).
- `Era1Screen`: sidebar collapses off-canvas on mobile with FAB toggle.
- `Era3Screen`: sidebar stacks above map on mobile, to the left on `lg:`.
- `Era3HexMap`: `max-h-[60vh] sm:max-h-[80vh]`, `touch-manipulation`, stacked text has stroke outline for legibility over any hex fill.
- `AdminLayout`: sidebar hidden on mobile with hamburger + overlay.
- Minimum tap target: 44×44px on all interactive elements.
- Hover-only interactions have touch fallbacks (`sm:opacity-0 sm:group-hover:opacity-100 opacity-100`).
- Safe-area insets honored via `env(safe-area-inset-*)` in body padding.

## Style

- Theme colors: `game-bg` (#0a0a1a), `game-gold` (#f5c518), `game-accent` (#e94560), `game-ember` (#ff6b35). All via CSS variables.
- Animations: `animate-fade-in-up`, `animate-scale-in`, `animate-title-glow`, `animate-border-glow`, `animate-shimmer`, `animate-float-{1,2,3}`.
- Components use `race.color` for dynamic styling.
- `prefers-reduced-motion` media query disables all animations.
- Light/dark theme via CSS variables and `[data-theme="light"]`.
- **Reusable UI tokens** in `index.css`: `.panel` / `.panel-accent` / `.panel-danger` / `.panel-active` / `.panel-tight`, `.chip-gold` / `.chip-muted`, `.eyebrow`, `.btn` + `.btn-sm` with variants `primary` / `ghost` / `danger`. Prefer these over ad-hoc `bg-game-surface/60 border border-border-subtle rounded-2xl p-4` clusters.
