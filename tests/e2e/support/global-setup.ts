import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertServerReachable, assertMediaDownloadable, assertServerMajor } from './server';

export default async function globalSetup(): Promise<void> {
  const mainEntry = join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js');
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing ${mainEntry}. Run: pnpm build`);
  }
  await assertServerReachable();
  await assertMediaDownloadable();

  const version = process.env.JELLYFIN_VERSION;
  const expected = process.env.JELLYFIN_EXPECTED_MAJOR;
  if (version && expected) {
    await assertServerMajor(version, Number.parseInt(expected, 10));
  }
}
