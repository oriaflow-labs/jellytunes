/**
 * Jellyfin auth header helpers.
 *
 * ORAIN-0562: Jellyfin is removing legacy `X-Emby-Token` / `X-MediaBrowser-Token`
 * headers. Every authenticated request must use
 *   Authorization: MediaBrowser Token="...", Client="...", Device="...", DeviceId="...", Version="..."
 * `Token` is the only mandatory field; the rest identify the app on the
 * server's dashboard. Only `DeviceId` must be stable across launches — a fresh
 * value on every boot would create a phantom device per launch on the server's
 * "Active devices" list.
 *
 * Reference: https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
 */

/** Client identifier shown on the Jellyfin dashboard's active-devices list. */
export const CLIENT_NAME_DEFAULT = 'JellyTunes';

/**
 * Fallback device label when the OS hostname isn't available (e.g. some sandboxes).
 * Not required to be stable — only `DeviceId` is.
 */
export const DEFAULT_DEVICE_NAME = 'Unknown';

export interface BuildAuthHeaderInput {
  token: string;
  client?: string;
  device?: string;
  deviceId?: string;
  version?: string;
}

/**
 * Build a single `Authorization` header value for Jellyfin.
 *
 * Format: `Authorization: MediaBrowser Token="<token>"[, Field="<value>"]...`
 * Fields with empty/omitted values are skipped — emitting `DeviceId=""` would
 * create a phantom device on the server's dashboard.
 */
export function buildAuthHeader(input: BuildAuthHeaderInput): string {
  const parts: string[] = [`Token="${sanitizeValue(input.token)}"`];

  // Emit each optional field only when the caller provides it. We deliberately
  // do NOT fall back to module-level defaults (CLIENT_NAME_DEFAULT, etc.)
  // here — defaults are the caller's responsibility so a token-only input
  // renders a token-only header. Applying defaults here would also emit
  // Device="Unknown" on bare-token calls, which looks like a misconfigured
  // client on the server dashboard.
  if (input.client) parts.push(`Client="${sanitizeValue(input.client)}"`);
  if (input.device) parts.push(`Device="${sanitizeValue(input.device)}"`);
  // DeviceId MUST be omitted when empty, never rendered as "" — a blank
  // DeviceId would register a new device on every launch.
  if (input.deviceId) parts.push(`DeviceId="${sanitizeValue(input.deviceId)}"`);
  if (input.version) parts.push(`Version="${sanitizeValue(input.version)}"`);

  return `Authorization: MediaBrowser ${parts.join(', ')}`;
}

/**
 * Strip the double quotes that would otherwise terminate the field value mid-header.
 * Jellyfin's parser splits on `"` so an unescaped embedded quote would corrupt
 * everything that follows.
 */
function sanitizeValue(value: string): string {
  return value.replace(/"/g, '');
}

export interface ParsedAuthHeader {
  token: string;
  client?: string;
  device?: string;
  deviceId?: string;
  version?: string;
}

/**
 * Inverse of `buildAuthHeader`, exposed for tests and debug tooling.
 * Returns null when the input isn't a MediaBrowser header (no Token field,
 * or wrong prefix).
 */
export function parseAuthHeader(header: string): ParsedAuthHeader | null {
  const prefix = 'Authorization: MediaBrowser ';
  if (!header.startsWith(prefix)) return null;

  const body = header.slice(prefix.length);
  const fields: ParsedAuthHeader = { token: '' };
  let foundToken = false;

  // Match `Field="value"` pairs separated by commas. Regex anchored on the
  // quoted value to keep the parser tight against malformed input.
  const re = /([A-Za-z]+)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key === 'Token') {
      fields.token = value;
      foundToken = true;
    } else if (key === 'Client') {
      fields.client = value;
    } else if (key === 'Device') {
      fields.device = value;
    } else if (key === 'DeviceId') {
      fields.deviceId = value;
    } else if (key === 'Version') {
      fields.version = value;
    }
  }

  return foundToken ? fields : null;
}
