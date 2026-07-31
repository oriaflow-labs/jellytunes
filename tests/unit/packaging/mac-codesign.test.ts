import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly build: {
    readonly mac: {
      readonly identity: string | null;
      readonly hardenedRuntime?: boolean;
    };
  };
}

const projectManifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest;
const readProjectFile = (path: string): string => readFileSync(path, 'utf8');

describe('macOS code signing (ORAIN-0665)', () => {
  it('uses ad-hoc identity "-" instead of null, so electron-builder actually signs the bundle', () => {
    // MacTargetHelper.js: only the literal "-" builds an ad-hoc Identity.
    // `null` (or an absent key) takes the handleNullIdentity() path and
    // skips signing entirely, which is what shipped the broken v0.5/v0.6
    // releases.
    expect(projectManifest.build.mac.identity).toBe('-');
  });

  it('disables hardenedRuntime, since ad-hoc signing + hardened runtime breaks native module loading', () => {
    // app-builder-lib defaults hardenedRuntime to true. Combined with
    // ad-hoc signing, hardened runtime enforces library validation, which
    // rejects the unsigned better-sqlite3 .node binary and the
    // @ffmpeg-installer binaries this app unpacks from the asar. Notarization
    // is out of scope (ad-hoc signatures aren't notarizable anyway), so
    // there is no reason to keep hardened runtime enabled here.
    expect(projectManifest.build.mac.hardenedRuntime).toBe(false);
  });

  it('ships a single, executable code-signature verification script', () => {
    const script = readProjectFile('scripts/verify-mac-codesign.sh');
    const mode = statSync('scripts/verify-mac-codesign.sh').mode;

    expect(mode & 0o111).not.toBe(0);
    expect(script).toContain('codesign --verify --deep --strict');
    expect(script).toContain('expected_identifier="com.jellytunes.app"');
    expect(script).toContain('Identifier=$expected_identifier');
    expect(script).toContain('Sealed Resources=none');
    expect(script).toContain('::error::');
  });

  it('wires the verification script into a single reusable composite action', () => {
    const action = readProjectFile('.github/actions/verify-mac-codesign/action.yml');

    expect(action).toContain('scripts/verify-mac-codesign.sh');
    expect(action).toContain('using: composite');
  });

  it('runs the verification action on the macOS leg of build-test.yml, gating a manual dry run', () => {
    const workflow = readProjectFile('.github/workflows/build-test.yml');

    expect(workflow).toContain('uses: ./.github/actions/verify-mac-codesign');
    // The verify step must exist under the mac-gated condition, not
    // unconditionally (it would fail fast on the windows/linux legs).
    const verifyStepIndex = workflow.indexOf('uses: ./.github/actions/verify-mac-codesign');
    const precedingSlice = workflow.slice(0, verifyStepIndex);
    const lastIfIndex = precedingSlice.lastIndexOf("if: matrix.platform == 'mac'");
    expect(lastIfIndex).toBeGreaterThan(-1);
  });

  it('runs the verification action on the macOS leg of release.yml before the release can publish', () => {
    const workflow = readProjectFile('.github/workflows/release.yml');

    expect(workflow).toContain('uses: ./.github/actions/verify-mac-codesign');

    const verifyStepIndex = workflow.indexOf('uses: ./.github/actions/verify-mac-codesign');
    const precedingSlice = workflow.slice(0, verifyStepIndex);
    const lastIfIndex = precedingSlice.lastIndexOf("if: matrix.platform == 'mac'");
    expect(lastIfIndex).toBeGreaterThan(-1);

    // publish-release only runs if every build matrix leg (including the
    // verify step above) succeeds, so a failed signature check blocks
    // publication.
    expect(workflow).toContain('needs: build');
  });

  it('does not duplicate the verification run block across the two workflows', () => {
    const buildTest = readProjectFile('.github/workflows/build-test.yml');
    const release = readProjectFile('.github/workflows/release.yml');

    expect(buildTest).not.toContain('codesign --verify');
    expect(release).not.toContain('codesign --verify');
  });
});
