// src/main/snap-env.test.ts
// Unit tests for snap environment detection (ORAIN-0573).

import { describe, it, expect } from 'vitest';
import { detectSnapEnv, type SnapEnvSource } from './snap-env';

describe('detectSnapEnv', () => {
  it('returns isSnap=false when both SNAP and SNAP_NAME are missing', () => {
    const env: SnapEnvSource = {};
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(false);
    expect(result.snapPath).toBeNull();
    expect(result.snapName).toBeNull();
  });

  it('returns isSnap=false when only SNAP is set', () => {
    const env: SnapEnvSource = { SNAP: '/snap/jellytunes/x1' };
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(false);
    expect(result.snapPath).toBe('/snap/jellytunes/x1');
    expect(result.snapName).toBeNull();
  });

  it('returns isSnap=false when only SNAP_NAME is set', () => {
    const env: SnapEnvSource = { SNAP_NAME: 'jellytunes' };
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(false);
    expect(result.snapPath).toBeNull();
    expect(result.snapName).toBe('jellytunes');
  });

  it('returns isSnap=true when both SNAP and SNAP_NAME are present', () => {
    const env: SnapEnvSource = { SNAP: '/snap/jellytunes/x2', SNAP_NAME: 'jellytunes' };
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(true);
    expect(result.snapPath).toBe('/snap/jellytunes/x2');
    expect(result.snapName).toBe('jellytunes');
  });

  it('treats empty string SNAP as not snap (defensive)', () => {
    const env: SnapEnvSource = { SNAP: '', SNAP_NAME: 'jellytunes' };
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(false);
    expect(result.snapPath).toBeNull();
  });

  it('treats empty string SNAP_NAME as not snap (defensive)', () => {
    const env: SnapEnvSource = { SNAP: '/snap/jellytunes/x3', SNAP_NAME: '' };
    const result = detectSnapEnv(env);
    expect(result.isSnap).toBe(false);
    expect(result.snapName).toBeNull();
  });
});
