// src/main/update-checker.test.ts
// Unit tests for snap-aware update-checker payload builder (ORAIN-0573).

import { describe, it, expect } from 'vitest';
import { buildUpdateCheckResult } from './update-checker';

describe('buildUpdateCheckResult', () => {
  it('reports updateAvailable=true when a newer version exists and not under snap', () => {
    const result = buildUpdateCheckResult(
      { latestVersion: '2.0.0', releaseUrl: 'https://example/release', currentVersion: '1.0.0' },
      false,
    );
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('2.0.0');
    expect(result.releaseUrl).toBe('https://example/release');
    expect(result.managedBySnap).toBe(false);
  });

  it('reports updateAvailable=false when versions match and not under snap', () => {
    const result = buildUpdateCheckResult(
      { latestVersion: '1.0.0', releaseUrl: '', currentVersion: '1.0.0' },
      false,
    );
    expect(result.updateAvailable).toBe(false);
  });

  it('forces updateAvailable=false when running under snap (even if newer exists)', () => {
    // ORAIN-0573 AC1: under snap, the banner must NOT appear. snapd does the
    // refresh. The ping still happens, but we suppress the banner.
    const result = buildUpdateCheckResult(
      { latestVersion: '2.0.0', releaseUrl: 'https://example/release', currentVersion: '1.0.0' },
      true,
    );
    expect(result.updateAvailable).toBe(false);
    expect(result.managedBySnap).toBe(true);
    // We keep latestVersion/releaseUrl so the About modal can still tell the
    // user what version is available upstream if it wants to.
    expect(result.latestVersion).toBe('2.0.0');
    expect(result.releaseUrl).toBe('https://example/release');
  });

  it('forces updateAvailable=false when running under snap and versions match', () => {
    const result = buildUpdateCheckResult(
      { latestVersion: '1.0.0', releaseUrl: '', currentVersion: '1.0.0' },
      true,
    );
    expect(result.updateAvailable).toBe(false);
    expect(result.managedBySnap).toBe(true);
  });

  it('treats empty latestVersion as no update (defensive against network/parse failures)', () => {
    const result = buildUpdateCheckResult(
      { latestVersion: '', releaseUrl: '', currentVersion: '1.0.0' },
      false,
    );
    expect(result.updateAvailable).toBe(false);
  });
});
