import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface SnapCore24Options {
  readonly confinement: string;
  readonly useDestructiveMode: boolean;
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

  it('builds destructively on the CI runner instead of requiring LXD/multipass', () => {
    expect(projectManifest.build.snapcraft.core24.useDestructiveMode).toBe(true);
  });

  it('disables /dev/shm so Chromium falls back to $TMPDIR under strict confinement', () => {
    expect(projectManifest.build.snapcraft.core24.executableArgs).toContain(
      '--disable-dev-shm-usage',
    );
  });

  it('declares the manual-connect interfaces required by USB sync, volume labeling, keyring, and hotplug detection', () => {
    const plugs = projectManifest.build.snapcraft.core24.plugs;

    expect(plugs).toContain('removable-media');
    expect(plugs).toContain('mount-observe');
    expect(plugs).toContain('password-manager-service');
    expect(plugs).toContain('hardware-observe');
  });
});
