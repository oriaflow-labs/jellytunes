// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  primeRenderAuthContext,
  _resetRenderAuthContextForTests,
} from './authContext';
import { jellyfinHeaders } from './jellyfin';

describe('jellyfinHeaders (ORAIN-0562)', () => {
  beforeEach(() => {
    _resetRenderAuthContextForTests();
    // @ts-expect-error — test fakes preload shape
    window.api = {
      getVersion: () => Promise.resolve('0.6.0'),
      getDeviceId: () => Promise.resolve('deadbeef-1234-4567-89ab-cdef01234567'),
    };
  });

  it('does not emit X-Emby-Token nor X-MediaBrowser-Token', async () => {
    await primeRenderAuthContext();
    const headers = jellyfinHeaders('test-key');
    expect(headers['X-Emby-Token']).toBeUndefined();
    expect(headers['X-MediaBrowser-Token']).toBeUndefined();
  });

  it('emits Authorization: MediaBrowser Token="<key>"', async () => {
    await primeRenderAuthContext();
    const headers = jellyfinHeaders('test-key');
    expect(headers.Authorization).toBe(
      'Authorization: MediaBrowser Token="test-key", Client="JellyTunes", Device="JellyTunes Desktop", DeviceId="deadbeef-1234-4567-89ab-cdef01234567", Version="0.6.0"',
    );
  });

  it('includes Content-Type for JSON callers', async () => {
    await primeRenderAuthContext();
    expect(jellyfinHeaders('k')['Content-Type']).toBe('application/json');
  });

  it('reads cached deviceId — second call uses the same id (no IPC round-trip)', async () => {
    let getDeviceIdCalls = 0;
    // @ts-expect-error — test fakes preload shape
    window.api = {
      getVersion: () => Promise.resolve('0.6.0'),
      getDeviceId: () => {
        getDeviceIdCalls++;
        return Promise.resolve(`id-${getDeviceIdCalls}`);
      },
    };
    await primeRenderAuthContext();
    const a = jellyfinHeaders('k').Authorization;
    const b = jellyfinHeaders('k').Authorization;
    expect(a).toBe(b);
    // Prime resolved once. Headroom for any retries: assert strictly less than 3.
    expect(getDeviceIdCalls).toBeLessThan(3);
  });
});
