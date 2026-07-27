/**
 * Removable-mount detection under Snap strict confinement (ORAIN-0592).
 *
 * Finds mounted volumes under the conventional removable-media roots without
 * reading /proc/mounts, which is gated behind the `mount-observe` interface —
 * a privileged plug snapd itself describes as "an information leak".
 *
 * How it works: a mount point always has a different `st_dev` than the
 * directory it is mounted on, because it is a different filesystem. That is
 * the same boundary test `mountpoint(1)` uses, and Node exposes it as
 * `fs.Stats.dev`. Comparing each entry's dev against its parent's therefore
 * distinguishes a real mounted volume from an ordinary directory — which the
 * previous one-level `readdir` fallback could not do, so it reported the
 * intermediate `/media/$USER` directory as if it were the device.
 *
 * Permissions: this needs only `readdir` on the roots and on the per-user
 * directory, plus `stat` on their entries. All of it falls inside the
 * `removable-media` AppArmor grant (snapd `interfaces/builtin/removable_media.go`):
 *
 *     /{,run/}media/ r,
 *     /{,run/}media/<user>/ r,
 *     /{,run/}media/<user>/<any> mrwklix,
 *     /mnt/ r,
 *     /mnt/<any> mrwklix,
 *
 * (`<user>` and `<any>` stand in for the `*` and `**` wildcards, which
 * cannot be written literally inside a block comment.)
 *
 * `removable-media` is already required for the core sync feature, so
 * detection now costs no interface of its own.
 *
 * Pure apart from the injected `MountScanFs`, so it is unit-tested against a
 * fake filesystem rather than real mounts.
 */

import { join } from 'path';

/** The `fs.Stats` fields this scan needs. */
export interface MountStat {
  /** Filesystem device id. Differs from the parent's at a mount boundary. */
  dev: number;
  isDirectory(): boolean;
}

/** The `fs` surface this scan needs, narrowed so tests can fake it. */
export interface MountScanFs {
  statSync(path: string): MountStat;
  readdirSync(path: string): string[];
}

/** Conventional mount roots for removable media on Linux. */
export const REMOVABLE_MOUNT_ROOTS: readonly string[] = ['/media', '/mnt', '/run/media'];

/**
 * How many directory levels below a root to search.
 *
 * Level 1 catches `/mnt/$LABEL`; level 2 catches the GVFS/udisks2 convention
 * `/media/$USER/$LABEL`. Stopping there matches the `removable-media` grant,
 * which only allows listing `/{,run/}media/` and one level below it — and
 * keeps the scan from walking into the contents of a mounted volume.
 */
const MAX_SCAN_DEPTH = 2;

/**
 * Lists the mount points found under `roots`.
 *
 * Every filesystem error is swallowed on purpose: an unreadable root or entry
 * means "nothing to report here", not a failed scan. Other roots still get
 * searched, so one denied directory cannot hide every device.
 */
export function listRemovableMountpoints(
  fs: MountScanFs,
  roots: readonly string[] = REMOVABLE_MOUNT_ROOTS,
): string[] {
  const found: string[] = [];

  const walk = (dir: string, parentDev: number, depth: number): void => {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      const path = join(dir, name);
      let stat: MountStat;
      try {
        stat = fs.statSync(path);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      if (stat.dev !== parentDev) {
        found.push(path);
      } else if (depth < MAX_SCAN_DEPTH) {
        walk(path, stat.dev, depth + 1);
      }
    }
  };

  for (const root of roots) {
    let rootStat: MountStat;
    try {
      rootStat = fs.statSync(root);
    } catch {
      continue;
    }
    if (!rootStat.isDirectory()) continue;
    walk(root, rootStat.dev, 1);
  }

  return found;
}
