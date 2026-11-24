import { getDb } from './client';
import { seedDatabase } from './seed';

const db = await getDb();
const result = await seedDatabase(db);
if (result.seeded) {
  console.log('[seed] Roadmap seed data inserted.');
} else {
  console.log(`[seed] Skipped: ${result.reason}`);
}
process.exit(0);
