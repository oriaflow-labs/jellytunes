/**
 * Tests for FFmpeg path resolution (issue #2)
 *
 * FFmpeg binaries bundled via @ffmpeg-installer/ffmpeg end up inside app.asar
 * when the Electron app is packaged. The OS cannot spawn executables from inside
 * .asar archives, causing ENOTDIR (macOS) or ENOENT (Windows).
 *
 * The fix: rewrite paths containing "app.asar/" to "app.asar.unpacked/" and
 * add the ffmpeg-installer glob to asarUnpack in electron-builder config.
 */

import { describe, it, expect } from 'vitest';
import { rewriteAsarPath, resolveFFmpegPath } from './ffmpeg-path';

describe('rewriteAsarPath', () => {
  it('returns path unchanged when not inside an asar archive', () => {
    const path = '/Users/dev/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg';
    expect(rewriteAsarPath(path)).toBe(path);
  });

  it('rewrites app.asar/ to app.asar.unpacked/ for macOS packaged app', () => {
    const input =
      '/Applications/JellyTunes.app/Contents/Resources/app.asar/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg';
    const expected =
      '/Applications/JellyTunes.app/Contents/Resources/app.asar.unpacked/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg';

    expect(rewriteAsarPath(input)).toBe(expected);
  });

  it('rewrites app.asar\\ to app.asar.unpacked\\ for Windows packaged app', () => {
    const input =
      'D:\\music\\jellytunes\\resources\\app.asar\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe';
    const expected =
      'D:\\music\\jellytunes\\resources\\app.asar.unpacked\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe';

    expect(rewriteAsarPath(input)).toBe(expected);
  });

  it('does not double-rewrite paths already pointing to app.asar.unpacked', () => {
    const alreadyUnpacked =
      '/Applications/JellyTunes.app/Contents/Resources/app.asar.unpacked/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg';

    const result = rewriteAsarPath(alreadyUnpacked);
    expect(result).toBe(alreadyUnpacked);
    expect(result.split('app.asar.unpacked').length - 1).toBe(1); // appears exactly once
  });
});

describe('resolveFFmpegPath', () => {
  it('returns a non-empty string', () => {
    const result = resolveFFmpegPath();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('never returns a path inside app.asar/', () => {
    const result = resolveFFmpegPath();
    // In dev the installer path won't contain app.asar, but this guard
    // ensures the rewrite is applied should it ever appear.
    expect(result).not.toMatch(/app\.asar[/\\]node_modules/);
  });
});
