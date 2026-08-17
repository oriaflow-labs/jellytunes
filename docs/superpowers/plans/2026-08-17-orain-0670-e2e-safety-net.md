# ORAIN-0670 — E2E Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silently-skipping Cucumber BDD suite with a Playwright suite that drives the real Electron app against a containerised Jellyfin and asserts the resulting file tree on disk.

**Architecture:** A one-off `rebuild.sh` provisions a throwaway Jellyfin container over its HTTP API and `docker commit`s the result into a local image, so `docker compose up -d` is a seconds-long cold start. Deterministic music fixtures are generated with the FFmpeg binary already vendored in `node_modules`. Playwright launches the packaged `dist/main/index.js` through `_electron.launch`, isolating every scenario with its own `--user-data-dir` and its own temp destination folder, and stubs the native folder picker by monkey-patching `dialog.showOpenDialog` in the main process via `electronApp.evaluate()` — no test-only code lands in `src/`.

**Tech Stack:** Playwright Test (`@playwright/test`, already a devDependency), Docker + `jellyfin/jellyfin:10.10.3`, `@ffmpeg-installer/ffmpeg` (already a production dependency), `@ffprobe-installer/ffprobe` (new devDependency), Node 20 global `fetch`.

**Spec:** `/Users/user/workspace/orainlabs/specs/orain-0670-spec.md`

## Global Constraints

- Playwright only. No Cucumber, no Gherkin, no `ts-node` — `@playwright/test` transpiles TypeScript natively.
- No test-only code in `src/`. `git diff src/` must be empty at the end of Task 7. The folder picker is stubbed from the test process, not from production code.
- No test ever skips. If Jellyfin is unreachable, `globalSetup` throws and the whole run fails.
- Every scenario gets its own `--user-data-dir` and its own destination directory; two consecutive suite runs produce identical results.
- Fixtures are generated, never committed. `tests/e2e/fixtures/music/` and `tests/e2e/.server.json` are gitignored.
- The Jellyfin version is pinned to `jellyfin/jellyfin:10.10.3` in exactly one place: `tests/e2e/docker/rebuild.sh`.
- Vitest's `include` in `vitest.config.ts` is an explicit allowlist that does not cover `tests/e2e/**`. Do not add it — the E2E suite must stay out of `pnpm test`, which runs on Ubuntu and Windows CI where Docker-backed Jellyfin is not available.
- Library mount point inside the container is `/media/music`. This value is load-bearing; see the Path Derivation note below.

## Path Derivation — read before writing any disk assertion

`detectServerRootPath` (`src/sync/sync-api.ts:873`) does **not** compute a common prefix. It drops the last four path components of each track path — filename, album dir, artist dir, **library dir** — and takes the common prefix of those candidates. The library folder name is therefore preserved in the destination by design.

With the library mounted at `/media/music`, a track at:

```
/media/music/Test Artist A/Album Alpha/01 - Alpha One.flac
```

splits into `['', 'media', 'music', 'Test Artist A', 'Album Alpha', '01 - Alpha One.flac']`. Dropping the last four leaves `['', 'media']` → `serverRootPath = "/media/"`, so the destination path is:

```
<destDir>/music/Test Artist A/Album Alpha/01 - Alpha One.flac
```

**The spec's AC for E2 omits the leading `music/` segment and is wrong.** The correct expected tree is the one above. Task 4 asserts the correct tree; the spec AC needs amending to match. Do not "fix" this by stripping the segment — the behaviour is intentional and is covered by `src/sync/sync-config.test.ts`.

---

### Task 1: Deterministic music fixtures

**Files:**

- Create: `tests/e2e/fixtures/generate.mjs`
- Create: `tests/e2e/fixtures/library.json`
- Modify: `.gitignore`
- Modify: `package.json` (scripts)

**Interfaces:**

- Consumes: nothing.
- Produces: `tests/e2e/fixtures/music/` on disk; `tests/e2e/fixtures/library.json` exporting the expected library shape consumed by Tasks 2, 3 and 4. Named export `MUSIC_ROOT: string` and `TRACKS: Track[]` from `generate.mjs`, where `Track = { dir: string; file: string; title: string; artist: string; albumArtist: string; album: string | null; track: number; kind: 'sine' | 'noise' }`.

The library is 3 artists / 4 albums / 10 tracks / 1 playlist. Album Gamma uses 120-second white noise so that Task 7 has a real window in which to cancel a sync in progress; everything else is a 2-second sine tone. White noise needs an explicit `seed`, otherwise generation is not reproducible.

- [ ] **Step 1: Write the fixture manifest**

Create `tests/e2e/fixtures/library.json`:

```json
{
  "artists": ["Test Artist A", "Test Artist B", "Test Artist C"],
  "albums": ["Album Alpha", "Album Beta", "Album Delta", "Album Gamma"],
  "trackCount": 10,
  "playlistName": "Test Playlist",
  "albumAlphaTree": [
    "music/Test Artist A/Album Alpha/01 - Alpha One.flac",
    "music/Test Artist A/Album Alpha/02 - Alpha Two.flac",
    "music/Test Artist A/Album Alpha/03 - Alpha Three.flac"
  ]
}
```

- [ ] **Step 2: Write the generator**

Create `tests/e2e/fixtures/generate.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MUSIC_ROOT = join(HERE, 'music');

/** Album Gamma is long white noise so a sync can be cancelled mid-flight (Task 7). */
export const TRACKS = [
  {
    dir: 'Test Artist A/Album Alpha',
    file: '01 - Alpha One.flac',
    title: 'Alpha One',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Alpha',
    file: '02 - Alpha Two.flac',
    title: 'Alpha Two',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 2,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Alpha',
    file: '03 - Alpha Three.flac',
    title: 'Alpha Three',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 3,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Beta',
    file: '01 - Beta One.mp3',
    title: 'Beta One',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Beta',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Beta',
    file: '02 - Beta Two.mp3',
    title: 'Beta Two',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Beta',
    track: 2,
    kind: 'sine',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '01 - Gamma One.flac',
    title: 'Gamma One',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 1,
    kind: 'noise',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '02 - Gamma Two.flac',
    title: 'Gamma Two',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 2,
    kind: 'noise',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '03 - Gamma Three.flac',
    title: 'Gamma Three',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 3,
    kind: 'noise',
  },
  {
    dir: 'Various Artists/Album Delta',
    file: '01 - Delta One.mp3',
    title: 'Delta One',
    artist: 'Test Artist A',
    albumArtist: 'Various Artists',
    album: 'Album Delta',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Various Artists/Album Delta',
    file: '02 - Delta Two.mp3',
    title: 'Delta Two',
    artist: 'Test Artist C',
    albumArtist: 'Various Artists',
    album: 'Album Delta',
    track: 2,
    kind: 'sine',
  },
];

function sourceArgs(track, index) {
  // seed is fixed so white noise is byte-reproducible across runs
  return track.kind === 'noise'
    ? ['-f', 'lavfi', '-i', `anoisesrc=seed=${42 + index}:duration=120:sample_rate=44100`]
    : ['-f', 'lavfi', '-i', `sine=frequency=${220 + index * 20}:duration=2:sample_rate=44100`];
}

function encode(track, index) {
  const out = join(MUSIC_ROOT, track.dir, track.file);
  mkdirSync(dirname(out), { recursive: true });

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...sourceArgs(track, index),
    // -bitexact drops encoder/vendor strings, which otherwise vary by build
    '-bitexact',
    '-map_metadata',
    '-1',
    '-metadata',
    `title=${track.title}`,
    '-metadata',
    `artist=${track.artist}`,
    '-metadata',
    `album_artist=${track.albumArtist}`,
    '-metadata',
    `track=${track.track}`,
  ];

  // Album Gamma intentionally carries no ALBUM tag: it exercises the
  // AlbumId -> MusicAlbum resolution path the app relies on.
  if (track.album) args.push('-metadata', `album=${track.album}`);

  if (out.endsWith('.mp3')) args.push('-codec:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0');
  else args.push('-codec:a', 'flac', '-compression_level', '5');

  args.push(out);
  execFileSync(ffmpeg.path, args);
}

export function generate() {
  rmSync(MUSIC_ROOT, { recursive: true, force: true });
  TRACKS.forEach(encode);
  return MUSIC_ROOT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Generated ${TRACKS.length} tracks in ${generate()}`);
}
```

- [ ] **Step 3: Wire the script and gitignore**

In `package.json` `scripts`, add:

```json
"test:e2e:fixtures": "node tests/e2e/fixtures/generate.mjs"
```

Append to `.gitignore`:

```
tests/e2e/fixtures/music/
tests/e2e/.server.json
tests/e2e/report/
tests/e2e/.artifacts/
```

- [ ] **Step 4: Run the generator and verify the tree**

Run: `pnpm test:e2e:fixtures && find tests/e2e/fixtures/music -type f | sort`

Expected: 10 files, matching the `dir`/`file` pairs in `TRACKS`.

- [ ] **Step 5: Verify determinism**

Run:

```bash
pnpm test:e2e:fixtures
find tests/e2e/fixtures/music -type f -exec shasum -a 256 {} \; | sort > /tmp/jt-fx-1.txt
pnpm test:e2e:fixtures
find tests/e2e/fixtures/music -type f -exec shasum -a 256 {} \; | sort > /tmp/jt-fx-2.txt
diff /tmp/jt-fx-1.txt /tmp/jt-fx-2.txt && echo DETERMINISTIC
```

Expected: `DETERMINISTIC`, no diff output.

If the digests differ, the cause is almost always a metadata field FFmpeg still writes. Re-run one file with `ffprobe -show_format` on both copies and diff the tag list — do not paper over it by relaxing the check.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/fixtures/generate.mjs tests/e2e/fixtures/library.json .gitignore package.json
git commit -m "test(e2e): add deterministic FFmpeg music fixtures"
```

---

### Task 2: Provisioned Jellyfin image

**Files:**

- Create: `tests/e2e/docker/provision.mjs`
- Create: `tests/e2e/docker/rebuild.sh`
- Create: `tests/e2e/docker-compose.yml`

**Interfaces:**

- Consumes: `MUSIC_ROOT` and `TRACKS` from Task 1; `library.json`.
- Produces: local Docker image `jellytunes-e2e:1`; `tests/e2e/.server.json` shaped `{ url: string; apiKey: string; userId: string }`.

Provisioning runs against a live throwaway container and the result is frozen with `docker commit`, because Jellyfin's setup wizard is an HTTP flow and cannot run during a `docker build`.

- [ ] **Step 1: Write the provisioning script**

Create `tests/e2e/docker/provision.mjs`:

```js
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
      await fetch(`${URL_BASE}/System/Info/Public`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
      });
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
  for (let i = 0; i < 180; i++) {
    const res = await req(`/Items?userId=${userId}&IncludeItemTypes=Audio&Recursive=true&Limit=0`, {
      token,
    });
    if (res.TotalRecordCount >= LIB.trackCount) return;
    await sleep(1000);
  }
  throw new Error(`Library scan never reached ${LIB.trackCount} audio items`);
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
```

- [ ] **Step 2: Write the rebuild script**

Create `tests/e2e/docker/rebuild.sh`:

```bash
#!/usr/bin/env bash
# Provisions a throwaway Jellyfin over HTTP and freezes the result into a
# local image, so `docker compose up -d` is a seconds-long cold start.
# Re-run this after bumping JELLYFIN_IMAGE or changing the fixtures.
set -euo pipefail

JELLYFIN_IMAGE="jellyfin/jellyfin:10.10.3"
BUILD_NAME="jellytunes-e2e-build"
TARGET_IMAGE="jellytunes-e2e:1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MUSIC="$ROOT/tests/e2e/fixtures/music"

echo "==> Generating fixtures"
node "$ROOT/tests/e2e/fixtures/generate.mjs"

echo "==> Starting throwaway $JELLYFIN_IMAGE"
docker rm -f "$BUILD_NAME" >/dev/null 2>&1 || true
docker run -d --name "$BUILD_NAME" \
  -p 8096:8096 \
  -v "$MUSIC:/media/music:ro" \
  "$JELLYFIN_IMAGE" >/dev/null

cleanup() { docker rm -f "$BUILD_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Provisioning over HTTP"
node "$ROOT/tests/e2e/docker/provision.mjs"

echo "==> Freezing into $TARGET_IMAGE"
docker commit "$BUILD_NAME" "$TARGET_IMAGE" >/dev/null

echo "==> Done. Start it with:"
echo "    docker compose -f tests/e2e/docker-compose.yml up -d"
```

Make it executable: `chmod +x tests/e2e/docker/rebuild.sh`

- [ ] **Step 3: Write the compose file**

Create `tests/e2e/docker-compose.yml`:

```yaml
services:
  jellyfin:
    image: jellytunes-e2e:1
    container_name: jellytunes-e2e
    ports:
      - '8096:8096'
    volumes:
      - ./fixtures/music:/media/music:ro
    healthcheck:
      test: ['CMD', 'curl', '-fsS', 'http://127.0.0.1:8096/System/Info/Public']
      interval: 2s
      timeout: 3s
      retries: 15
```

- [ ] **Step 4: Build the image**

Run: `bash tests/e2e/docker/rebuild.sh`

Expected: ends with `Done.`, and `tests/e2e/.server.json` exists containing a non-empty `apiKey`.

- [ ] **Step 5: Verify cold start and library contents**

Run:

```bash
docker compose -f tests/e2e/docker-compose.yml down
time docker compose -f tests/e2e/docker-compose.yml up -d
node -e '
const c = require("./tests/e2e/.server.json");
(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(c.url + "/System/Info", { headers: { "X-Emby-Token": c.apiKey } });
      if (r.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  const r = await fetch(c.url + "/Items?userId=" + c.userId + "&IncludeItemTypes=Audio&Recursive=true&Limit=0", { headers: { "X-Emby-Token": c.apiKey } });
  const j = await r.json();
  console.log("audio items:", j.TotalRecordCount);
})();'
```

Expected: `audio items: 10`, and the `up -d` plus readiness loop completes in under 20 seconds.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/docker/provision.mjs tests/e2e/docker/rebuild.sh tests/e2e/docker-compose.yml
git commit -m "test(e2e): add provisioned Jellyfin container for E2E"
```

---

### Task 3: Playwright harness and E1 (connection)

**Files:**

- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/support/server.ts`
- Create: `tests/e2e/support/global-setup.ts`
- Create: `tests/e2e/support/app.ts`
- Create: `tests/e2e/specs/e1-connection.spec.ts`
- Modify: `package.json` (scripts)

**Interfaces:**

- Consumes: `tests/e2e/.server.json`, `tests/e2e/fixtures/library.json`, built `dist/main/index.js`.
- Produces:
  - `readServerConfig(): { url: string; apiKey: string; userId: string }` from `support/server.ts`
  - `test` and `expect` from `support/app.ts`, where `test` provides fixtures `app: ElectronApplication`, `page: Page`, `userDataDir: string`, `destDir: string`
  - `login(page: Page): Promise<void>` from `support/app.ts`

The harness and the first scenario ship together: a harness with nothing driving it cannot be reviewed.

- [ ] **Step 1: Write the server config reader and fail-fast preflight**

Create `tests/e2e/support/server.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServerConfig {
  url: string;
  apiKey: string;
  userId: string;
}

const CONFIG_PATH = join(__dirname, '..', '.server.json');

const REBUILD_HINT =
  'Run: bash tests/e2e/docker/rebuild.sh\n' +
  'Then: docker compose -f tests/e2e/docker-compose.yml up -d';

export function readServerConfig(): ServerConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. The test Jellyfin has never been provisioned.\n${REBUILD_HINT}`,
    );
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ServerConfig;
}

export async function assertServerReachable(): Promise<void> {
  const { url, apiKey } = readServerConfig();
  let lastError = 'no attempt made';
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${url}/System/Info`, { headers: { 'X-Emby-Token': apiKey } });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Test Jellyfin unreachable at ${url} (${lastError}).\n${REBUILD_HINT}`);
}
```

Create `tests/e2e/support/global-setup.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertServerReachable } from './server';

export default async function globalSetup(): Promise<void> {
  const mainEntry = join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js');
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing ${mainEntry}. Run: pnpm build`);
  }
  await assertServerReachable();
}
```

- [ ] **Step 2: Write the Electron fixture**

Create `tests/e2e/support/app.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readServerConfig } from './server';

interface AppFixtures {
  userDataDir: string;
  destDir: string;
  app: ElectronApplication;
  page: Page;
}

export const test = base.extend<AppFixtures>({
  // Electron honours Chromium's --user-data-dir, which relocates
  // app.getPath('userData') and with it jellytunes.db, session.enc and
  // preferences.json. One temp dir per scenario means zero shared state.
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'jt-e2e-userdata-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  destDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'jt-e2e-dest-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  app: async ({ userDataDir }, use) => {
    const app = await electron.launch({
      args: [
        join(__dirname, '..', '..', '..', 'dist', 'main', 'index.js'),
        `--user-data-dir=${userDataDir}`,
      ],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    await use(app);
    await app.close();
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';

export async function login(page: Page): Promise<void> {
  const { url, apiKey } = readServerConfig();
  await page.getByTestId('auth-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('server-url-input').fill(url);
  await page.getByTestId('api-key-input').fill(apiKey);
  await page.getByTestId('connect-button').click();

  const userSelectorAppeared = await page
    .getByTestId('user-selector-screen')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (userSelectorAppeared) {
    await page.getByTestId('user-option').first().click();
  }

  await page.getByTestId('library-content').waitFor({ state: 'visible', timeout: 30_000 });
}
```

- [ ] **Step 3: Write the Playwright config and script**

Create `tests/e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Scenarios share one Jellyfin and one Docker port; serial keeps them honest.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './support/global-setup.ts',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  outputDir: './.artifacts',
});
```

In `package.json` `scripts`, add:

```json
"test:e2e": "pnpm build && playwright test --config tests/e2e/playwright.config.ts"
```

- [ ] **Step 4: Write the failing E1 spec**

Create `tests/e2e/specs/e1-connection.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { artists: string[] };

test('E1: connecting with URL and API key loads the library', async ({ page }) => {
  await login(page);

  const items = page.getByTestId('library-item');
  await expect(items).toHaveCount(library.artists.length);

  for (const artist of library.artists) {
    await expect(items.filter({ hasText: artist })).toHaveCount(1);
  }
});
```

- [ ] **Step 5: Run E1 and verify it fails for the right reason**

Run: `pnpm test:e2e -- --grep E1`

Expected: FAIL. Before writing any fix, read the failure. Two outcomes are legitimate at this point:

- `Missing .../dist/main/index.js` or `Test Jellyfin unreachable` — the preflight works; start the container and re-run.
- A count mismatch on `library-item` — the harness works and the assertion is doing its job.

Any other failure (app never opens a window, `auth-screen` never appears) is a harness defect. Fix it before moving on.

- [ ] **Step 6: Make E1 pass**

Start the container if it is not up:

```bash
docker compose -f tests/e2e/docker-compose.yml up -d
```

Run: `pnpm test:e2e -- --grep E1`

Expected: PASS.

If the artist count is off, do not edit the assertion to match reality. Inspect what Jellyfin actually returns (`/Artists?userId=...`) and fix the fixture tags in Task 1 — the assertion encodes the intended library shape.

- [ ] **Step 7: Verify the no-skip guarantee**

Run:

```bash
docker compose -f tests/e2e/docker-compose.yml down
pnpm test:e2e -- --grep E1; echo "exit=$?"
docker compose -f tests/e2e/docker-compose.yml up -d
```

Expected: non-zero exit, and the output names `bash tests/e2e/docker/rebuild.sh`. Zero skipped tests.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/playwright.config.ts tests/e2e/support tests/e2e/specs/e1-connection.spec.ts package.json
git commit -m "test(e2e): add Playwright harness and connection scenario"
```

---

### Task 4: E2 — sync an album and assert the file tree

**Files:**

- Create: `tests/e2e/support/actions.ts`
- Create: `tests/e2e/specs/e2-sync.spec.ts`

**Interfaces:**

- Consumes: `test`, `expect`, `login` from `support/app.ts`.
- Produces, from `support/actions.ts`:
  - `stubFolderPicker(app: ElectronApplication, folder: string): Promise<void>`
  - `addDestination(page: Page, app: ElectronApplication, folder: string): Promise<void>`
  - `selectAlbum(page: Page, name: string): Promise<void>`
  - `listTree(root: string): string[]`

- [ ] **Step 1: Write the action helpers**

Create `tests/e2e/support/actions.ts`:

```ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

/**
 * Playwright cannot drive native OS dialogs, so we replace the main-process
 * handler instead. This lives in the test process — src/ stays untouched.
 */
export async function stubFolderPicker(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(async ({ dialog }, chosen) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, folder);
}

export async function addDestination(
  page: Page,
  app: ElectronApplication,
  folder: string,
): Promise<void> {
  await stubFolderPicker(app, folder);
  await page.getByTestId('add-folder-button').click();
  const entry = page.locator(`[data-testid="device-item"][data-device-path="${folder}"]`);
  await entry.waitFor({ state: 'visible', timeout: 15_000 });
  await entry.click();
  await page.getByTestId('sync-panel').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function selectAlbum(page: Page, name: string): Promise<void> {
  await page.getByTestId('tab-albums').click();
  const item = page.getByTestId('library-item').filter({ hasText: name });
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
}

/** Recursive file listing, relative to root, sorted. Directories are not listed. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}
```

- [ ] **Step 2: Write the failing E2 spec**

Create `tests/e2e/specs/e2-sync.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'library.json'), 'utf8'),
) as { albumAlphaTree: string[] };

test('E2: syncing an album writes the expected tree to the destination', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
  await addDestination(page, app, destDir);
  await selectAlbum(page, 'Album Alpha');

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });

  // The preview renders an em dash while track counts are still estimated,
  // so asserting the exact string also waits out the estimate.
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await expect.poll(() => listTree(destDir), { timeout: 120_000 }).toEqual(library.albumAlphaTree);
});
```

- [ ] **Step 3: Run E2 and verify it fails**

Run: `pnpm test:e2e -- --grep E2`

Expected: FAIL on the tree comparison, with Playwright printing the actual array.

- [ ] **Step 4: Reconcile the expected tree with reality**

Read the actual array from the failure output. Compare it against the `albumAlphaTree` in `library.json` and the Path Derivation note at the top of this plan.

- If the only difference is that the app also wrote sidecar files (a manifest, a cover image, a `.jellytunes` marker), **add them to `albumAlphaTree`**. Do not filter them out of `listTree` — a sidecar appearing or disappearing is exactly the kind of regression this scenario exists to catch.
- If the audio paths themselves differ from `music/Test Artist A/Album Alpha/…`, re-read the Path Derivation note before changing anything. A missing `music/` segment means the container mount is not `/media/music`; fix the mount in `docker-compose.yml` and `provision.mjs`, then re-run `rebuild.sh`.

Update `library.json` accordingly.

- [ ] **Step 5: Run E2 and verify it passes**

Run: `pnpm test:e2e -- --grep E2`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/support/actions.ts tests/e2e/specs/e2-sync.spec.ts tests/e2e/fixtures/library.json
git commit -m "test(e2e): assert destination file tree after album sync"
```

---

### Task 5: E3 — re-sync is a no-op

**Files:**

- Create: `tests/e2e/specs/e3-resync.spec.ts`

**Interfaces:**

- Consumes: `test`, `expect`, `login`, `addDestination`, `selectAlbum`, `listTree`.
- Produces: nothing consumed by later tasks.

Both syncs happen inside one app session, so the standard per-scenario `destDir` and `userDataDir` fixtures are exactly what this scenario needs: the destination and the app's synced-track state in `jellytunes.db` both persist across the two syncs and are torn down afterwards.

- [ ] **Step 1: Write the failing E3 spec**

Create `tests/e2e/specs/e3-resync.spec.ts`:

```ts
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

test('E3: re-syncing the same selection copies nothing and leaves files untouched', async ({
  page,
  app,
  destDir,
}) => {
  await login(page);
  await addDestination(page, app, destDir);
  await selectAlbum(page, 'Album Alpha');

  // First sync
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();
  await expect.poll(() => listTree(destDir).length, { timeout: 120_000 }).toBeGreaterThan(0);

  const before = listTree(destDir).map((rel) => ({
    rel,
    mtimeMs: statSync(join(destDir, rel)).mtimeMs,
  }));

  // Second sync, identical selection
  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });

  await expect(page.getByTestId('preview-already-synced-section')).toContainText('3 tracks');
  await expect(page.getByTestId('preview-new-tracks-section')).toBeHidden();

  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await expect.poll(() => listTree(destDir), { timeout: 60_000 }).toEqual(before.map((f) => f.rel));

  for (const file of before) {
    expect(statSync(join(destDir, file.rel)).mtimeMs, `${file.rel} was rewritten`).toBe(
      file.mtimeMs,
    );
  }
});
```

- [ ] **Step 2: Run E3 and verify it fails or passes for the right reason**

Run: `pnpm test:e2e -- --grep E3`

Expected: this may pass first time — the diff logic already exists and is unit-tested. That is fine; the point is the app-level wiring.

If it fails on `preview-already-synced-section`, the second preview did not classify the tracks as synced. Check whether `sync:getSyncedTracks` is keyed on the destination path and whether the destination survived. Do not weaken the assertion to `toBeVisible()`.

If it fails only on `mtimeMs`, the app is rewriting identical files. That is a real regression finding — report it rather than relaxing the check.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/e3-resync.spec.ts
git commit -m "test(e2e): assert re-sync is a no-op"
```

---

### Task 6: E4 — FLAC to MP3 conversion

**Files:**

- Create: `tests/e2e/specs/e4-mp3.spec.ts`
- Modify: `package.json` (devDependencies)

**Interfaces:**

- Consumes: `test`, `expect`, `login`, `addDestination`, `selectAlbum`, `listTree`.
- Produces: nothing consumed by later tasks.

`ffprobe` is not currently vendored — `@ffmpeg-installer/ffmpeg` ships only `ffmpeg`. Add `@ffprobe-installer/ffprobe` as a devDependency rather than depending on a system binary, so the assertion does not silently vary with whatever is on `PATH`.

- [ ] **Step 1: Add the ffprobe devDependency**

Run: `pnpm add -D @ffprobe-installer/ffprobe`

- [ ] **Step 2: Write the failing E4 spec**

Create `tests/e2e/specs/e4-mp3.spec.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import ffprobe from '@ffprobe-installer/ffprobe';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

function codecOf(file: string): string {
  return execFileSync(ffprobe.path, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name',
    '-of',
    'default=nw=1:nk=1',
    file,
  ])
    .toString()
    .trim();
}

test('E4: the MP3 toggle converts FLAC sources to playable MP3', async ({ page, app, destDir }) => {
  await login(page);
  await addDestination(page, app, destDir);

  await page.getByTestId('mp3-toggle').click();
  await selectAlbum(page, 'Album Alpha');

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();
  await expect(page.getByTestId('sync-preview-modal')).toBeHidden();

  await expect
    .poll(() => listTree(destDir).filter((f) => f.endsWith('.mp3')).length, { timeout: 180_000 })
    .toBe(3);

  const tree = listTree(destDir);
  expect(tree.filter((f) => f.endsWith('.flac'))).toEqual([]);

  for (const rel of tree.filter((f) => f.endsWith('.mp3'))) {
    expect(codecOf(join(destDir, rel)), `${rel} is not a valid MP3`).toBe('mp3');
  }
});
```

- [ ] **Step 3: Run E4 and verify it fails**

Run: `pnpm test:e2e -- --grep E4`

Expected: FAIL if the toggle is not on before selection, or PASS if conversion already works end to end.

If it fails because the toggle had no effect, check whether `mp3-toggle` must be set before the preview is opened rather than before selection — `DeviceSyncPanel.tsx:525` owns the toggle and `SyncPreviewModal` receives `convertToMp3` as a prop. Move the click, do not remove the assertion.

- [ ] **Step 4: Run E4 and verify it passes**

Run: `pnpm test:e2e -- --grep E4`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/e4-mp3.spec.ts package.json pnpm-lock.yaml
git commit -m "test(e2e): assert FLAC to MP3 conversion produces valid MP3"
```

---

### Task 7: E5 — cancelling leaves nothing behind

**Files:**

- Create: `tests/e2e/specs/e5-cancel.spec.ts`

**Interfaces:**

- Consumes: `test`, `expect`, `login`, `addDestination`, `listTree`.
- Produces: nothing consumed by later tasks.

Album Gamma is 3 × 120 seconds of white noise precisely so this scenario has a window in which to press cancel. Conversion to MP3 is enabled to widen it further. Temp files are written to `os.tmpdir()` with the prefixes `jellytunes_` (`src/sync/temp-path.ts:16`) and `jt-` (`src/sync/sync-files.ts:558`), not to the destination — so the cleanup assertion has two halves.

The scenario fails loudly if the sync finished before the cancel landed. A cancellation test that silently passes because there was nothing to cancel is the exact failure mode this whole task exists to remove.

- [ ] **Step 1: Write the failing E5 spec**

Create `tests/e2e/specs/e5-cancel.spec.ts`:

```ts
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, login } from '../support/app';
import { addDestination, listTree, selectAlbum } from '../support/actions';

const TEMP_PREFIXES = ['jellytunes_', 'jt-'];

function strayTempFiles(): string[] {
  return readdirSync(tmpdir()).filter((name) => TEMP_PREFIXES.some((p) => name.startsWith(p)));
}

test('E5: cancelling a sync leaves no partial files and no temp orphans', async ({
  page,
  app,
  destDir,
}) => {
  const strayBefore = new Set(strayTempFiles());

  await login(page);
  await addDestination(page, app, destDir);

  // MP3 conversion of 3x120s lossless is slow enough to interrupt.
  await page.getByTestId('mp3-toggle').click();
  await selectAlbum(page, 'Album Gamma');

  await page.getByTestId('sync-button').click();
  await page.getByTestId('sync-preview-modal').waitFor({ state: 'visible' });
  await expect(page.getByTestId('preview-new-tracks-section')).toContainText('3 tracks');
  await page.getByTestId('confirm-sync-button').click();

  const cancelButton = page.getByTestId('cancel-sync-button');
  await cancelButton.waitFor({ state: 'visible', timeout: 30_000 });
  await cancelButton.click();

  // If the sync had already finished, this scenario proved nothing.
  await expect(
    page.getByTestId('cancel-sync-button'),
    'sync completed before it could be cancelled — lengthen the Album Gamma fixtures',
  ).toBeHidden({ timeout: 60_000 });

  const finalTree = listTree(destDir);
  expect(
    finalTree.length,
    `cancelled sync still wrote every track: ${finalTree.join(', ')}`,
  ).toBeLessThan(3);

  for (const rel of finalTree) {
    const size = statSync(join(destDir, rel)).size;
    expect(size, `${rel} is a zero-byte partial`).toBeGreaterThan(0);
  }

  await expect
    .poll(() => strayTempFiles().filter((f) => !strayBefore.has(f)), { timeout: 30_000 })
    .toEqual([]);
});
```

- [ ] **Step 2: Run E5 and read the failure carefully**

Run: `pnpm test:e2e -- --grep E5`

Three distinct failures are possible and they mean different things:

- `sync completed before it could be cancelled` — the fixture window is too short. Raise the `duration` for the `noise` tracks in `tests/e2e/fixtures/generate.mjs`, re-run `bash tests/e2e/docker/rebuild.sh`, and retry. Do not delete the guard.
- `cancelled sync still wrote every track` — same cause as above.
- Leftover `jt-*` or `jellytunes_*` files in `os.tmpdir()` — this is a genuine cleanup leak in the conversion path. Report it as a finding; it is out of scope for this plan to fix.

- [ ] **Step 3: Run E5 and verify it passes**

Run: `pnpm test:e2e -- --grep E5`

Expected: PASS.

- [ ] **Step 4: Verify no production code was touched**

Run: `git status --porcelain src/ && git diff --stat src/`

Expected: no output from either command.

- [ ] **Step 5: Verify the suite is repeatable**

Run: `pnpm test:e2e && pnpm test:e2e`

Expected: 5 passed, twice, with no skips.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/specs/e5-cancel.spec.ts
git commit -m "test(e2e): assert cancelled sync leaves no partial or temp files"
```

---

### Task 8: Retire the Cucumber suite

**Files:**

- Delete: `tests/bdd/`, `tsconfig.bdd.json`, `scripts/run-bdd-tests.sh`, `.github/workflows/bdd-tests.yml`
- Create: `docs/E2E_TESTING.md`
- Modify: `package.json`, `CLAUDE.md`, `README.md`

**Interfaces:**

- Consumes: the selector conventions documented in `tests/bdd/DATA_TESTID_GUIDE.md`.
- Produces: nothing.

`scripts/setup-display.sh` is sourced by `scripts/run-bdd-tests.sh` but is not otherwise referenced. Check before deleting it — it is out of scope if anything else uses it.

- [ ] **Step 1: Rescue the selector guide**

Read `tests/bdd/DATA_TESTID_GUIDE.md` and write `docs/E2E_TESTING.md` containing:

- The `data-testid` naming convention, carried over verbatim.
- First-time setup: `bash tests/e2e/docker/rebuild.sh` (once, ~2 minutes), then `docker compose -f tests/e2e/docker-compose.yml up -d`.
- Day-to-day: `pnpm test:e2e`, and `pnpm test:e2e -- --grep E2` for a single scenario.
- Why the suite refuses to skip, and where `.server.json` comes from.
- That `tests/e2e/fixtures/music/` and `.server.json` are generated and gitignored.
- That the suite runs on the developer's machine only and is not a CI gate.

- [ ] **Step 2: Confirm the orphan inventory before deleting**

Run:

```bash
grep -rn "test:bdd\|Cucumber\|tests/bdd\|tsconfig.bdd" --exclude-dir=node_modules --exclude-dir=.git --exclude=pnpm-lock.yaml .
grep -rn "setup-display" --exclude-dir=node_modules --exclude-dir=.git .
```

Expected: hits confined to the files listed under **Files** above, plus `CLAUDE.md` and `README.md`. Any hit elsewhere is an orphan this plan missed — handle it before proceeding.

- [ ] **Step 3: Delete**

```bash
git rm -r tests/bdd tsconfig.bdd.json scripts/run-bdd-tests.sh .github/workflows/bdd-tests.yml
pnpm remove @cucumber/cucumber @cucumber/pretty-formatter ts-node
```

Then remove the four `test:bdd*` entries from `package.json` `scripts`.

- [ ] **Step 4: Update the docs**

In `CLAUDE.md`, replace the BDD bullets in **Testing Strategy** with:

```markdown
- **E2E tests** use Playwright in `tests/e2e/` — specs in `tests/e2e/specs/`, harness in `tests/e2e/support/`
- E2E runs against a containerised Jellyfin and is local-only, never a CI gate. See `docs/E2E_TESTING.md`
- E2E fixtures and `tests/e2e/.server.json` are generated, not committed
```

In `README.md`, replace the `test:bdd*` commands with `pnpm test:e2e` and link `docs/E2E_TESTING.md`.

- [ ] **Step 5: Verify nothing is broken**

Run: `pnpm check`

Expected: typecheck, lint, format and build all pass. `ts-node` removal is safe — `@playwright/test` transpiles TypeScript itself.

- [ ] **Step 6: Verify the E2E suite still runs after the removal**

Run: `pnpm test:e2e`

Expected: 5 passed, 0 skipped.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: replace Cucumber BDD suite with Playwright E2E against containerised Jellyfin"
```

---

## Spec Coverage

| Spec AC                                                                                  | Task                     |
| ---------------------------------------------------------------------------------------- | ------------------------ |
| `docker compose up -d` healthy under 20s                                                 | 2 (Step 5)               |
| Fixtures byte-reproducible via `shasum`                                                  | 1 (Step 5)               |
| 3 artists / 4 albums / 10 tracks / 1 playlist, FLAC + MP3 + untagged album + compilation | 1 (Step 1–2), 2 (Step 1) |
| Per-scenario `--user-data-dir` and destination; repeatable                               | 3 (Step 2), 7 (Step 5)   |
| Folder picker stubbed via `electronApp.evaluate()`; `git diff src/` empty                | 4 (Step 1), 7 (Step 4)   |
| Fails loudly when Jellyfin is down; never skips                                          | 3 (Step 1, Step 7)       |
| E1 connection                                                                            | 3                        |
| E2 sync and disk tree                                                                    | 4                        |
| E3 re-sync                                                                               | 5                        |
| E4 MP3 conversion                                                                        | 6                        |
| E5 cancellation                                                                          | 7                        |
| BDD artefacts deleted                                                                    | 8 (Step 3)               |
| Selector guide survives in docs                                                          | 8 (Step 1)               |
| `pnpm check` green, docs updated                                                         | 8 (Step 4–5)             |

## Deviations from the spec

1. **E2's expected tree gains a `music/` segment.** `detectServerRootPath` preserves the library folder name by design. See Path Derivation. **Already amended in ORAIN-0670 and in the spec artifact on 2026-08-17** — the AC now reads `music/Test Artist A/Album Alpha/{01,02,03} - *.flac`. No further spec change needed; Task 4 implements the amended AC.
2. **The API key is not committed.** The spec says "API key horneada". It is baked into the Docker image, but the copy the tests read lives in gitignored `tests/e2e/.server.json`, because this is a public repository and a committed token would trip secret scanners. Cost: each developer runs `rebuild.sh` once.
3. **`@ffprobe-installer/ffprobe` is a new devDependency.** The spec assumes `ffprobe` is available; only `ffmpeg` is vendored today.
4. **Album Gamma is 120-second white noise, not a 2-second tone.** Without a slow track, E5 cannot reliably interrupt a sync. This does not change the 3/4/10/1 library shape.
