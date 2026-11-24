import { getDb } from './client';

await getDb();
console.log('[db] Migrations applied.');
process.exit(0);
