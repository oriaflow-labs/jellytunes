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
  projects: [
    {
      name: 'jellyfin-v11',
      use: { baseURL: 'http://127.0.0.1:8096' },
      webServer: {
        command: 'docker compose -f docker-compose.v11.yml up --wait',
        url: 'http://127.0.0.1:8096/System/Info/Public',
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          JELLYFIN_VERSION: 'v11',
          JELLYFIN_URL: 'http://127.0.0.1:8096',
          JELLYFIN_EXPECTED_MAJOR: '10',
        },
      },
    },
    {
      name: 'jellyfin-v12',
      use: { baseURL: 'http://127.0.0.1:8097' },
      webServer: {
        command: 'docker compose -f docker-compose.v12.yml up --wait',
        url: 'http://127.0.0.1:8097/System/Info/Public',
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          JELLYFIN_VERSION: 'v12',
          JELLYFIN_URL: 'http://127.0.0.1:8097',
          JELLYFIN_EXPECTED_MAJOR: '12',
        },
      },
    },
  ],
});
