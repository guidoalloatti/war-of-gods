import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveEngineDataDir(): string | null {
  // Try both the src layout (tsx dev) and the dist layout (prod build).
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'engine', 'src', 'cards', 'data'),
    path.resolve(__dirname, '..', '..', '..', '..', 'engine', 'src', 'cards', 'data'),
    path.resolve(process.cwd(), 'packages', 'engine', 'src', 'cards', 'data'),
    path.resolve(process.cwd(), '..', 'engine', 'src', 'cards', 'data'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Seed the cards table from the engine's JSON card data.
 * Idempotent: re-inserts are safe (INSERT OR IGNORE). Migration key bumps when
 * the card set expands so existing DBs pick up new card types.
 */
export function seedCards(db: Database.Database): void {
  const MIGRATION_KEY = 'seed_cards_v3';

  const existing = db.prepare('SELECT key FROM migrations WHERE key = ?').get(MIGRATION_KEY);
  if (existing) return;

  const engineDataDir = resolveEngineDataDir();
  if (!engineDataDir) {
    console.warn('Card data directory not found, skipping seed');
    return;
  }

  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO cards (id, card_type, name, name_en, flavor_text, flavor_text_en, mechanical_text, mechanical_text_en, effects, sort_order, active)
    VALUES (@id, @card_type, @name, @name_en, @flavor_text, @flavor_text_en, @mechanical_text, @mechanical_text_en, @effects, @sort_order, 1)
  `);

  const seedFile = (filename: string, cardType: string): number => {
    const filePath = path.join(engineDataDir, filename);
    if (!fs.existsSync(filePath)) return 0;

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { cards?: Array<Record<string, unknown>>; relics?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const raw = Array.isArray(parsed) ? parsed : (parsed.cards ?? parsed.relics ?? []);
    let count = 0;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      insertCard.run({
        id: c.id as string,
        card_type: cardType,
        name: (c.name as string) ?? '',
        name_en: (c.name_en as string) ?? '',
        flavor_text: (c.flavorText as string) ?? '',
        flavor_text_en: (c.flavorText_en as string) ?? '',
        mechanical_text: (c.mechanicalText as string) ?? '',
        mechanical_text_en: (c.mechanicalText_en as string) ?? '',
        effects: JSON.stringify(c.effects ?? []),
        sort_order: i,
      });
      count++;
    }
    return count;
  };

  const transaction = db.transaction(() => {
    let total = 0;
    total += seedFile('world-cards-era1.json', 'world_era1');
    total += seedFile('world-cards-era2.json', 'world_era2');
    total += seedFile('world-cards-era3.json', 'world_era3');
    total += seedFile('era1-cards.json', 'era1');
    total += seedFile('era2-cards.json', 'era2');
    total += seedFile('era3-cards.json', 'era3');
    total += seedFile('relics.json', 'relic');

    if (total === 0) {
      // Don't record migration if nothing was seeded — try again next boot.
      throw new Error('no cards seeded');
    }

    db.prepare('INSERT INTO migrations (key, value) VALUES (?, ?)').run(MIGRATION_KEY, `Seeded ${total} cards`);
    console.log(`Seeded ${total} cards into the database`);
  });

  try {
    transaction();
  } catch (err) {
    if (err instanceof Error && err.message === 'no cards seeded') {
      console.warn('Seed ran but found no card files in', engineDataDir);
      return;
    }
    throw err;
  }
}
