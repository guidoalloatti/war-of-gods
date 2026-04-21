# War of Gods

Epic digital board game for 1–6 players. Forge your kingdom across three eras, forge or betray alliances, and lead the united races of Vali in a final war against Dhakhan, the divine tyrant.

## Three Eras, One War

| Era | Name | Core Loop |
|---|---|---|
| **I** | Reshape the World | Draw terrain tiles, trade with rivals, build your kingdom. Score diversity, roads, and racial affinities. |
| **II** | Forge Alliances | Spend Construction Points to raise tech (War / Science / Resources / Economy). Trade points at the King's Table. Recruit founding units. |
| **III** | The Final War | Command stacks on a hex map, fight the Wrought of Dhakhan, capture the citadel, kill the boss — or fall in the Final Heroic Turn. |

All three eras are fully playable end-to-end, locally or online.

## Features

- **8 playable races** — Elf, Dwarf, Human, Half-Elf, Orc, Giant, Goblin, Half-Orc. Each has unique terrain values and a free racial tech.
- **3 game modes** — Solo, Solo vs Bots (1–5 AI opponents), Online Multiplayer (up to 6 players via room codes).
- **Full card system** — 15 World Cards, 30 Era Cards, 12 Relics, plus Era III tactical cards. Effects resolve through an exhaustive dispatcher.
- **Hex-based Era III map** — Procedurally generated disc-of-10 hex map with citadel, capital rings, spawn zones, road paths, and 7 terrain types.
- **Dhakhan AI** — Wrought enemy stacks spawn each cycle, path-find toward player capitals, and engage in deterministic combat. A six-unit boss stack defends the citadel.
- **Final Heroic Turn** — When a player stack reaches the citadel with the boss alive, each surviving player takes one final turn. Win by killing the boss; lose if he survives.
- **Bilingual** — Full English + Spanish (UI, cards, race names, unit types).
- **Real-time multiplayer** — Socket.io rooms with rate limiting, reconnection, and authorization. Up to 6 players per room.
- **Mobile-first UI** — Responsive layouts, 44px tap targets, safe-area-aware, touch-friendly hex interactions.
- **Save / Resume** — Autosave to localStorage (guest) or account (logged-in). Full state roundtrip across all eras.
- **Light & Dark themes** — CSS-variable-driven, respects `prefers-reduced-motion`.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand (game store + i18n store) |
| Backend | Node.js + Express + Socket.io |
| Persistence | better-sqlite3 (accounts + saves) |
| Testing | Vitest (393 tests across engine) |
| Monorepo | pnpm workspaces |

## Project Structure

```
packages/
├── engine/   # Pure game logic. Zero UI/network deps. Runs in Node or browser.
│   └── src/
│       ├── era1/          # Draw, trade, placement, scoring
│       ├── era2/          # Tech allocation, King's Table, racial bonuses
│       ├── era3/          # Map gen, hex math, combat, Dhakhan AI, cards
│       ├── cards/         # Card data (JSON) + effect dispatcher
│       ├── bots/          # EasyBot covers all three eras
│       └── __tests__/     # 25 suites, 393 tests
├── client/   # React 18 + Vite + Tailwind (mobile-first)
└── server/   # Express + Socket.io + SQLite
```

## Getting Started

```bash
# Requirements: Node.js >= 18, pnpm >= 8
pnpm install

# Development (client + server concurrently)
pnpm dev

# Client only → http://localhost:5173
pnpm --filter @war-of-gods/client dev

# Server only → http://localhost:3001
pnpm --filter @war-of-gods/server dev

# Run tests (393 tests)
pnpm test

# Production build
pnpm build
```

### Server Management

```bash
./run.sh start    # Start server in background
./run.sh stop     # Stop server
./run.sh status   # Check status
```

## Environment Variables

| Variable | Package | Default | Description |
|---|---|---|---|
| `VITE_SERVER_URL` | client | `http://localhost:3001` | Backend URL |
| `CORS_ORIGINS` | server | `http://localhost:5173,http://localhost:3000` | Allowed origins |

## Game Modes

| Mode | Description |
|---|---|
| **Solo** | 1 player. Solo-trade fallback (discard & redraw) guarantees at least 1 trade action. |
| **Solo with Bots** | 1 human + 1–5 bots. EasyBot plays all three eras with heuristic strategy. |
| **Multiplayer** | Up to 6 human players via room codes. Real-time sync over Socket.io. |

## Era I — Scoring Formula

```
total = base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + cardEffects
```

| Component | Description |
|---|---|
| Base points | Tiles × racial terrain value |
| Terrain bonus | Favorable count − unfavorable count |
| Road bonus | -9 (0 roads) to +6 (7+ roads) |
| Diversity bonus | +5 for 4 terrain types, +2 for 3 |
| Concentration penalty | -1 per tile beyond 8 of any one type |
| Balance bonus | +3 if all 4 terrains have ≥2 tiles |
| Card effects | Accumulated from world cards, era cards, relics |

## Era II — Kingdom Construction

Phases: `world_card_reveal → era_cards_deal → apply_penalties → apply_era1_effects → kings_table → tech_allocation → review → convert_surplus → complete`.

- Carry Era I score forward as Construction Points.
- Raise tech levels (War / Science / Resources / Economy) 0–5, or 0–6 with `allow_level_6` effects.
- Racial bonuses grant one free tech level.
- King's Table lets players transfer construction points to allies.
- Surplus points convert to gold coins for Era III.
- Free units accumulate based on tech × racial bonuses (used as Era III starting army).

## Era III — The Final War

- **Map**: disc of radius 10 (~331 hexes), 7 terrain types, 1 citadel, player capitals on a radius-8 ring, Wrought spawn zones at radius 4.
- **Stacks**: up to 6 units per stack. 5 unit types (infantry, ranged, mounted, siege, flying) with distinct HP / attack / defense.
- **Turn flow**: play one card → recruit → move/attack → end turn. One card per turn, one recruit per turn (capital only).
- **Cycle end**: gold income → Wrought spawn → Dhakhan AI turn.
- **Heroic trigger**: player stack within distance 1 of citadel while boss alive → enter `final_heroic_turn` on next cycle.
- **Victory**: boss stack wiped. **Defeat**: all capitals fallen, or heroic turn ends with boss alive.

## Races

| Race | Favorable | Plain / Mountain / Forest / Swamp | Free Tech |
|---|---|---|---|
| Elf | Forest | 1 / 0 / 3 / 1 | Science |
| Dwarf | Mountain | 0 / 4 / 0 / 1 | Resources |
| Human | Plain | 3 / 0 / 1 / 1 | Economy |
| Half-Elf | Plain | 2 / 1 / 2 / 0 | Science |
| Orc | Swamp | 1 / 0 / 1 / 3 | War |
| Giant | Mountain | 0 / 3 / 1 / 1 | War |
| Goblin | Forest | 1 / 1 / 2 / 1 | Economy |
| Half-Orc | Swamp | 2 / 1 / 0 / 2 | Resources |

All races have total terrain value = 5. Racial free tech grants level 1 of the listed tech at Era II start.

## Card Effects

**Implemented (16):** `modify_draw_count`, `modify_trade_limit`, `skip_trade_phase`, `bonus_per_terrain`, `flat_bonus`, `free_tech_level`, `swap_relic`, `grant_relic_to_all`, `draw_two_era_cards_keep_one`, `bonus_per_favorable`, `bonus_per_road`, `bonus_for_all_terrains`, `all_players_bonus`, `double_if_positive`, `modify_road_requirement`, `waive_road_requirement`

**Planned stubs (9):** `discard_and_redraw`, `free_unit`, `scry_pile`, `manual_pick`, `extra_relic`, `preview_next_era_deck`, `view_opponents_tiles`, `double_favorable_tiles`, `return_tiles_to_pile`

## Testing

```bash
pnpm test                 # all packages (393 tests)
pnpm --filter @war-of-gods/engine test --watch   # watch mode
```

Coverage spans: hex math, map generation, path-finding, combat, Dhakhan AI, card effects, Era II costs, Era II King's Table, transitions (Era I → II, II → III), endgame conditions, and exhaustive scoring consistency.

## License

Private — all rights reserved.
