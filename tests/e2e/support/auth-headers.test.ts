import { describe, it, expect } from 'vitest';
import {
  buildAuthHeader,
  AUTH_CLIENT,
  AUTH_DEVICE,
  AUTH_DEVICE_ID,
  AUTH_VERSION,
} from './auth-headers';

describe('buildAuthHeader', () => {
  it('emits only Token when no client/device/deviceId/version provided', () => {
    expect(buildAuthHeader({ token: 'abc' })).toBe('MediaBrowser Token="abc"');
  });

  it('emits Token and all metadata fields when supplied', () => {
    expect(
      buildAuthHeader({
        token: 'k',
        client: 'JellyTunes',
        device: 'My Laptop',
        deviceId: 'device-1',
        version: '0.6.0',
      }),
    ).toBe(
      'MediaBrowser Token="k", Client="JellyTunes", Device="My Laptop", DeviceId="device-1", Version="0.6.0"',
    );
  });

  it('omits empty fields (never emits DeviceId="" or Version="")', () => {
    expect(buildAuthHeader({ token: 'k', client: 'C' })).toBe('MediaBrowser Token="k", Client="C"');
  });

  it('strips embedded double-quotes, CR, LF, NUL from values', () => {
    // CRLF would corrupt the header (header injection); quotes would terminate the field early.
    expect(buildAuthHeader({ token: 'a"b\rc\nd\0e' })).toBe('MediaBrowser Token="abcde"');
  });

  it('exposes canonical e2e client/device/deviceId/version constants', () => {
    expect(AUTH_CLIENT).toBe('jellytunes-e2e');
    expect(AUTH_DEVICE).toBe('ci');
    expect(AUTH_DEVICE_ID).toBe('jellytunes-e2e');
    expect(AUTH_VERSION).toBe('1.0.0');
  });
});
