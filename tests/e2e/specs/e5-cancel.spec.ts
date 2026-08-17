import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

const TEMP_PREFIXES = ['jellytunes_', 'jt-'];

function strayTempFiles(): string[] {
  return readdirSync(tmpdir()).filter((name) => TEMP_PREFIXES.some((p) => name.startsWith(p)));
}

test('E5: cancelling a sync leaves no partial files and no temp orphans', async ({
  page,
  app,
  destDir,
}) => {
  const strayBefore = new Set(strayTempFiles());

  await login(page);
  await addDestination(page, app, destDir);

  // Select Album Gamma (3×600s noise for a reliable cancel window)
  await selectAlbum(page, 'Album Gamma');

  // Return to device sync panel with selections
  await page.locator(`[data-testid="device-item"][data-device-path="${destDir}"]`).click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });

  // MP3 conversion enables cancellation during conversion
  await page.getByTestId('mp3-toggle').click();

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();

  // Wait for cancel button to appear and sync to be in progress, then immediately cancel
  const cancelButton = page.getByTestId('cancel-sync-button');
  await cancelButton.waitFor({ state: 'visible', timeout: 45_000 });
  await cancelButton.click();

  // Guard: if the sync had already finished, this scenario proved nothing.
  // This guard is critical — a false-positive pass when the sync actually completed
  // is worse than a failed test.
  await expect(
    page.getByTestId('cancel-sync-button'),
    'sync completed before it could be cancelled — lengthen the Album Gamma fixtures',
  ).toBeHidden({ timeout: 120_000 });

  const finalTree = listTree(destDir);
  expect(
    finalTree.length,
    `cancelled sync still wrote every track: ${finalTree.join(', ')}`,
  ).toBeLessThan(3);

  for (const rel of finalTree) {
    const size = statSync(join(destDir, rel)).size;
    expect(size, `${rel} is a zero-byte partial`).toBeGreaterThan(0);
  }

  await expect
    .poll(() => strayTempFiles().filter((f) => !strayBefore.has(f)), { timeout: 30_000 })
    .toEqual([]);
});
