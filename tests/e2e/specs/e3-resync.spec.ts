import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, dismissSyncSuccessModal, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumAlphaTree: string[] };

test('E3: re-syncing the same selection copies nothing and leaves files untouched', async ({
  page,
  app,
  destDir,
  serverConfig,
}) => {
  await login(page, serverConfig);
  await addDestination(page, app, destDir);
  await selectAlbum(page, 'Album Alpha');

  // Click on the device again to return to device sync panel with selections
  await page.locator(`[data-testid="device-item"][data-device-path="${destDir}"]`).click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });

  // First sync
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 20_000 });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  // Wait for sync completion - verify expected files are present
  await expect
    .poll(
      () =>
        listTree(destDir)
          .filter((f) => !f.startsWith('.'))
          .sort(),
      { timeout: 120_000 },
    )
    .toEqual(library.albumAlphaTree);

  // Record mtimes from first sync (only real files, not temp files)
  const before = listTree(destDir)
    .filter((f) => !f.startsWith('.'))
    .map((rel) => ({
      rel,
      mtimeMs: statSync(join(destDir, rel)).mtimeMs,
    }));

  await dismissSyncSuccessModal(page);

  // Ensure sync-panel is ready before attempting second sync
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });

  // Second sync, identical selection
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 20_000 });

  // Verify correct preview state for a no-op sync
  await expect(page.getByTestId('preview-already-synced-section')).toContainText('3 tracks');
  await expect(page.getByTestId('preview-new-tracks-section')).toBeHidden();

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await dismissSyncSuccessModal(page);

  // Verify all original files still exist with unchanged mtimes
  // (Files were not rewritten, proving re-sync was a no-op)
  for (const file of before) {
    const currentStat = statSync(join(destDir, file.rel));
    expect(currentStat.mtimeMs, `${file.rel} was rewritten`).toBe(file.mtimeMs);
  }
});
