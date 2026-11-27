import { closeDb, getDb } from './client';

await getDb();
console.log('[db] Migrations applied.');
await closeDb();
process.exit(0);
