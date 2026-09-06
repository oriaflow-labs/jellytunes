import { describe, it, expect } from 'vitest';
import { resolveProjectTarget } from './server';

const config = {
  projects: [
    { name: 'jellyfin-v11', use: { jellyfinVersion: 'v11', jellyfinExpectedMajor: 10 } },
    { name: 'jellyfin-v12', use: { jellyfinVersion: 'v12', jellyfinExpectedMajor: 12 } },
  ],
};

describe('resolveProjectTarget', () => {
  it('returns v11 target when --project=jellyfin-v11 is in argv', () => {
    const target = resolveProjectTarget(
      config,
      ['node', 'playwright', '--project=jellyfin-v11'],
      {},
    );
    expect(target).toEqual({ version: 'v11', expectedMajor: 10 });
  });

  it('returns v12 target when --project=jellyfin-v12 is in argv', () => {
    const target = resolveProjectTarget(
      config,
      ['node', 'playwright', '--project=jellyfin-v12'],
      {},
    );
    expect(target).toEqual({ version: 'v12', expectedMajor: 12 });
  });

  it('falls back to JELLYFIN_VERSION env when no --project flag', () => {
    const target = resolveProjectTarget(config, ['node', 'playwright'], {
      JELLYFIN_VERSION: 'v11',
      JELLYFIN_EXPECTED_MAJOR: '10',
    });
    expect(target).toEqual({ version: 'v11', expectedMajor: 10 });
  });

  it('returns null when --project points at an unknown project', () => {
    const target = resolveProjectTarget(
      config,
      ['node', 'playwright', '--project=jellyfin-v99'],
      {},
    );
    expect(target).toBeNull();
  });

  it('returns null when multiple --project flags are passed (multi-project run defers preflight)', () => {
    const target = resolveProjectTarget(
      config,
      ['node', 'playwright', '--project=jellyfin-v11', '--project=jellyfin-v12'],
      {},
    );
    expect(target).toBeNull();
  });

  it('returns null when no flag and no env (caller decides)', () => {
    const target = resolveProjectTarget(config, ['node', 'playwright'], {});
    expect(target).toBeNull();
  });

  it('falls back to 10/12 defaults when jellyfinExpectedMajor is omitted from use', () => {
    const cfgNoMajor = {
      projects: [
        { name: 'jellyfin-v11', use: { jellyfinVersion: 'v11' } },
        { name: 'jellyfin-v12', use: { jellyfinVersion: 'v12' } },
      ],
    };
    expect(
      resolveProjectTarget(cfgNoMajor, ['node', 'playwright', '--project=jellyfin-v11'], {}),
    ).toEqual({ version: 'v11', expectedMajor: 10 });
    expect(
      resolveProjectTarget(cfgNoMajor, ['node', 'playwright', '--project=jellyfin-v12'], {}),
    ).toEqual({ version: 'v12', expectedMajor: 12 });
  });
});
