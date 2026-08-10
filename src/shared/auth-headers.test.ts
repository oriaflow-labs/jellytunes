import { describe, it, expect } from 'vitest';
import {
  buildAuthHeader,
  parseAuthHeader,
  CLIENT_NAME_DEFAULT,
  DEFAULT_DEVICE_NAME,
} from './auth-headers';

describe('buildAuthHeader', () => {
  it('starts with "Authorization: MediaBrowser "', () => {
    const header = buildAuthHeader({ token: 'abc123' });
    expect(header.startsWith('Authorization: MediaBrowser ')).toBe(true);
  });

  it('always emits Token first, in double quotes', () => {
    const header = buildAuthHeader({ token: 'abc123' });
    expect(header).toBe('Authorization: MediaBrowser Token="abc123"');
  });

  it('emits Client, Device, DeviceId, Version in that order with comma separators', () => {
    const header = buildAuthHeader({
      token: 'tok',
      client: 'JellyTunes',
      device: 'my-laptop',
      deviceId: 'dev-id-1',
      version: '0.6.0',
    });
    expect(header).toBe(
      'Authorization: MediaBrowser Token="tok", Client="JellyTunes", Device="my-laptop", DeviceId="dev-id-1", Version="0.6.0"',
    );
  });

  it('omits every optional field when not provided (just Token)', () => {
    expect(buildAuthHeader({ token: 'tok' })).toBe(
      'Authorization: MediaBrowser Token="tok"',
    );
  });

  it('omits Client when not provided but still emits Device/Version', () => {
    const header = buildAuthHeader({ token: 'tok', device: 'laptop', version: '1.0.0' });
    expect(header).toBe(
      'Authorization: MediaBrowser Token="tok", Device="laptop", Version="1.0.0"',
    );
  });

  it('escapes embedded double quotes in token by stripping them', () => {
    // Jellyfin tokens are alphanumeric, but the field is `field="..."` quoted — any
    // embedded quote would terminate the value mid-header. Defensive default: drop them.
    const header = buildAuthHeader({ token: 'tok"with"quotes' });
    expect(header).toBe('Authorization: MediaBrowser Token="tokwithquotes"');
    expect(header.split('"').length).toBe(3); // exactly one value pair
  });

  it('escapes embedded double quotes in Device and Version', () => {
    const header = buildAuthHeader({
      token: 't',
      device: 'my"laptop',
      version: '1.0"beta',
    });
    expect(header).toBe('Authorization: MediaBrowser Token="t", Device="mylaptop", Version="1.0beta"');
  });

  it('exposes default constants for callers to apply at their boundary', () => {
    // The helper itself does NOT auto-apply defaults — bare-token input renders
    // a bare-token header. Callers (renderer/main) are responsible for filling
    // in client/device from these constants.
    expect(CLIENT_NAME_DEFAULT).toBe('JellyTunes');
    expect(DEFAULT_DEVICE_NAME).toBe('Unknown');
    const header = buildAuthHeader({ token: 'tok', version: '1.0' });
    expect(header).toBe('Authorization: MediaBrowser Token="tok", Version="1.0"');
  });

  it('treats empty string DeviceId as omitted (no DeviceId field emitted)', () => {
    // DeviceId being empty means we don't yet have a stable id; rendering the field
    // with "" confuses Jellyfin and creates a phantom device on every launch.
    const header = buildAuthHeader({ token: 'tok', deviceId: '', device: 'x' });
    expect(header).toBe('Authorization: MediaBrowser Token="tok", Device="x"');
  });
});

describe('parseAuthHeader', () => {
  it('round-trips a header built with buildAuthHeader', () => {
    const built = buildAuthHeader({
      token: 'abc',
      client: 'JellyTunes',
      device: 'lap',
      deviceId: 'id-1',
      version: '0.6.0',
    });
    expect(parseAuthHeader(built)).toEqual({
      token: 'abc',
      client: 'JellyTunes',
      device: 'lap',
      deviceId: 'id-1',
      version: '0.6.0',
    });
  });

  it('parses the bare-Token shape', () => {
    expect(parseAuthHeader('Authorization: MediaBrowser Token="abc"')).toEqual({
      token: 'abc',
    });
  });

  it('returns null on a malformed header (no MediaBrowser prefix)', () => {
    expect(parseAuthHeader('Bearer abc')).toBeNull();
  });

  it('returns null when Token field is missing', () => {
    expect(parseAuthHeader('Authorization: MediaBrowser Client="x"')).toBeNull();
  });
});
