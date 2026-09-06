import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, confirmSyncFromPreview, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumAlphaTree: string[] };

test('E7: deselecting a synced album removes its files from the destination', async ({
  page,
  app,
  destDir,
  serverConfig,
}) => {
  await login(page, serverConfig);
  await addDestination(page, app, destDir);
  await selectAlbum(page, 'Album Alpha');

  await confirmSyncFromPreview(page, destDir, { newTracks: '3 tracks' });
  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual(library.albumAlphaTree);

  // The post-sync success modal sits over the sidebar with z-50; press Escape
  // (SyncSuccessModal.tsx:42-48) so the next selectAlbum can reach the tab.
  // Clicking the same item again deselects it. It remains a sync item with
  // state 'remove' (DeviceSyncPanel.tsx:228), so the sync button stays enabled
  // and the preview takes the delete-only branch (useSync.ts:341).
  await page.keyboard.press('Escape');
  await selectAlbum(page, 'Album Alpha');

  await confirmSyncFromPreview(page, destDir, { willRemove: '3 tracks' });

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual([]);
});
