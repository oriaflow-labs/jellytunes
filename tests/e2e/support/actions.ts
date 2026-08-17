import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type ElectronApplication, type Page } from '@playwright/test';

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

export type LibraryTabName = 'artists' | 'albumArtists' | 'albums' | 'playlists' | 'genres';

export async function selectLibraryItem(
  page: Page,
  tab: LibraryTabName,
  name: string,
): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
  const item = page.getByTestId('library-item').filter({ hasText: name });
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
}

export async function selectAlbum(page: Page, name: string): Promise<void> {
  await selectLibraryItem(page, 'albums', name);
}

export interface PreviewExpectation {
  /** Expected text in the new-tracks section, e.g. '3 tracks'. Omit to assert the section is hidden. */
  newTracks?: string;
  alreadySynced?: string;
  willRemove?: string;
}

/**
 * Opens the sync preview, asserts each section either matches or is absent,
 * then confirms and waits for the modal to close.
 *
 * Selecting a library item navigates away from the device sync panel, so the
 * device has to be clicked back into focus before `sync-button` exists. E2, E3
 * and E4 all do this inline; the helper folds it in.
 *
 * Asserting the exact track-count string matters: the modal renders an em dash
 * while counts are still estimated, so the assertion doubles as the wait.
 */
export async function confirmSyncFromPreview(
  page: Page,
  devicePath: string,
  expected: PreviewExpectation,
): Promise<void> {
  await page.locator(`[data-testid="device-item"][data-device-path="${devicePath}"]`).click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });

  const sections: ReadonlyArray<readonly [string, string | undefined]> = [
    ['preview-new-tracks-section', expected.newTracks],
    ['preview-already-synced-section', expected.alreadySynced],
    ['preview-will-remove-section', expected.willRemove],
  ];

  for (const [testId, text] of sections) {
    const section = page.getByTestId(testId);
    if (text === undefined) await expect(section).toBeHidden();
    else await expect(section).toContainText(text);
  }

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden({ timeout: 30_000 });
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
