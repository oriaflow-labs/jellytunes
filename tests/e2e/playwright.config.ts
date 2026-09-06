import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Scenarios share one Jellyfin and one Docker port; serial keeps them honest.
  // This holds per-project. Projects themselves run in parallel by default.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './support/global-setup.ts',
  globalSetupTimeout: 120_000,
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  outputDir: './.artifacts',
  // `webServer` is a top-level option — Playwright ignores it inside a project
  // entry. Both Jellyfin containers are started for every invocation (a
  // single-project run just leaves the other one idle); with distinct compose
  // project names (docker-compose.v{11,12}.yml `name:`) they coexist on 8096 /
  // 8097. `reuseExistingServer` makes an already-running container a no-op.
  webServer: [
    {
      command: 'docker compose -f docker-compose.v11.yml up --wait',
      url: 'http://127.0.0.1:8096/System/Info/Public',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'docker compose -f docker-compose.v12.yml up --wait',
      url: 'http://127.0.0.1:8097/System/Info/Public',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'jellyfin-v11',
      use: {
        baseURL: 'http://127.0.0.1:8096',
        jellyfinVersion: 'v11',
        jellyfinExpectedMajor: 10,
      },
    },
    {
      name: 'jellyfin-v12',
      use: {
        baseURL: 'http://127.0.0.1:8097',
        jellyfinVersion: 'v12',
        jellyfinExpectedMajor: 12,
      },
    },
  ],
});
