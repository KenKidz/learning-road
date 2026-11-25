import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-e2e-'));
const pgDir = path.join(tempDir, 'pg');

process.env.PORT = process.env.E2E_PORT ?? '3123';
process.env.NODE_ENV = 'production';
process.env.DATABASE_DIR = pgDir;
process.env.APP_PASSWORD = '';

function cleanup() {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on Windows file lock release
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

await import('../src/server/index');
