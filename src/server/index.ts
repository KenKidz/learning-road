import { createApp } from './app';
import { closeDb, getDb } from './db/client';
import { seedDatabase } from './db/seed';
import { env } from './env';

const db = await getDb();
const seedResult = await seedDatabase(db);

const app = createApp(db);
const server = app.listen(env.port, () => {
  console.log(`[server] Listening on http://localhost:${env.port}`);
  console.log(
    env.useExternalPostgres
      ? '[db] Connected to PostgreSQL via DATABASE_URL.'
      : `[db] PGlite data directory: ${env.databaseDir}`,
  );
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

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] Received ${signal}, shutting down...`);
  server.close(() => {
    void closeDb().finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
