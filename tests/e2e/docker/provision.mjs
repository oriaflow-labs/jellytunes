import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAuthHeader,
  AUTH_CLIENT,
  AUTH_DEVICE,
  AUTH_DEVICE_ID,
  AUTH_VERSION,
} from '../support/auth-headers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'library.json'), 'utf8'));
const URL_BASE = process.env.JELLYFIN_URL ?? 'http://127.0.0.1:8096';
const VERSION = process.env.JELLYFIN_VERSION; // e.g. "v11" | "v12" | undefined
const OUT_FILE = VERSION
  ? join(HERE, '..', `.server.${VERSION}.json`)
  : join(HERE, '..', '.server.json');
const USER = 'e2e';
const PASS = 'e2e-password';
// Identifies the e2e harness on Jellyfin's active-devices dashboard.
// Stable per host so re-provisions don't register a new phantom device.
const CLIENT_META = {
  client: AUTH_CLIENT,
  device: AUTH_DEVICE,
  deviceId: AUTH_DEVICE_ID,
  version: AUTH_VERSION,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {
    Authorization: buildAuthHeader({ token, ...CLIENT_META }),
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${URL_BASE}/System/Info/Public`);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      // Verify response is valid JSON, not "Jellyfin Server is loading" placeholder
      JSON.parse(text);
      // /Startup/Configuration without auth returns 401 once the wizard is
      // open, and 503 while the server is still bootstrapping (notably v12
      // runs schema migrations on first boot). Wait until we get anything
      // but 503 before declaring the server ready.
      const wizard = await fetch(`${URL_BASE}/Startup/Configuration`);
      if (wizard.status !== 503) return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`Jellyfin never became reachable at ${URL_BASE}`);
}

async function runWizard() {
  await req('/Startup/Configuration', {
    method: 'POST',
    body: { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' },
  });
  await req('/Startup/User');
  await req('/Startup/User', { method: 'POST', body: { Name: USER, Password: PASS } });
  await req('/Startup/RemoteAccess', {
    method: 'POST',
    body: { EnableRemoteAccess: true, EnableAutomaticPortMapping: false },
  });
  await req('/Startup/Complete', { method: 'POST' });
}

async function authenticate() {
  const res = await req('/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: USER, Pw: PASS },
  });
  return { token: res.AccessToken, userId: res.User.Id };
}

async function addLibrary(token) {
  await req('/Library/VirtualFolders?name=music&collectionType=music&refreshLibrary=true', {
    method: 'POST',
    token,
    body: {
      LibraryOptions: { PathInfos: [{ Path: '/media/music' }], EnableRealtimeMonitor: false },
    },
  });
}

async function waitForScan(token, userId) {
  // Wait for files to be registered
  for (let i = 0; i < 180; i++) {
    const res = await req(`/Items?userId=${userId}&IncludeItemTypes=Audio&Recursive=true&Limit=0`, {
      token,
    });
    if (res.TotalRecordCount >= LIB.trackCount) break;
    await sleep(1000);
  }

  // Wait for metadata extraction (artists must be populated)
  for (let i = 0; i < 180; i++) {
    const artistRes = await req(`/Artists?userId=${userId}&Limit=0`, { token });
    if (artistRes.TotalRecordCount >= LIB.artists.length) {
      // Verify a sample track has extracted metadata (non-empty Artists array)
      const trackRes = await req(
        `/Items?userId=${userId}&IncludeItemTypes=Audio&Recursive=true&Limit=1`,
        { token },
      );
      if (
        trackRes.Items.length > 0 &&
        trackRes.Items[0].Artists &&
        trackRes.Items[0].Artists.length > 0
      ) {
        return;
      }
    }
    await sleep(1000);
  }
  throw new Error(
    `Library metadata never extracted: expected ${LIB.artists.length} artists, got fewer`,
  );
}

async function createPlaylist(token, userId) {
  const res = await req(
    `/Items?userId=${userId}&IncludeItemTypes=Audio&Recursive=true&SortBy=SortName&Limit=3`,
    { token },
  );
  const ids = res.Items.map((i) => i.Id);
  await req('/Playlists', {
    method: 'POST',
    token,
    body: { Name: LIB.playlistName, Ids: ids, UserId: userId, MediaType: 'Audio' },
  });
}

async function createApiKey(token) {
  await req('/Auth/Keys?App=jellytunes-e2e', { method: 'POST', token });
  const keys = await req('/Auth/Keys', { token });
  const key = keys.Items.find((k) => k.AppName === 'jellytunes-e2e');
  if (!key) throw new Error('API key was created but could not be read back');
  return key.AccessToken;
}

await waitForServer();
await runWizard();
const { token, userId } = await authenticate();
await addLibrary(token);
await waitForScan(token, userId);
await createPlaylist(token, userId);
const apiKey = await createApiKey(token);

// The throwaway build container listens on its internal port (8096), but the
// per-version docker-compose file maps a different host port (e.g. v12 maps
// 8097:8096). Provision against the internal port so requests reach the API
// inside the container, then rewrite the URL written to .server.<v>.json to
// the host port the compose file will expose — that's the address the test
// runner will hit when it boots the final image.
const FINAL_URL = (() => {
  if (!VERSION) return URL_BASE;
  if (VERSION === 'v11') return 'http://127.0.0.1:8096';
  if (VERSION === 'v12') return 'http://127.0.0.1:8097';
  return URL_BASE;
})();

writeFileSync(
  OUT_FILE,
  `${JSON.stringify({ url: FINAL_URL, apiKey, userId, username: USER, password: PASS }, null, 2)}\n`,
);
console.log(`Provisioned. Wrote ${OUT_FILE} (provisioned via ${URL_BASE}, final URL ${FINAL_URL})`);
