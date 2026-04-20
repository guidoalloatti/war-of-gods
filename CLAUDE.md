# War of Gods — Claude Code Guide

## Project Overview

Fantasy board game (1-6 players) as a pnpm monorepo. Players build kingdoms, trade tiles, and prepare for war against Dhakhan. Three eras planned — only Era I is implemented.

## Architecture

```
packages/
├── engine/   # Pure game logic — zero UI/network deps, runs in Node or browser
├── client/   # React 18 + Vite + Tailwind frontend (mobile-responsive)
└── server/   # Express + Socket.io multiplayer backend
```

### Key Patterns

- **Immutable state**: `era1Reducer(state, action) → newState`. Never mutate GameState.
- **Deterministic RNG**: Mulberry32 seeded from `state.seed`. All randomness must go through `createRng()`.
- **Discriminated unions**: `CardEffect` has 25 types — the switch in `effect-dispatcher.ts` must be exhaustive.
- **Zustand stores**: `gameStore.ts` (game state, multiplayer), `i18n/index.ts` (locale with localStorage persistence).

### Engine public API (from `packages/engine/src/index.ts`)

All public types and functions are re-exported from `@war-of-gods/engine`. Never import from internal engine paths in client/server code.

Current public exports:
- **Types**: `TerrainType`, `RaceId`, `Race`, `WorldCard`, `EraCard`, `RelicCard`, `Player`, `GameState`, `GameConfig`, `GameMode`, `GameAction`, `ScoreBreakdown`, `Bot`
- **Constants/utils**: `getRoadBonus`
- **Races**: `getAllRaces`, `getRaceById`
- **State**: `createGame`, `createRng`
- **Era I**: `era1Reducer`, `calculateScoreBreakdown`
- **Bots**: `EasyBot`
- **Names**: `generateFullName`

## Commands

```bash
pnpm install          # Install all deps
pnpm dev              # Client (5173) + server (3001) concurrently
pnpm test             # Vitest — all packages
pnpm build            # Production build
./run.sh start        # Start server in background
./run.sh stop         # Stop server
```

## Environment Variables

- `VITE_SERVER_URL` — Client: server URL (default: `http://localhost:3001`)
- `CORS_ORIGINS` — Server: comma-separated allowed origins (default: `http://localhost:5173,http://localhost:3000`)

## Testing

- Test files in `packages/engine/src/__tests__/` (currently stubbed — need re-enabling)
- Run: `pnpm test` or `npx vitest run`
- Scoring tests are exhaustive — when changing scoring formula, **every test case needs recalculating**
- The consistency check in `scoring-exhaustive.test.ts` validates `total === sum of all components`

## i18n

- Default locale: **English** (`en`), persisted to `localStorage` key `wog-locale`
- Translations: `packages/client/src/i18n/es.ts` (Spanish, canonical type), `en.ts`
- Card data: JSON files have `name`/`name_en`, `flavorText`/`flavorText_en`, `mechanicalText`/`mechanicalText_en`
- Name generator: `generateFullName(raceId, seed, locale)` — locale determines title language
- **Always add both ES and EN** when adding new i18n keys or card text

## Card System

- Data: `packages/engine/src/cards/data/*.json` (15 world cards, 30 era cards, 12 relics)
- Loader: `packages/engine/src/cards/loader.ts` validates at module load
- Effects: `packages/engine/src/cards/effect-dispatcher.ts` — 16 implemented, 9 stubs throwing `NotImplementedError`
- Implemented effects: `modify_draw_count`, `modify_trade_limit`, `skip_trade_phase`, `bonus_per_terrain`, `flat_bonus`, `free_tech_level`, `swap_relic`, `grant_relic_to_all`, `draw_two_era_cards_keep_one`, `bonus_per_favorable`, `bonus_per_road`, `bonus_for_all_terrains`, `all_players_bonus`, `double_if_positive`, `modify_road_requirement`, `waive_road_requirement`
- Stub effects: `discard_and_redraw`, `free_unit`, `scry_pile`, `manual_pick`, `extra_relic`, `preview_next_era_deck`, `view_opponents_tiles`, `double_favorable_tiles`, `return_tiles_to_pile`
- When adding new effects: update `CardEffect` union in `cards/types.ts`, implement in dispatcher, update exhaustive switch

## Scoring (Era I)

Formula: `base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + cardEffects`

- **base**: tiles × race terrain values
- **terrainBonus**: favorable tiles - unfavorable tiles
- **roadBonus**: lookup table (0 roads = -9, 7+ = +6); respects `waive_road_requirement` / `modify_road_requirement` effects
- **diversityBonus**: 4 types → +5, 3 → +2
- **concentrationPenalty**: each tile beyond 8 of one type → -1
- **balanceBonus**: all 4 terrains ≥2 tiles → +3
- **cardEffects**: accumulated from card effects (`player.cardBonusPoints`)

## Races (8 total)

All have total construction value = 5. IDs: `elf`, `dwarf`, `human`, `halfelf`, `orc`, `giant`, `goblin`, `halforc`.

Race names in `packages/engine/src/races/index.ts` are in Spanish (e.g., 'Rey Elfo'). The i18n system provides localized display names via `t.races[raceId]`.

## Multiplayer

- Socket.io events: `create_room`, `join_room` (accepts `{code, name, raceId}`), `player_action`, `disconnect`
- Room management: `packages/server/src/rooms/roomManager.ts` — includes validation, rate limiting, room TTL (2h), stale room cleanup
- Socket handler: `packages/server/src/sockets/gameSocket.ts` — rate limiting, authorization checks, impersonation prevention
- Players are added dynamically on join (not pre-assigned slots)
- Max 6 players per room, duplicate race check on join

## Tile System

- 150 tiles (30 each: plain, mountain, forest, swamp, road)
- Each player draws 18 (TILES_PER_PLAYER) + any `drawCountModifier` from card effects
- **Guaranteed minimum**: 2 favorable terrain tiles per player (swapped from pile if draw is short)
- Solo trade: discard 1 tile, draw 1 from pile (ensures at least 1 trade action available)
- Trade limit enforced per-player via `tradeLimit` (default 1), counter-based

## Mobile Support

All screens are responsive (mobile-first breakpoints). Key patterns:
- `RaceSelectionScreen`: carousel replaced by horizontal scroll on mobile (via `useMediaQuery` hook at `src/hooks/useMediaQuery.ts`)
- `Era1Screen`: sidebar collapses off-canvas on mobile with FAB toggle button
- `AdminLayout`: sidebar hidden on mobile with hamburger menu + overlay
- Minimum tap target size: 44×44px on all interactive elements
- Hover-only interactions have touch fallbacks (always-visible on mobile, hover-only on `sm:`)

## Style

- Theme colors: `game-bg` (#0a0a1a), `game-gold` (#f5c518), `game-accent` (#e94560), `game-ember` (#ff6b35)
- Animations: `animate-fade-in-up`, `animate-scale-in`, `animate-title-glow`, `animate-border-glow`, `animate-shimmer`
- Components use race.color for dynamic styling
- `prefers-reduced-motion` media query disables all animations
- Light/dark theme via CSS variables and `[data-theme="light"]`
