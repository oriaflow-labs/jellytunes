import { statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

test('E3: re-syncing the same selection copies nothing and leaves files untouched', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
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

  // Wait for sync completion - the sync-complete modal should appear
  // This indicates the sync operation has finished
  const expectedFiles = [
    'music/Test Artist A/Album Alpha/01 - Alpha One.flac',
    'music/Test Artist A/Album Alpha/02 - Alpha Two.flac',
    'music/Test Artist A/Album Alpha/03 - Alpha Three.flac',
  ];

  await expect
    .poll(
      () =>
        listTree(destDir)
          .filter((f) => !f.startsWith('.'))
          .sort(),
      { timeout: 120_000 },
    )
    .toEqual(expectedFiles);

  // Record mtimes from first sync (only real files, not temp files)
  const before = listTree(destDir)
    .filter((f) => !f.startsWith('.'))
    .map((rel) => ({
      rel,
      mtimeMs: statSync(join(destDir, rel)).mtimeMs,
    }));

  // Close sync-complete modal by clicking the close button
  await page
    .getByRole('button', { name: /^Close$/i })
    .click()
    .catch(() => {});
  // Small wait to ensure modal is dismissed
  await page.waitForTimeout(500);

  // Second sync, identical selection
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 20_000 });

  // Verify correct preview state for a no-op sync
  await expect(page.getByTestId('preview-already-synced-section')).toContainText('3 tracks');
  await expect(page.getByTestId('preview-new-tracks-section')).toBeHidden();

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  // Close the sync-complete modal that appears after the second sync
  await page
    .getByRole('button', { name: /^Close$/i })
    .click()
    .catch(() => {});

  // Verify all original files still exist with unchanged mtimes
  // (Files were not rewritten, proving re-sync was a no-op)
  for (const file of before) {
    const currentStat = statSync(join(destDir, file.rel));
    expect(currentStat.mtimeMs, `${file.rel} was rewritten`).toBe(file.mtimeMs);
  }
});
