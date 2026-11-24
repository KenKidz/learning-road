import { createApp } from './app';
import { getDb } from './db/client';
import { seedDatabase } from './db/seed';
import { env } from './env';

const db = await getDb();
const seedResult = await seedDatabase(db);

const app = createApp(db);
app.listen(env.port, () => {
  console.log(`[server] Listening on http://localhost:${env.port}`);
  console.log(`[db] PGlite data directory: ${env.databaseDir}`);
  console.log(
    seedResult.seeded
      ? '[seed] Roadmap definition inserted (no progress data).'
      : `[seed] Skipped: ${seedResult.reason}`,
  );
  console.log(
    env.authEnabled
      ? '[auth] Password protection is enabled (APP_PASSWORD is set).'
      : '[auth] No APP_PASSWORD set: local-only mode without login. Set APP_PASSWORD before exposing the app.',
  );
});
