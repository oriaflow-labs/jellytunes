// Filesystem-type detection via statfs magic numbers (ORAIN-0592).
//
// Replaces reading the fstype column of /proc/mounts, which needed the
// `mount-observe` interface. The magic numbers asserted here are not copied
// from documentation alone — they were read back from a live kernel (6.17.8)
// with loop-mounted images, alongside the /proc/mounts fstype for the same
// mount, and they matched:
//
//   mountpoint    /proc/mounts   statfs.type   hex
//   /mnt/VFAT     vfat           19780         0x4d44
//   /mnt/EXFAT    exfat          538032816     0x2011bab0
//   /mnt/NTFS     ntfs3          1936094318    0x7366746e
//   /mnt/EXT4     ext4           61267         0xef53

import { describe, expect, it } from 'vitest';
import {
  detectLinuxFilesystem,
  filesystemLabelFromMagic,
  type StatfsProvider,
} from './filesystem-type';

/** A StatfsProvider that reports one magic number, or throws for unknown paths. */
function fakeStatfs(byPath: Readonly<Record<string, number>>): StatfsProvider {
  return {
    statfsSync(path: string) {
      const type = byPath[path];
      if (type === undefined) throw new Error(`ENOENT: ${path}`);
      return { type };
    },
  };
}

describe('filesystemLabelFromMagic', () => {
  it('maps the magic numbers observed on a live kernel', () => {
    expect(filesystemLabelFromMagic(0x4d44)).toBe('fat32');
    expect(filesystemLabelFromMagic(0x2011bab0)).toBe('exfat');
    expect(filesystemLabelFromMagic(0x7366746e)).toBe('ntfs');
    expect(filesystemLabelFromMagic(0xef53)).toBe('ext4');
  });

  it('accepts the decimal values statfs actually returns', () => {
    expect(filesystemLabelFromMagic(19780)).toBe('fat32');
    expect(filesystemLabelFromMagic(538032816)).toBe('exfat');
    expect(filesystemLabelFromMagic(1936094318)).toBe('ntfs');
    expect(filesystemLabelFromMagic(61267)).toBe('ext4');
  });

  it('treats every NTFS driver variant as ntfs', () => {
    // The old parser accepted "ntfs", "ntfs3", "ntfs-3g" and "fuseblk".
    expect(filesystemLabelFromMagic(0x7366746e)).toBe('ntfs'); // in-kernel ntfs3
    expect(filesystemLabelFromMagic(0x5346544e)).toBe('ntfs'); // legacy in-kernel ntfs
    expect(filesystemLabelFromMagic(0x65735546)).toBe('ntfs'); // ntfs-3g over FUSE
  });

  it('collapses Linux-native filesystems onto ext4, as the old parser did', () => {
    // ext2/ext3/ext4 share one magic; btrfs and xfs were grouped with them.
    expect(filesystemLabelFromMagic(0xef53)).toBe('ext4');
    expect(filesystemLabelFromMagic(0x9123683e)).toBe('ext4'); // btrfs
    expect(filesystemLabelFromMagic(0x58465342)).toBe('ext4'); // xfs
  });

  it('returns unknown for filesystems it cannot classify', () => {
    // Guessing here would apply the wrong filename sanitization.
    expect(filesystemLabelFromMagic(0x01021994)).toBe('unknown'); // tmpfs
    expect(filesystemLabelFromMagic(0)).toBe('unknown');
  });
});

describe('detectLinuxFilesystem', () => {
  it('detects the filesystem at a device path', () => {
    const fs = fakeStatfs({ '/media/alice/MUSIC': 0x4d44 });

    expect(detectLinuxFilesystem(fs, '/media/alice/MUSIC')).toBe('fat32');
  });

  it('queries the given path directly, with no mount-table lookup', () => {
    // The old code matched the longest mountpoint prefix from /proc/mounts.
    // statfs resolves the mount for us, so a subdirectory answers correctly
    // without the app knowing where the mount boundary is.
    const fs = fakeStatfs({ '/media/alice/MUSIC/Albums': 0x2011bab0 });

    expect(detectLinuxFilesystem(fs, '/media/alice/MUSIC/Albums')).toBe('exfat');
  });

  it('returns unknown when the path cannot be queried', () => {
    const fs = fakeStatfs({});

    expect(detectLinuxFilesystem(fs, '/media/alice/GONE')).toBe('unknown');
  });
});
