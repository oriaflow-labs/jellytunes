import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { tabCounts: Record<'artists' | 'albumArtists' | 'albums' | 'playlists', number> };

test('E9a: every populated library tab renders the expected item count', async ({
  page,
  serverConfig,
}) => {
  await login(page, serverConfig);

  for (const [tab, count] of Object.entries(library.tabCounts)) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId('library-item'), `${tab} tab item count`).toHaveCount(count);
  }

  // The genres tab is empty in this fixture library and its rendering is
  // covered by a separate finding, so assert only that switching to it and
  // back leaves the library usable.
  await page.getByTestId('tab-genres').click();
  await page.getByTestId('tab-albums').click();
  await expect(page.getByTestId('library-item')).toHaveCount(library.tabCounts.albums);
});

test('E9b: search narrows the album list and clearing it restores the list', async ({
  page,
  serverConfig,
}) => {
  await login(page, serverConfig);
  await page.getByTestId('tab-albums').click();
  await expect(page.getByTestId('library-item')).toHaveCount(library.tabCounts.albums);

  // Server-side search with a 350 ms debounce; toHaveCount retries, so no sleep.
  await page.getByTestId('search-input').fill('Alpha');
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-item')).toContainText('Album Alpha');

  await page.getByTestId('search-input').fill('');
  await expect(page.getByTestId('library-item')).toHaveCount(library.tabCounts.albums);
});

test('E9c: select all does nothing without an active device', async ({ page, serverConfig }) => {
  await login(page, serverConfig);
  await page.getByTestId('tab-albums').click();
  await expect(page.getByTestId('library-item')).toHaveCount(library.tabCounts.albums);

  await page.getByTestId('select-all-button').click();

  // The guard shows a toast that carries no data-testid, so match its text.
  await expect(page.getByText('Select a device in the sidebar first')).toBeVisible();
  // clear-selection-button only renders when something is selected, so its
  // absence is the proof that the guard held.
  await expect(page.getByTestId('clear-selection-button')).toBeHidden();
});

test('E9d: select all selects the tab and clear undoes it', async ({
  page,
  app,
  destDir,
  serverConfig,
}) => {
  await login(page, serverConfig);
  await addDestination(page, app, destDir);

  await page.getByTestId('tab-albums').click();
  await expect(page.getByTestId('library-item')).toHaveCount(library.tabCounts.albums);
  await expect(page.getByTestId('clear-selection-button')).toBeHidden();

  await page.getByTestId('select-all-button').click();
  await expect(page.getByTestId('clear-selection-button')).toBeVisible();

  await page.getByTestId('clear-selection-button').click();
  await expect(page.getByTestId('clear-selection-button')).toBeHidden();
});
