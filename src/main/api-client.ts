/**
 * ORAIN-0562: Sugar around `createApiClient` that injects the Jellyfin
 * auth identity (client/version/device/deviceId) so call sites in
 * `main/index.ts` don't all repeat the same setup.
 *
 * Lives in `main/` because `deviceId` and `app.getVersion()` are only
 * meaningful inside the Electron main process.
 */
import { app } from 'electron';
import * as os from 'os';
import { createApiClient, type ApiClientConfig, type ApiIdentity } from '../sync';
import { getOrCreateDeviceId } from './device-id';
import { CLIENT_NAME_DEFAULT } from '../shared/auth-headers';

/** Identity shared across every API client we instantiate. Resolved lazily. */
function identity(): ApiIdentity {
  const device = os.hostname() || 'Unknown';
  return {
    client: CLIENT_NAME_DEFAULT,
    device,
    deviceId: getOrCreateDeviceId(),
    version: app.getVersion(),
  };
}

export function createMainApiClient(config: Omit<ApiClientConfig, 'identity'>): ReturnType<typeof createApiClient> {
  return createApiClient({ ...config, identity: identity() });
}
