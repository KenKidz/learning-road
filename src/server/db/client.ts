import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { env } from '../env';

const { Pool } = pg;

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbHandle {
  db: AppDb;
  close: () => Promise<void>;
}

let handlePromise: Promise<DbHandle> | null = null;
let testHandle: DbHandle | null = null;

async function openPgliteClient(dataDir?: string): Promise<DbHandle> {
  if (dataDir) {
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  }
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  try {
    await migratePglite(db, { migrationsFolder: env.migrationsFolder });
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  return {
    db: db as unknown as AppDb,
    close: () => client.close(),
  };
}

async function openPostgresClient(connectionString: string): Promise<DbHandle> {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  // Idle connections can drop when serverless Postgres (e.g. Neon) scales to zero.
  // Handling pool errors prevents an uncaught EventEmitter crash.
  pool.on('error', (error: Error) => {
    console.error('[db] PostgreSQL pool error:', error.message);
  });

  const db = drizzleNodePg(pool, { schema });
  try {
    await migrateNodePg(db, { migrationsFolder: env.migrationsFolder });
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
  return {
    db: db as unknown as AppDb,
    close: () => pool.end(),
  };
}

export function getDb(): Promise<AppDb> {
  if (!handlePromise) {
    const opener = env.useExternalPostgres
      ? openPostgresClient(env.databaseUrl)
      : openPgliteClient(env.databaseDir);
    handlePromise = opener.catch((error: unknown) => {
      handlePromise = null;
      throw error;
    });
  }
  return handlePromise.then((handle) => handle.db);
}

export async function closeDb(): Promise<void> {
  if (!handlePromise) return;
  const current = handlePromise;
  handlePromise = null;
  try {
    const handle = await current;
    await handle.close();
  } catch {
    // Ignore close errors if opening failed
  }
}

export async function createTestDb(): Promise<AppDb> {
  if (testHandle) {
    await testHandle.close();
    testHandle = null;
  }
  testHandle = await openPgliteClient();
  return testHandle.db;
}

export async function closeTestDb(): Promise<void> {
  if (testHandle) {
    await testHandle.close();
    testHandle = null;
  }
}
