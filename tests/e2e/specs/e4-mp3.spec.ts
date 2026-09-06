import { execFileSync } from 'node:child_process';
import { chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ffprobe from '@ffprobe-installer/ffprobe';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

/**
 * @ffprobe-installer publishes its binary as mode 644 (unlike @ffmpeg-installer),
 * so a fresh install leaves it non-executable. Repair it once, idempotently.
 */
function ensureFfprobeExecutable(): void {
  const mode = statSync(ffprobe.path).mode;
  if ((mode & 0o111) === 0) chmodSync(ffprobe.path, 0o755);
}

function codecOf(file: string): string {
  return execFileSync(ffprobe.path, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name',
    '-of',
    'default=nw=1:nk=1',
    file,
  ])
    .toString()
    .trim();
}

test.beforeAll(() => {
  ensureFfprobeExecutable();
});

test('E4: the MP3 toggle converts FLAC sources to playable MP3', async ({
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

  await page.getByTestId('mp3-toggle').click();

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await expect
    .poll(() => listTree(destDir).filter((f) => f.endsWith('.mp3')).length, { timeout: 180_000 })
    .toBe(3);

  const tree = listTree(destDir);
  expect(tree.filter((f) => f.endsWith('.flac'))).toEqual([]);

  for (const rel of tree.filter((f) => f.endsWith('.mp3'))) {
    expect(codecOf(join(destDir, rel)), `${rel} is not a valid MP3`).toBe('mp3');
  }
});
