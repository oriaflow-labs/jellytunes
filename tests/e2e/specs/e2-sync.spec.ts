import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumAlphaTree: string[] };

test('E2: syncing an album writes the expected tree to the destination', async ({
  page,
  app,
  destDir,
  serverConfig,
}) => {
  await login(page, serverConfig);
  await addDestination(page, app, destDir);

  // selectAlbum will switch to library section; we need to switch back to device
  await selectAlbum(page, 'Album Alpha');

  // Click on the device again to return to device sync panel with selections
  await page.locator(`[data-testid="device-item"][data-device-path="${destDir}"]`).click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });

  // Click sync button to open preview
  await page.getByTestId('sync-button').click();

  // Wait for the preview modal to appear
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 20_000 });

  // The preview renders an em dash while track counts are still estimated,
  // so asserting the exact string also waits out the estimate.
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual(library.albumAlphaTree);
});
