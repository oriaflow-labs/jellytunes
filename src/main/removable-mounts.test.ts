// Removable-mount detection without `mount-observe` (ORAIN-0592).
//
// The previous implementation read /proc/mounts, which is gated behind the
// `mount-observe` interface. These tests pin the replacement: mount points are
// found by comparing st_dev against the parent directory (the same boundary
// test `mountpoint(1)` uses), which needs nothing beyond `removable-media` —
// an interface the app already requires.
//
// The fake fs below models st_dev per path: entries sharing their parent's dev
// are plain directories, entries with a different dev are mount boundaries.

import { describe, expect, it } from 'vitest';
import {
  listRemovableMountpoints,
  REMOVABLE_MOUNT_ROOTS,
  type MountScanFs,
} from './removable-mounts';

interface FakeNode {
  readonly dev: number;
  readonly isDir?: boolean;
  /** Simulates EACCES on readdir while stat still succeeds. */
  readonly readdirFails?: boolean;
}

/** Builds a MountScanFs over a flat path→node map. Unlisted paths throw ENOENT. */
function fakeFs(tree: Readonly<Record<string, FakeNode>>): MountScanFs {
  return {
    statSync(path: string) {
      const node = tree[path];
      if (!node) throw new Error(`ENOENT: ${path}`);
      return { dev: node.dev, isDirectory: () => node.isDir !== false };
    },
    readdirSync(path: string) {
      const node = tree[path];
      if (!node) throw new Error(`ENOENT: ${path}`);
      if (node.readdirFails) throw new Error(`EACCES: ${path}`);
      const prefix = path.endsWith('/') ? path : `${path}/`;
      return Object.keys(tree)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length));
    },
  };
}

const ROOT_DEV = 1;

describe('listRemovableMountpoints', () => {
  it('finds a volume nested under the per-user directory (/media/$USER/$LABEL)', () => {
    // The GVFS/udisks2 convention, and the exact case the one-level scan got
    // wrong: it stopped at /media/alice and reported "alice" as the device.
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/MUSIC': { dev: 42 },
    });

    expect(listRemovableMountpoints(fs)).toEqual(['/media/alice/MUSIC']);
  });

  it('finds a volume mounted directly under a root (/mnt/$LABEL)', () => {
    const fs = fakeFs({
      '/mnt': { dev: ROOT_DEV },
      '/mnt/USBDRIVE': { dev: 43 },
    });

    expect(listRemovableMountpoints(fs)).toEqual(['/mnt/USBDRIVE']);
  });

  it('scans /run/media as well as /media and /mnt', () => {
    const fs = fakeFs({
      '/run/media': { dev: ROOT_DEV },
      '/run/media/bob': { dev: ROOT_DEV },
      '/run/media/bob/SDCARD': { dev: 44 },
    });

    expect(listRemovableMountpoints(fs)).toEqual(['/run/media/bob/SDCARD']);
  });

  it('ignores plain directories that are not mount boundaries', () => {
    // Both decoys share the root device, so neither is a mount. Reporting them
    // would surface phantom devices in the picker.
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/not-a-mount': { dev: ROOT_DEV },
      '/mnt': { dev: ROOT_DEV },
      '/mnt/plain-dir': { dev: ROOT_DEV },
    });

    expect(listRemovableMountpoints(fs)).toEqual([]);
  });

  it('reports the mount point itself, never the intermediate user directory', () => {
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/MUSIC': { dev: 42 },
    });

    const found = listRemovableMountpoints(fs);

    expect(found).not.toContain('/media/alice');
    expect(found).toContain('/media/alice/MUSIC');
  });

  it('preserves mount point names containing spaces', () => {
    // /proc/mounts octal-escapes these (\040); stat returns them verbatim, so
    // the unescaping step the old parser needed is gone.
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/MY USB': { dev: 42 },
    });

    expect(listRemovableMountpoints(fs)).toEqual(['/media/alice/MY USB']);
  });

  it('finds several volumes across roots at mixed depths', () => {
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/MUSIC': { dev: 42 },
      '/mnt': { dev: ROOT_DEV },
      '/mnt/USBDRIVE': { dev: 43 },
      '/run/media': { dev: ROOT_DEV },
      '/run/media/bob': { dev: ROOT_DEV },
      '/run/media/bob/SDCARD': { dev: 44 },
    });

    expect(listRemovableMountpoints(fs).sort()).toEqual([
      '/media/alice/MUSIC',
      '/mnt/USBDRIVE',
      '/run/media/bob/SDCARD',
    ]);
  });

  it('skips roots that do not exist', () => {
    const fs = fakeFs({ '/mnt': { dev: ROOT_DEV }, '/mnt/USBDRIVE': { dev: 43 } });

    expect(listRemovableMountpoints(fs)).toEqual(['/mnt/USBDRIVE']);
  });

  it('skips non-directory entries', () => {
    // A file on a different device (a bind-mounted file) is not a volume.
    const fs = fakeFs({
      '/mnt': { dev: ROOT_DEV },
      '/mnt/somefile': { dev: 43, isDir: false },
    });

    expect(listRemovableMountpoints(fs)).toEqual([]);
  });

  it('keeps scanning other roots when one denies readdir', () => {
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV, readdirFails: true },
      '/media/alice': { dev: ROOT_DEV },
      '/mnt': { dev: ROOT_DEV },
      '/mnt/USBDRIVE': { dev: 43 },
    });

    expect(listRemovableMountpoints(fs)).toEqual(['/mnt/USBDRIVE']);
  });

  it('does not descend past the per-user level', () => {
    // `removable-media` grants directory reads for /{,run/}media/ and
    // /{,run/}media/*/ only, so a deeper walk would both exceed the grant and
    // wander into user data on an ordinary mounted volume.
    const fs = fakeFs({
      '/media': { dev: ROOT_DEV },
      '/media/alice': { dev: ROOT_DEV },
      '/media/alice/deep': { dev: ROOT_DEV },
      '/media/alice/deep/TOO-FAR': { dev: 99 },
    });

    expect(listRemovableMountpoints(fs)).toEqual([]);
  });

  it('exposes the conventional removable-media roots', () => {
    expect(REMOVABLE_MOUNT_ROOTS).toEqual(['/media', '/mnt', '/run/media']);
  });
});
