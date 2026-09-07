import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { artists: string[] };

test('E10: connecting with username + password loads the library', async ({
  page,
  serverConfig,
}) => {
  await login(page, serverConfig, 'password');

  const items = page.getByTestId('library-item');
  await expect(items).toHaveCount(library.artists.length);

  for (const artist of library.artists) {
    await expect(items.filter({ hasText: artist })).toHaveCount(1);
  }
});
