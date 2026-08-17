import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import {
  addDestination,
  confirmSyncFromPreview,
  listTree,
  selectLibraryItem,
} from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { playlistName: string; playlistTree: string[] };

test('E6: syncing a playlist writes its tracks and an .m3u8 index', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
  await addDestination(page, app, destDir);
  await selectLibraryItem(page, 'playlists', library.playlistName);

  await confirmSyncFromPreview(page, destDir, { newTracks: '3 tracks' });

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual(library.playlistTree);

  // The app reads its own .m3u8 files back to decide which audio a remaining
  // playlist still protects (getM3u8ReferencedPaths, sync-core.ts:1152), so
  // the entries must resolve to real files, not just be present.
  const m3u8 = readFileSync(join(destDir, `${library.playlistName}.m3u8`), 'utf8');
  const lines = m3u8.split('\n').filter((line) => line.length > 0);
  expect(lines[0]).toBe('#EXTM3U');

  const referenced = lines.filter((line) => !line.startsWith('#')).sort();
  const audioOnDisk = library.playlistTree.filter((file) => !file.endsWith('.m3u8'));
  expect(referenced, 'the .m3u8 does not reference the files that were written').toEqual(
    audioOnDisk,
  );
});
