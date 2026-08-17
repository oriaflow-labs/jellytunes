import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

/**
 * Playwright cannot drive native OS dialogs, so we replace the main-process
 * handler instead. This lives in the test process — src/ stays untouched.
 */
export async function stubFolderPicker(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(async ({ dialog }, chosen) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, folder);
}

export async function addDestination(
  page: Page,
  app: ElectronApplication,
  folder: string,
): Promise<void> {
  await stubFolderPicker(app, folder);
  await page.getByTestId('add-folder-button').click();
  const entry = page.locator(`[data-testid="device-item"][data-device-path="${folder}"]`);
  await entry.waitFor({ state: 'visible', timeout: 15_000 });
  await entry.click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function selectAlbum(page: Page, name: string): Promise<void> {
  await page.getByTestId('tab-albums').click();
  const item = page.getByTestId('library-item').filter({ hasText: name });
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
}

/** Recursive file listing, relative to root, sorted. Directories are not listed. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}
