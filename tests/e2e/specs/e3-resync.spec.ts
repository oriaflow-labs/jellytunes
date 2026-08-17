import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumAlphaTree: string[] };

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

  // Close sync-complete modal if it appeared
  const closeButton = page.getByRole('button', { name: /^Close$/i }).first();
  if (await closeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await closeButton.click();
    // Wait for the modal backdrop to disappear
    await page
      .locator('div.fixed.inset-0')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
  }

  // Second sync, identical selection
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible', timeout: 20_000 });

  // Verify correct preview state for a no-op sync
  await expect(page.getByTestId('preview-already-synced-section')).toContainText('3 tracks');
  await expect(page.getByTestId('preview-new-tracks-section')).toBeHidden();

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  // Close the sync-complete modal that appears after the second sync if it appeared
  const closeButton2 = page.getByRole('button', { name: /^Close$/i }).first();
  if (await closeButton2.isVisible({ timeout: 5000 }).catch(() => false)) {
    await closeButton2.click();
    // Wait for the modal backdrop to disappear
    await page
      .locator('div.fixed.inset-0')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
  }

  // Verify all original files still exist with unchanged mtimes
  // (Files were not rewritten, proving re-sync was a no-op)
  for (const file of before) {
    const currentStat = statSync(join(destDir, file.rel));
    expect(currentStat.mtimeMs, `${file.rel} was rewritten`).toBe(file.mtimeMs);
  }
});
