import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { assertServerMajor, readServerConfig, type ServerConfig } from './server';

interface AppFixtures {
  userDataDir: string;
  destDir: string;
  serverConfig: ServerConfig;
  app: ElectronApplication;
  page: Page;
}

// Remembers which versions have already been version-checked in this process
// so the preflight costs one HTTP round-trip per version, not one per test.
const verifiedVersions = new Set<string>();

export const test = base.extend<
  AppFixtures & {
    jellyfinVersion: 'v11' | 'v12';
    jellyfinExpectedMajor: number;
    serverVersionGuard: void;
  }
>({
  // Identifies which .server.<version>.json the fixtures should resolve.
  // Each project in playwright.config.ts overrides this via `use.jellyfinVersion`.
  jellyfinVersion: ['v11', { option: true }],
  jellyfinExpectedMajor: [10, { option: true }],

  // Preflight: prove the server answering on this project's URL really is the
  // expected Jellyfin major before any test connects to it. globalSetup does
  // this too, but only for single-project runs — a multi-project run (plain
  // `pnpm test:e2e`) resolves no target and skips it, so without this fixture
  // a misrouted .server.<version>.json would let v12 specs go green against v11.
  serverVersionGuard: [
    async ({ jellyfinVersion, jellyfinExpectedMajor }, use) => {
      if (!verifiedVersions.has(jellyfinVersion)) {
        await assertServerMajor(jellyfinVersion, jellyfinExpectedMajor);
        verifiedVersions.add(jellyfinVersion);
      }
      await use();
    },
    { auto: true },
  ],

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

/**
 * ORAIN-0564 SO-3: which auth flow `login()` drives.
 *
 * - `'apikey'` (default) — E1 regression sentinel and every existing scenario.
 *   Fills the apikey form, then handles the user selector if the server
 *   returns a public user list instead of identifying the user directly.
 * - `'password'` — the new SO-1 username+password flow. Switches the
 *   LoginScreen into password mode, fills the three fields, and goes
 *   straight to the library (the accessToken identifies the user, so no
 *   selector).
 */
export type AuthMode = 'apikey' | 'password';

export async function login(
  page: Page,
  serverConfig: ServerConfig,
  mode: AuthMode = 'apikey',
): Promise<void> {
  const { url, apiKey } = serverConfig;
  await page.getByTestId('auth-screen').waitFor({ state: 'visible', timeout: 30_000 });

  if (mode === 'password') {
    const { username, password } = serverConfig;
    if (!username || !password) {
      throw new Error(
        "login(page, serverConfig, 'password') requires serverConfig.username and " +
          'serverConfig.password. provision.mjs writes both — re-run ' +
          '`bash tests/e2e/docker/rebuild.sh <version>` to regenerate ' +
          '.server.<version>.json.',
      );
    }
    await page.getByTestId('mode-toggle-password').click();
    await page.getByTestId('server-url-input').fill(url);
    await page.getByTestId('username-input').fill(username);
    await page.getByTestId('password-input').fill(password);
    await page.getByTestId('connect-button').click();
    await page.getByTestId('library-content').waitFor({ state: 'visible', timeout: 30_000 });
    return;
  }

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
