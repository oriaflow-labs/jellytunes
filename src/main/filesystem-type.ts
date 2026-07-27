/**
 * Linux filesystem-type detection without `mount-observe` (ORAIN-0592).
 *
 * The previous implementation read the fstype column of /proc/mounts, which
 * requires the `mount-observe` interface. `statfs(2)` reports the same thing
 * as a magic number on the path itself, and needs no interface:
 *
 *   - seccomp: `statfs`, `statfs64`, `fstatfs`, `fstatfs64` are in snapd's
 *     *default* template (`interfaces/seccomp/template.go`), granted to every
 *     strict-confined snap.
 *   - AppArmor: mediated as a read on the path, already granted for the
 *     removable-media roots by the `removable-media` interface.
 *
 * Verified against a live kernel (6.17.8) with loop-mounted images — see the
 * table in the ORAIN-0592 task notes; the magic numbers below reproduce the
 * exact labels the /proc/mounts parser produced for the same mounts.
 *
 * The returned labels drive filename sanitization, so unknown filesystems
 * must fall through to `unknown` rather than guess a permissive default.
 */

/** Filesystem labels the sync layer knows how to sanitize filenames for. */
export type FilesystemLabel = 'fat32' | 'exfat' | 'ntfs' | 'ext4' | 'unknown';

/**
 * `statfs(2)` f_type magic numbers.
 *
 * Sourced from `include/uapi/linux/magic.h`, except `NTFS3` which lives in
 * `fs/ntfs3` and was confirmed empirically (0x7366746e, "ntfs" as ASCII).
 */
const FS_MAGIC = {
  MSDOS: 0x4d44, // vfat / msdos — what FAT32 sticks report
  EXFAT: 0x2011bab0,
  NTFS3: 0x7366746e, // in-kernel ntfs3 driver (default since kernel 5.15)
  NTFS_LEGACY: 0x5346544e, // older in-kernel ntfs driver
  FUSE: 0x65735546, // ntfs-3g mounts land here — /proc/mounts called it "fuseblk"
  EXT234: 0xef53, // ext2, ext3 and ext4 share one magic
  BTRFS: 0x9123683e,
  XFS: 0x58465342,
} as const;

/**
 * Maps a `statfs` magic number to a filesystem label.
 *
 * Grouping matches what the /proc/mounts parser did: every Linux-native
 * filesystem collapses to `ext4`, because the sync layer only distinguishes
 * "needs FAT/NTFS filename sanitization" from "does not".
 *
 * FUSE is reported as `ntfs` because ntfs-3g is the FUSE filesystem that
 * shows up on removable media in practice — the same assumption the previous
 * `fuseblk` mapping made.
 */
export function filesystemLabelFromMagic(magic: number): FilesystemLabel {
  switch (magic) {
    case FS_MAGIC.MSDOS:
      return 'fat32';
    case FS_MAGIC.EXFAT:
      return 'exfat';
    case FS_MAGIC.NTFS3:
    case FS_MAGIC.NTFS_LEGACY:
    case FS_MAGIC.FUSE:
      return 'ntfs';
    case FS_MAGIC.EXT234:
    case FS_MAGIC.BTRFS:
    case FS_MAGIC.XFS:
      return 'ext4';
    default:
      return 'unknown';
  }
}

/** The `fs.statfsSync` surface this module needs, narrowed so tests can fake it. */
export interface StatfsProvider {
  statfsSync(path: string): { type: number };
}

/**
 * Detects the filesystem mounted at `devicePath`.
 *
 * Returns `unknown` when the path cannot be queried at all — the caller
 * treats that as "apply no format-specific sanitization", which is the safe
 * direction to fail in.
 */
export function detectLinuxFilesystem(fs: StatfsProvider, devicePath: string): FilesystemLabel {
  try {
    return filesystemLabelFromMagic(Number(fs.statfsSync(devicePath).type));
  } catch {
    return 'unknown';
  }
}
