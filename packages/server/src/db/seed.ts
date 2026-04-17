import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seed the cards table from the engine's JSON card data.
 * Runs once; tracked by the migrations table.
 */
export function seedCards(db: Database.Database): void {
  const MIGRATION_KEY = 'seed_cards_v1';

  // Check if migration already ran
  const existing = db.prepare('SELECT key FROM migrations WHERE key = ?').get(MIGRATION_KEY);
  if (existing) return;

  // Find the engine card data directory
  const engineDataDir = path.resolve(__dirname, '..', '..', '..', 'engine', 'src', 'cards', 'data');
  if (!fs.existsSync(engineDataDir)) {
    console.warn(`Card data directory not found at ${engineDataDir}, skipping seed`);
    return;
  }

  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO cards (id, card_type, name, name_en, flavor_text, flavor_text_en, mechanical_text, mechanical_text_en, effects, sort_order, active)
    VALUES (@id, @card_type, @name, @name_en, @flavor_text, @flavor_text_en, @mechanical_text, @mechanical_text_en, @effects, @sort_order, 1)
  `);

  const seedFile = (filename: string, cardType: string) => {
    const filePath = path.join(engineDataDir, filename);
    if (!fs.existsSync(filePath)) return 0;

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<Record<string, unknown>>;
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
    total += seedFile('era1-cards.json', 'era1');
    total += seedFile('relics.json', 'relic');

    // Record the migration
    db.prepare('INSERT INTO migrations (key, value) VALUES (?, ?)').run(MIGRATION_KEY, `Seeded ${total} cards`);

    console.log(`Seeded ${total} cards into the database`);
  });

  transaction();
}
