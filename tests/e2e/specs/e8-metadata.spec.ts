import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, confirmSyncFromPreview, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumGammaTree: string[]; albumDeltaTree: string[] };

test('E8a: an album whose tracks carry no ALBUM tag syncs to its server folder', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
  await addDestination(page, app, destDir);

  // Album Gamma's files have no ALBUM tag; Jellyfin resolves the album through
  // AlbumId -> MusicAlbum, and the destination folder comes from the server
  // file path rather than from any tag.
  await selectAlbum(page, 'Album Gamma');

  await confirmSyncFromPreview(page, destDir, { newTracks: '3 tracks' });

  // ~48 MB of FLAC over localhost, so a wider budget than the 2-second fixtures.
  await expect.poll(() => listTree(destDir), { timeout: 180_000 }).toEqual(library.albumGammaTree);
});

test('E8b: a compilation syncs under its album artist, not its track artists', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
  await addDestination(page, app, destDir);

  // Album Delta credits Test Artist A and Test Artist C on its tracks but
  // Various Artists as album artist. The folder must follow the album artist.
  await selectAlbum(page, 'Album Delta');

  await confirmSyncFromPreview(page, destDir, { newTracks: '2 tracks' });

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual(library.albumDeltaTree);
});
