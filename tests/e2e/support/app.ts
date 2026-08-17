import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readServerConfig } from './server';

interface AppFixtures {
  userDataDir: string;
  destDir: string;
  app: ElectronApplication;
  page: Page;
}

export const test = base.extend<AppFixtures>({
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

export async function login(page: Page): Promise<void> {
  const { url, apiKey } = readServerConfig();
  await page.getByTestId('auth-screen').waitFor({ state: 'visible', timeout: 30_000 });

  // Fill inputs with explicit waits
  const urlInput = page.getByTestId('server-url-input');
  const apiKeyInput = page.getByTestId('api-key-input');

  await urlInput.waitFor({ state: 'visible', timeout: 5000 });
  await urlInput.fill(url);

  await apiKeyInput.waitFor({ state: 'visible', timeout: 5000 });
  await apiKeyInput.fill(apiKey);

  // Click the connect button
  const connectButton = page.getByTestId('connect-button');
  await connectButton.waitFor({ state: 'visible', timeout: 5000 });
  await connectButton.click();

  // Wait for either user selector or library content
  const userSelectorAppeared = await page
    .getByTestId('user-selector-screen')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (userSelectorAppeared) {
    const userOption = page.getByTestId('user-option').first();
    await userOption.waitFor({ state: 'visible', timeout: 5000 });
    await userOption.click();
  }

  // Wait for the library to load
  await page.getByTestId('library-content').waitFor({ state: 'visible', timeout: 30_000 });
}
