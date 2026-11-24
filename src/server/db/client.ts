import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';
import { env } from '../env';

export type AppDb = PgliteDatabase<typeof schema>;

interface DbHandle {
  db: AppDb;
  client: PGlite;
}

let handlePromise: Promise<DbHandle> | null = null;
let testHandle: DbHandle | null = null;

async function openClient(dataDir?: string): Promise<DbHandle> {
  if (dataDir) {
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: env.migrationsFolder });
  return { db, client };
}

export function getDb(): Promise<AppDb> {
  if (!handlePromise) {
    handlePromise = openClient(env.databaseDir).catch((error: unknown) => {
      handlePromise = null;
      throw error;
    });
  }
  return handlePromise.then((handle) => handle.db);
}

export async function createTestDb(): Promise<AppDb> {
  if (testHandle) {
    await testHandle.client.close();
    testHandle = null;
  }
  testHandle = await openClient();
  return testHandle.db;
}

export async function closeTestDb(): Promise<void> {
  if (testHandle) {
    await testHandle.client.close();
    testHandle = null;
  }
}
