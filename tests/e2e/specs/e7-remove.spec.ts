import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import {
  addDestination,
  confirmSyncFromPreview,
  dismissSyncSuccessModal,
  listTree,
  selectAlbum,
} from '../support/actions';

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

  // The post-sync success modal sits over the sidebar with z-50 and paints a
  // beat after the files land, so waiting on `listTree` above is not enough to
  // know it is safe to click again — wait for the modal itself, then dismiss.
  // Clicking the same item again deselects it. It remains a sync item with
  // state 'remove' (DeviceSyncPanel.tsx:228), so the sync button stays enabled
  // and the preview takes the delete-only branch (useSync.ts:341).
  await dismissSyncSuccessModal(page);
  await selectAlbum(page, 'Album Alpha');

  await confirmSyncFromPreview(page, destDir, { willRemove: '3 tracks' });

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual([]);
});
