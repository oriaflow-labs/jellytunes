import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// We mock the electron `app.getPath('userData')` indirection so the test
// can point at a fresh tmp dir without booting an Electron app.
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected path: ${name}`);
      return process.env.JELLYTUNES_TEST_USER_DATA ?? os.tmpdir();
    },
  },
}));

import { getOrCreateDeviceId, resetDeviceIdCacheForTests } from './device-id';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jellytunes-device-id-'));
  process.env.JELLYTUNES_TEST_USER_DATA = tmpDir;
  resetDeviceIdCacheForTests();
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  delete process.env.JELLYTUNES_TEST_USER_DATA;
  resetDeviceIdCacheForTests();
});

describe('getOrCreateDeviceId', () => {
  it('creates a UUID v4 and writes it to disk on first call', () => {
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const onDisk = fs.readFileSync(path.join(tmpDir, 'device-id.txt'), 'utf-8');
    expect(onDisk).toBe(id);
  });

  it('returns the same value across calls within the same process', () => {
    const a = getOrCreateDeviceId();
    const b = getOrCreateDeviceId();
    expect(a).toBe(b);
  });

  it('reads back the persisted value on subsequent launches', () => {
    const first = getOrCreateDeviceId();
    // Simulate a restart: clear the in-memory cache but leave the file.
    resetDeviceIdCacheForTests();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it('does NOT regenerate the id when the cache is cleared but the file remains', () => {
    const first = getOrCreateDeviceId();
    resetDeviceIdCacheForTests();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
    const onDisk = fs.readFileSync(path.join(tmpDir, 'device-id.txt'), 'utf-8');
    expect(onDisk).toBe(first);
  });

  it('overwrites a corrupted file with a fresh id (refuses to use non-UUID content)', () => {
    fs.writeFileSync(path.join(tmpDir, 'device-id.txt'), 'not-a-uuid', 'utf-8');
    resetDeviceIdCacheForTests();
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id).not.toBe('not-a-uuid');
  });
});
