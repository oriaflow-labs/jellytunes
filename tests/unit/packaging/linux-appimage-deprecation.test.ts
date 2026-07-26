import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly build: {
    readonly linux: {
      readonly target: readonly string[];
    };
  };
}

const projectManifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest;
const readProjectFile = (path: string): string => readFileSync(path, 'utf8');

describe('Linux AppImage deprecation', () => {
  it('keeps AppImage temporarily while Snap Store validation is pending', () => {
    expect(projectManifest.build.linux.target).toEqual(['AppImage', 'deb', 'snap']);
  });

  it('publishes the migration guide from the README', () => {
    const readme = readProjectFile('README.md');

    expect(readme).toContain('[Linux installation and migration](docs/INSTALLATION.md)');
    expect(readme).toContain('AppImage (legacy)');
  });

  it('documents the Ubuntu 24.04 warning and supported migration channels', () => {
    const installationGuide = readProjectFile('docs/INSTALLATION.md');

    expect(installationGuide).toContain('AppImage is deprecated');
    expect(installationGuide).toContain('Ubuntu 24.04');
    expect(installationGuide).toContain('Snap');
    expect(installationGuide).toContain('.deb');
    expect(installationGuide).toContain('snap connect jellytunes:removable-media');
    expect(installationGuide).toContain('2026-10-01');
    expect(installationGuide).toContain('stable');
  });

  it('documents bundled FFmpeg for both maintained Linux channels', () => {
    const installationGuide = readProjectFile('docs/INSTALLATION.md');

    expect(installationGuide).toContain('FFmpeg is bundled with both the `.deb` and Snap packages');
  });

  it('marks AppImage releases as legacy and links to migration instructions', () => {
    const releaseNotes = readProjectFile('RELEASE_NOTES.md');

    expect(releaseNotes).toContain('AppImage (legacy)');
    expect(releaseNotes).toContain('[migration guide](docs/INSTALLATION.md)');
  });
});
