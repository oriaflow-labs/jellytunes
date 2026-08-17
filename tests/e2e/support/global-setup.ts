import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertServerReachable } from './server';

export default async function globalSetup(): Promise<void> {
  const mainEntry = join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js');
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing ${mainEntry}. Run: pnpm build`);
  }
  await assertServerReachable();
}
