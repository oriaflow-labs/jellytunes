import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface SnapCore24Options {
  readonly confinement: string;
  readonly useLXD: boolean;
  readonly stagePackages: readonly string[];
  readonly executableArgs: readonly string[];
  readonly plugs: readonly string[];
}

interface PackageManifest {
  readonly build: {
    readonly linux: {
      readonly target: readonly string[];
    };
    readonly snapcraft: {
      readonly base: string;
      readonly core24: SnapCore24Options;
    };
    // Legacy electron-builder key — must stay absent, see ORAIN-0571 spec:
    // mixing `snap` with `snapcraft`/`base: core24` silently builds a
    // core20-templated package that fails at runtime on Noble.
    readonly snap?: unknown;
  };
}

const projectManifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest;

describe('Linux snap sandbox packaging', () => {
  it('adds the snap target alongside the existing AppImage/deb targets', () => {
    expect(projectManifest.build.linux.target).toEqual(['AppImage', 'deb', 'snap']);
  });

  it('configures snap packaging via the `snapcraft` key targeting core24, not the legacy `snap` key', () => {
    expect(projectManifest.build.snapcraft.base).toBe('core24');
    expect(projectManifest.build.snap).toBeUndefined();
  });

  it('ships strict confinement, per the ORAIN-0571 spike decision', () => {
    expect(projectManifest.build.snapcraft.core24.confinement).toBe('strict');
  });

  it('builds via LXD so the gnome extension provisions Electron/Chromium runtime libraries automatically', () => {
    expect(projectManifest.build.snapcraft.core24.useLXD).toBe(true);
  });

  it('opts into the default stage-packages (libnss3 and friends) — omitting this silently ships zero runtime libs', () => {
    expect(projectManifest.build.snapcraft.core24.stagePackages).toContain('default');
  });

  it('disables /dev/shm so Chromium falls back to $TMPDIR under strict confinement', () => {
    expect(projectManifest.build.snapcraft.core24.executableArgs).toContain(
      '--disable-dev-shm-usage',
    );
  });

  it('declares the manual-connect interfaces required by USB sync and volume labeling', () => {
    // ORAIN-0591: `hardware-observe` is intentionally absent — USB detection
    // under snap runs entirely on polling (`device-watcher.ts`), so the
    // udev access granted by that plug is no longer needed.
    // ORAIN-0592: `mount-observe` is also absent — nested mount detection
    // uses `st_dev`/`statfs` instead of `/proc/mounts`.
    const plugs = projectManifest.build.snapcraft.core24.plugs;

    expect(plugs).toContain('removable-media');
    expect(plugs).not.toContain('mount-observe');
    expect(plugs).not.toContain('hardware-observe');
    expect(plugs).not.toContain('password-manager-service');
  });

  it('does NOT declare password-manager-service (ORAIN-0590 — secret-tool needs no plug)', () => {
    // The session-storage provider switched to `secret-tool`, which routes
    // through the Secret portal inside the confinement. The plug is no
    // longer requested, no longer surfaced in the UI, and no longer probed.
    // If a future contributor re-adds it, the banner copy and the snap
    // permission reports will drift, so the test fails fast.
    const plugs = projectManifest.build.snapcraft.core24.plugs;
    expect(plugs).not.toContain('password-manager-service');
  });
});
