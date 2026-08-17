import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '.server.json');
const LIB = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'library.json'), 'utf8'));
const URL_BASE = process.env.JELLYFIN_URL ?? 'http://127.0.0.1:8096';
const USER = 'e2e';
const PASS = 'e2e-password';
const AUTH_HEADER =
  'MediaBrowser Client="jellytunes-e2e", Device="ci", DeviceId="jellytunes-e2e", Version="1.0.0"';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'X-Emby-Authorization': AUTH_HEADER };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Emby-Token'] = token;
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
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${URL_BASE}/System/Info/Public`);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      // Verify response is valid JSON, not "Jellyfin Server is loading" placeholder
      JSON.parse(text);
      return;
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

writeFileSync(OUT, `${JSON.stringify({ url: URL_BASE, apiKey, userId }, null, 2)}\n`);
console.log(`Provisioned. Wrote ${OUT}`);
