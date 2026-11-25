import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3123',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx tsx e2e/server-runner.ts',
    url: 'http://localhost:3123/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
