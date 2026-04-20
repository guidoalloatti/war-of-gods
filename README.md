# War of Gods

Cooperative digital board game for 1-6 players. Build your kingdom, trade resources, and unite the races of Vali to defeat Dhakhan, the divine tyrant.

## Features

- **8 playable races** — Elf, Dwarf, Human, Half-Elf, Orc, Giant, Goblin, Half-Orc, each with unique terrain values
- **3 game modes** — Solo, Solo with AI bots, Online multiplayer (up to 6 players)
- **Card system** — 15 World Cards, 30 Era Cards, 12 Relics of the Fallen with animated reveals
- **Balanced scoring** — Diversity bonus, concentration penalty, balance bonus, and guaranteed favorable terrain
- **Bilingual** — Full English and Spanish support (cards, UI, race names, titles)
- **Real-time multiplayer** — Socket.io rooms with room codes, dynamic player joining with race/name selection
- **Mobile-ready** — Fully responsive UI with touch-friendly controls on all screens

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand |
| Backend | Node.js + Express + Socket.io |
| Testing | Vitest |
| Monorepo | pnpm workspaces |

## Project Structure

```
packages/
├── engine/   # Pure game logic (no UI/network dependencies)
├── client/   # React frontend (mobile-responsive)
└── server/   # Multiplayer backend with Socket.io
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

# Run tests
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
|----------|---------|---------|-------------|
| `VITE_SERVER_URL` | client | `http://localhost:3001` | Backend URL |
| `CORS_ORIGINS` | server | `http://localhost:5173,http://localhost:3000` | Allowed origins |

## Game Modes

| Mode | Description |
|------|-------------|
| Solo | 1 player — build your kingdom and score. Solo trade available (discard & redraw). |
| Solo with Bots | 1 human + 1-5 AI bots |
| Multiplayer | Up to 6 human players via Socket.io room codes |

## Scoring System (Era I)

| Component | Description |
|-----------|-------------|
| Base points | Tiles × racial terrain value |
| Terrain bonus | Favorable terrain count − unfavorable count |
| Road bonus | -9 (0 roads) to +6 (7+ roads) |
| Diversity bonus | +5 for 4 terrain types, +2 for 3 |
| Concentration penalty | -1 per tile beyond 8 of one type |
| Balance bonus | +3 if all 4 terrains have ≥2 tiles |
| Card effects | Bonus from era cards, world cards, relics |

## Races

| Race | Favorable | Plain / Mountain / Forest / Swamp |
|------|-----------|-----------------------------------|
| Elf | Forest | 1 / 0 / 3 / 1 |
| Dwarf | Mountain | 0 / 4 / 0 / 1 |
| Human | Plain | 3 / 0 / 1 / 1 |
| Half-Elf | Plain | 2 / 1 / 2 / 0 |
| Orc | Swamp | 1 / 0 / 1 / 3 |
| Giant | Mountain | 0 / 3 / 1 / 1 |
| Goblin | Forest | 1 / 1 / 2 / 1 |
| Half-Orc | Swamp | 2 / 1 / 0 / 2 |

## Card Effects

**Implemented (16):** `modify_draw_count`, `modify_trade_limit`, `skip_trade_phase`, `bonus_per_terrain`, `flat_bonus`, `free_tech_level`, `swap_relic`, `grant_relic_to_all`, `draw_two_era_cards_keep_one`, `bonus_per_favorable`, `bonus_per_road`, `bonus_for_all_terrains`, `all_players_bonus`, `double_if_positive`, `modify_road_requirement`, `waive_road_requirement`

**Planned (9):** `discard_and_redraw`, `free_unit`, `scry_pile`, `manual_pick`, `extra_relic`, `preview_next_era_deck`, `view_opponents_tiles`, `double_favorable_tiles`, `return_tiles_to_pile`

## Roadmap

| Era | Name | Status |
|-----|------|--------|
| I | Reshape the World | In development |
| II | Forge Alliances | Planned |
| III | The Final War | Planned |

## License

Private — all rights reserved.
