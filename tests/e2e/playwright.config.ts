import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Scenarios share one Jellyfin and one Docker port; serial keeps them honest.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './support/global-setup.ts',
  globalSetupTimeout: 120_000, // Allow 2 minutes for server startup checks
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  outputDir: './.artifacts',
});
