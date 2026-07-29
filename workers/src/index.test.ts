import { describe, it, expect } from 'vitest';
import { parseUserAgent } from './index';

describe('parseUserAgent', () => {
  it('marks snap UAs with a linux-snap platform', () => {
    const { version, platform } = parseUserAgent('JellyTunes/0.6.0 (linux; x64) (snap)');
    expect(version).toBe('0.6.0');
    expect(platform).toBe('linux-snap');
  });

  it('keeps linux platform when (snap) marker is absent', () => {
    const { version, platform } = parseUserAgent('JellyTunes/0.6.0 (linux; x64)');
    expect(version).toBe('0.6.0');
    expect(platform).toBe('linux');
  });

  it('returns unknown platform when UA has no parens', () => {
    const { version, platform } = parseUserAgent('JellyTunes/0.6.0');
    expect(version).toBe('0.6.0');
    expect(platform).toBe('unknown');
  });

  it('returns unknown version and platform for unrelated UAs', () => {
    const { version, platform } = parseUserAgent('curl/8.4.0');
    expect(version).toBe('unknown');
    expect(platform).toBe('unknown');
  });

  it('does not regress darwin / windows', () => {
    expect(parseUserAgent('JellyTunes/1.2.3 (darwin; arm64)').platform).toBe('darwin');
    expect(parseUserAgent('JellyTunes/1.2.3 (windows; x64)').platform).toBe('windows');
  });
});
