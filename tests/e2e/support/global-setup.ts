import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig } from '@playwright/test';
import {
  assertServerReachable,
  assertMediaDownloadable,
  assertServerMajor,
  resolveProjectTarget,
} from './server';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const mainEntry = join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js');
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing ${mainEntry}. Run: pnpm build`);
  }

  const target = resolveProjectTarget(config);
  if (!target) {
    // Either a multi-project run (--project passed twice or not at all) or
    // a manual debug run without env vars. Either way, per-project preflight
    // happens in the fixture layer, so globalSetup has nothing to do here.
    return;
  }

  await assertServerReachable(target.version);
  await assertMediaDownloadable(target.version);
  await assertServerMajor(target.version, target.expectedMajor);
}
