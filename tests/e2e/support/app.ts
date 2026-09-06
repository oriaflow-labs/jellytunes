import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readServerConfig, type ServerConfig } from './server';

interface AppFixtures {
  userDataDir: string;
  destDir: string;
  serverConfig: ServerConfig;
  app: ElectronApplication;
  page: Page;
}

export const test = base.extend<
  AppFixtures & {
    jellyfinVersion: 'v11' | 'v12';
    jellyfinExpectedMajor: number;
  }
>({
  // Identifies which .server.<version>.json the fixtures should resolve.
  // Each project in playwright.config.ts overrides this via `use.jellyfinVersion`.
  jellyfinVersion: ['v11', { option: true }],
  jellyfinExpectedMajor: [10, { option: true }],

  // Electron honours Chromium's --user-data-dir, which relocates
  // app.getPath('userData') and with it jellytunes.db, session.enc and
  // preferences.json. One temp dir per scenario means zero shared state.
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'jt-e2e-userdata-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  // eslint-disable-next-line no-empty-pattern
  destDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'jt-e2e-dest-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  // Reads the per-version server config so each project's spec uses the
  // right URL + API key without falling back to the legacy .server.json.
  serverConfig: async ({ jellyfinVersion }, use) => {
    await use(readServerConfig(jellyfinVersion));
  },

  app: async ({ userDataDir }, use) => {
    const app = await electron.launch({
      args: [
        join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js'),
        `--user-data-dir=${userDataDir}`,
      ],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    await use(app);
    await app.close();
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';

export async function login(page: Page, serverConfig: ServerConfig): Promise<void> {
  const { url, apiKey } = serverConfig;
  await page.getByTestId('auth-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('server-url-input').fill(url);
  await page.getByTestId('api-key-input').fill(apiKey);
  await page.getByTestId('connect-button').click();

  const userSelectorAppeared = await page
    .getByTestId('user-selector-screen')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (userSelectorAppeared) {
    await page.getByTestId('user-option').first().click();
  }

  await page.getByTestId('library-content').waitFor({ state: 'visible', timeout: 30_000 });
}
