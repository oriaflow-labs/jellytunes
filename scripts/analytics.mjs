#!/usr/bin/env node
// JellyTunes Analytics Dashboard
// Shows update check metrics from Cloudflare + GitHub download stats

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so tests can point at a local stub instead of production.
const CLOUDFLARE_API = process.env.CLOUDFLARE_STATS_API_URL ?? 'https://api.orainlabs.dev/jellytunes/stats';
const GITHUB_REPO = 'orainlabs/jellytunes';

// ─── Color helpers (terminal colors without external deps) ───────────────────

const ESC = '\x1b';
const reset = `${ESC}[0m`;
const bold = `${ESC}[1m`;
const dim = `${ESC}[2m`;
const cyan = `${ESC}[36m`;
const green = `${ESC}[32m`;
const yellow = `${ESC}[33m`;
const magenta = `${ESC}[35m`;
const red = `${ESC}[31m`;

function c(color, text) {
  return `${color}${text}${reset}`;
}

// ─── Help ────────────────────────────────────────────────────────────────────

const HELP = `
${bold}jtstats${reset} — JellyTunes Analytics Dashboard

${bold}USAGE${reset}
  jtstats [options]

${bold}OPTIONS${reset}
  ${cyan}--mode=<mode>${reset}      Output mode: dashboard (default), chart, raw
  ${cyan}--chart=<type>${reset}     Chart type when --mode=chart: ascii (default),
                 unicode, bars, columns, spark, heatmap
  ${cyan}--days=<n>${reset}          Number of days to fetch (default: 7)
  ${cyan}--help${reset}, ${cyan}--h${reset}      Show this help

${bold}EXAMPLES${reset}
  jtstats                  # Dashboard (last 7 days)
  jtstats --days=30        # Dashboard last 30 days
  jtstats --mode=chart     # ASCII chart
  jtstats --mode=chart --chart=unicode
  jtstats --mode=raw       # Raw JSON (CF stats + GitHub downloads)

${bold}ENV${reset}
  CLOUDFLARE_STATS_API_KEY  Your Cloudflare STATS_API_KEY
  SNAPCRAFT_METRICS_AUTH    Snapcraft dashboard Authorization header
                           (POST https://dashboard.snapcraft.io/dev/api/snaps/metrics).
                           ACL must be package_metrics. The env var stores the
                           header string already bound via prepare_for_request —
                           NOT the raw export-login blob. Regenerate with the
                           pymacaroons binding step documented in ORAIN-0625
                           when the discharge expires; export-login alone is
                           not enough. When unset, snap sections are skipped.

${bold}CHART TYPES${reset}
  ascii    Default, works everywhere
  unicode  Unicode block characters
  bars     Horizontal bars
  columns  Vertical columns
  spark    Minimal sparklines
  heatmap  Color heatmap (needs many rows)

${bold}DATA${reset}
  Update checks come from your Cloudflare Worker proxy.
  GitHub downloads are fetched automatically in dashboard and raw modes.
`.trim();

function showHelp() {
  console.log(HELP);
  process.exit(0);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getApiKey() {
  const key = process.env.CLOUDFLARE_STATS_API_KEY;
  if (!key) {
    console.error(`${red}Error:${reset} CLOUDFLARE_STATS_API_KEY environment variable not set.`);
    console.error(`  ${yellow}export CLOUDFLARE_STATS_API_KEY=<your-key>${reset}`);
    process.exit(1);
  }
  return key;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function dateRange(days = 7) {
  const to = toDateStr(new Date());
  const from = toDateStr(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  return { from, to };
}

// ─── Data Fetchers ──────────────────────────────────────────────────────────

async function fetchCloudflareStats({ from, to }) {
  const key = getApiKey();
  const url = `${CLOUDFLARE_API}?from=${from}&to=${to}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchGitHubDownloads() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}`);
  }
  return res.json();
}

// ─── Aggregators ───────────────────────────────────────────────────────────

function aggregateByDate(data) {
  const agg = {};
  for (const [key, count] of Object.entries(data)) {
    const date = key.split(':')[0];
    agg[date] = (agg[date] ?? 0) + count;
  }
  return agg;
}

function aggregateByVersion(data) {
  const agg = {};
  for (const [key, count] of Object.entries(data)) {
    const version = key.split(':')[1];
    agg[version] = (agg[version] ?? 0) + count;
  }
  return agg;
}

function aggregateByPlatform(data) {
  const agg = {};
  for (const [key, count] of Object.entries(data)) {
    const platform = key.split(':')[2];
    agg[platform] = (agg[platform] ?? 0) + count;
  }
  return agg;
}

function aggregateByCountry(data) {
  const agg = {};
  for (const [key, count] of Object.entries(data)) {
    const country = key.split(':')[3];
    agg[country] = (agg[country] ?? 0) + count;
  }
  return agg;
}

function aggregateByDateVersion(data) {
  const agg = {};
  for (const [key, count] of Object.entries(data)) {
    const [date, version] = key.split(':');
    if (!agg[date]) agg[date] = {};
    agg[date][version] = (agg[date][version] ?? 0) + count;
  }
  return agg;
}

// Aggregators are exported so AC 4 can be unit-tested: a KV key like
// "2026-07-29:0.6.0:linux-snap:ES" must still split on ':' by index and
// yield {date: '2026-07-29'}, {version: '0.6.0'}, {platform: 'linux-snap'},
// {country: 'ES'} — the snap marker folding into the platform field keeps
// the existing 4-segment key shape intact.
export const _aggregators = {
  aggregateByDate,
  aggregateByVersion,
  aggregateByPlatform,
  aggregateByCountry,
  aggregateByDateVersion,
};

// ─── Snap Store metrics (exported for unit tests) ───────────────────────────

export const SNAP_METRICS_ENDPOINT = 'https://dashboard.snapcraft.io/dev/api/snaps/metrics';
// Verified 2026-07-29 from `snapcraft metrics jellytunes` and dashboard.snapcraft.io
export const SNAP_METRICS_SNAP_ID = 'xW8t5nYJls85ii9a6t1pYjMnOE8sHYGp';
export const SNAP_MAX_DAYS = 365;
export const SNAP_METRICS = [
  'installed_base_by_version',
  'installed_base_by_country',
  'installed_base_by_channel',
  'weekly_device_change',
];

// Build the POST body for a single snapcraft metrics query.
export function buildMetricsRequestBody(metricName, start, end) {
  return {
    filters: [
      { snap_id: SNAP_METRICS_SNAP_ID, metric_name: metricName, start, end },
    ],
  };
}

// Parse a raw snapcraft `/dev/api/snaps/metrics` response for one metric name.
// Returns { status, buckets, series, error }.
export function parseSnapMetricsResponse(payload, metricName) {
  const metric = payload?.metrics?.find((m) => m.metric_name === metricName);
  if (!metric) {
    return { status: 'FAIL', buckets: [], series: [], error: `metric ${metricName} missing` };
  }
  return {
    status: metric.status,
    buckets: metric.buckets ?? [],
    series: metric.series ?? [],
    error: metric.error,
  };
}

// Format weekly_device_change entries in the explicit order
// new → continued → lost, regardless of API ordering.
export function formatWeeklyDeviceChange(buckets, series) {
  const latestIdx = latestNonNullIndex(buckets, series);
  const valueOf = (name) => {
    if (latestIdx < 0) return 0;
    const s = series.find((x) => x.name === name);
    return s ? (s.values[latestIdx] ?? 0) : 0;
  };
  return [
    ['new', valueOf('new')],
    ['continued', valueOf('continued')],
    ['lost', valueOf('lost')],
  ];
}

// The snapcraft API reports data up to *yesterday* UTC; the current day's
// bucket is always null. Find the last bucket where any series has a
// non-null value so the dashboard shows real data instead of blanks.
// Returns -1 when every bucket is null across all series.
export function latestNonNullIndex(buckets, series) {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (series.some((s) => s.values[i] != null)) return i;
  }
  return -1;
}

// Build the entries for the three installed_base_by_* sections. Returns
// { entries, latestIdx } where entries is sorted desc by value. latestIdx
// refers to the last bucket with data (NOT necessarily the last bucket —
// today's bucket is always null).
export function buildSnapSectionEntries(buckets, series) {
  const latestIdx = latestNonNullIndex(buckets, series);
  if (latestIdx < 0) return { entries: [], latestIdx };
  const entries = series.map((s) => [s.name, s.values[latestIdx] ?? 0]);
  entries.sort((a, b) => b[1] - a[1]);
  return { entries, latestIdx };
}

// Clamp --days to the API max and signal whether clipping happened.
export function clampDaysToOneYear(days) {
  if (days > SNAP_MAX_DAYS) return { days: SNAP_MAX_DAYS, clipped: true };
  return { days, clipped: false };
}

// Actionable message for 401/403: the env var holds the *header*, not the
// raw credential, so plain `snapcraft export-login` is not enough —
// the binding step (prepare_for_request) must be re-run.
export function snapAuthErrorMessage(status) {
  return (
    `Snapcraft API returned ${status}: SNAPCRAFT_METRICS_AUTH is invalid or expired. ` +
    `The env var stores the prepared Authorization header, not the raw export-login blob. ` +
    `Regenerate the full header (re-run snapcraft export-login + the prepare_for_request binding ` +
    `documented in ORAIN-0625) and update the secret.`
  );
}

// Fetch one metric from the snapcraft dashboard API.
// Returns the raw `metrics[0]` element. Throws on non-OK HTTP.
export async function fetchSnapMetric(metricName, { from, to }) {
  const auth = process.env.SNAPCRAFT_METRICS_AUTH;
  if (!auth) {
    throw new Error('SNAPCRAFT_METRICS_AUTH not set');
  }
  const res = await fetch(SNAP_METRICS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(buildMetricsRequestBody(metricName, from, to)),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(snapAuthErrorMessage(res.status));
  }
  if (!res.ok) {
    throw new Error(`Snapcraft API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ─── Snap Store formatters ──────────────────────────────────────────────────

function printSnapSection(label, metricName, payload, { from, to }) {
  const parsed = parseSnapMetricsResponse(payload, metricName);
  const header = `Snap Store ${label}`;

  // NO_DATA / FAIL / empty — render a single short block with the same header
  // prefix so the AC 6 contract (4 sections, all starting with "Snap Store")
  // holds regardless of API state.
  if (parsed.status === 'NO_DATA') {
    section2(header, [], { note: `No data available in window ${from} → ${to}.` });
    return;
  }
  if (parsed.status === 'FAIL') {
    section2(header, [], { note: `Snapcraft returned FAIL${parsed.error ? `: ${parsed.error}` : ''}` });
    return;
  }
  if (!parsed.buckets.length || !parsed.series.length) {
    section2(header, [], { note: `Snapcraft returned no buckets/series for ${from} → ${to}.` });
    return;
  }

  let entries;
  let note = `📅  ${from} → ${to}`;
  if (metricName === 'weekly_device_change') {
    entries = formatWeeklyDeviceChange(parsed.buckets, parsed.series);
    const lastIdx = latestNonNullIndex(parsed.buckets, parsed.series);
    const latestBucket = lastIdx >= 0 ? parsed.buckets[lastIdx] : parsed.buckets[parsed.buckets.length - 1];
    note =
      `📅  ${from} → ${to} (latest bucket: ${latestBucket})  ·  ` +
      `ordered new → continued → lost. Shows 100% "new" until ≥ 2 weekly windows have elapsed.`;
  } else {
    const built = buildSnapSectionEntries(parsed.buckets, parsed.series);
    entries = built.entries;
    if (built.latestIdx >= 0) {
      const latestBucket = parsed.buckets[built.latestIdx];
      note = `📅  ${from} → ${to} (latest bucket: ${latestBucket})`;
    }
  }
  section2(header, entries, { note });
}

// Variant of `section` that renders unconditionally (no TOTAL row) to match
// the layout of the existing dashboard sections, tolerant of empty input.
function section2(label, entries, { width = 38, note } = {}) {
  console.log(`\n  ${cyan}${bold}📦 ${label}${reset}`);
  console.log(`  ${dim}${'─'.repeat(width + 16)}${reset}`);
  if (note) console.log(`  ${dim}${note}${reset}`);
  if (!entries.length) {
    console.log(`  ${dim}(no data — section intentionally left empty)${reset}`);
    return;
  }
  // Avoid Math.max() over [] → -Infinity.
  const max = entries.reduce((m, [, v]) => (v > m ? v : m), 0);
  for (const [key, value] of entries) {
    const filled = max > 0 ? Math.round((value / max) * width) : 0;
    const block = `${cyan}${'█'.repeat(filled)}${reset}`;
    const empty = `${dim}${'░'.repeat(width - filled)}${reset}`;
    const num = `${green}${String(value).padStart(5)}${reset}`;
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const pctStr = `${dim}${String(pct).padStart(4)}%${reset}`;
    console.log(`  ${String(key).padEnd(12)} ${block}${empty} ${num} ${pctStr}`);
  }
}

// Fetch all four snap metrics in parallel. Returns { ok, data, error } where
// data is keyed by metric_name on success. Never throws.
async function fetchAllSnapMetrics({ from, to }) {
  if (!process.env.SNAPCRAFT_METRICS_AUTH) {
    return { ok: false, reason: 'missing-env' };
  }
  const results = await Promise.allSettled(
    SNAP_METRICS.map((m) => fetchSnapMetric(m, { from, to })),
  );
  const data = {};
  let errored = false;
  SNAP_METRICS.forEach((m, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      data[m] = r.value;
    } else {
      errored = true;
      data[m] = { error: r.reason?.message ?? String(r.reason) };
    }
  });
  return { ok: !errored, data };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function bar(value, total, width = 38) {
  const filled = total > 0 ? Math.round((value / total) * width) : 0;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const block = '█'.repeat(filled);
  const empty = '░'.repeat(width - filled);
  const bar = `${cyan}${block}${dim}${empty}${reset}`;
  const num = `${green}${String(value).padStart(5)}${reset}`;
  const pctStr = `${dim}${String(pct).padStart(4)}%${reset}`;
  return `  ${bar} ${num} ${pctStr}`;
}

function section(label, entries, width = 38) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(...entries.map(([, v]) => v));

  console.log(`\n  ${cyan}${bold}${label}${reset}`);
  console.log(`  ${dim}${'─'.repeat(width + 16)}${reset}`);

  for (const [key, value] of entries) {
    const filled = max > 0 ? Math.round((value / max) * width) : 0;
    const block = `${cyan}${'█'.repeat(filled)}${reset}`;
    const empty = `${dim}${'░'.repeat(width - filled)}${reset}`;
    const num = `${green}${String(value).padStart(5)}${reset}`;
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const pctStr = `${dim}${String(pct).padStart(4)}%${reset}`;
    console.log(`  ${String(key).padEnd(12)} ${block}${empty} ${num} ${pctStr}`);
  }

  // Total row
  const filled = total > 0 ? width : 0;
  const block = `${green}${'█'.repeat(filled)}${reset}`;
  const empty = `${dim}${'░'.repeat(width - filled)}${reset}`;
  const num = `${green}${String(total).padStart(5)}${reset}`;
  console.log(`  ${dim}${'─'.repeat(width + 16)}${reset}`);
  console.log(`  ${bold}${String('TOTAL').padEnd(12)} ${block}${empty} ${num} ${dim}100%${reset}`);
}

function printDashboard(cfData, githubData, snapResult, { from, to }) {
  const byDate = aggregateByDate(cfData);
  const byVersion = aggregateByVersion(cfData);
  const byPlatform = aggregateByPlatform(cfData);
  const byCountry = aggregateByCountry(cfData);
  const totalCF = Object.values(byDate).reduce((a, b) => a + b, 0);

  console.log(`\n${bold}${magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);
  console.log(`  ${cyan}${bold}📊  JellyTunes Analytics${reset}`);
  console.log(`  ${dim}📅  ${from} → ${to}${reset}`);
  console.log(`${magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);

  // ── Update Checks by Date ──
  section(
    '📅 Update Checks by Date',
    Object.keys(byDate)
      .sort()
      .map((d) => [d, byDate[d]]),
  );

  // ── Update Checks by Version ──
  section(
    '🏷️ Update Checks by Version',
    Object.entries(byVersion).sort((a, b) => b[1] - a[1]),
  );

  // ── Update Checks by Platform ──
  section(
    '💻 Update Checks by Platform',
    Object.entries(byPlatform).sort((a, b) => b[1] - a[1]),
  );

  // ── Update Checks by Country ──
  console.log(`\n  ${cyan}${bold}🌍 Update Checks by Country (top 15)${reset}`);
  console.log(`  ${dim}${'─'.repeat(54)}${reset}`);
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const maxCountry = topCountries[0]?.[1] ?? 1;
  for (const [country, count] of topCountries) {
    const filled = Math.round((count / maxCountry) * 38);
    const block = `${cyan}${'█'.repeat(filled)}${reset}`;
    const empty = `${dim}${'░'.repeat(38 - filled)}${reset}`;
    const pct = Math.round((count / maxCountry) * 100);
    const num = `${green}${String(count).padStart(5)}${reset}`;
    const pctStr = `${dim}${String(pct).padStart(4)}%${reset}`;
    console.log(`  ${String(country).padEnd(12)} ${block}${empty} ${num} ${pctStr}`);
  }

  // ── GitHub Downloads ──
  if (githubData && githubData.length > 0) {
    console.log(`\n  ${cyan}${bold}📥 GitHub Downloads by Release${reset}`);
    console.log(`  ${dim}${'─'.repeat(54)}${reset}`);
    const releases = githubData.slice(0, 10).map((r) => ({
      tag: r.tag_name,
      date: r.published_at.slice(0, 10),
      total: r.assets.reduce((s, a) => s + a.download_count, 0),
    }));
    const maxDL = Math.max(...releases.map((r) => r.total), 1);
    for (const { tag, date, total } of releases) {
      const filled = Math.round((total / maxDL) * 38);
      const block = `${yellow}${'█'.repeat(filled)}${reset}`;
      const empty = `${dim}${'░'.repeat(38 - filled)}${reset}`;
      const label = `${tag} (${date})`;
      const num = `${green}${String(total).padStart(5)}${reset}`;
      console.log(`  ${String(label).padEnd(20)} ${block}${empty} ${num}`);
    }
  }

  // ── Snap Store (installed base + weekly device change) ──
  if (snapResult?.ok && snapResult.data) {
    printSnapSection('Snap Store Installed Base by Version', 'installed_base_by_version', snapResult.data.installed_base_by_version, { from, to });
    printSnapSection('Snap Store Installed Base by Country', 'installed_base_by_country', snapResult.data.installed_base_by_country, { from, to });
    printSnapSection('Snap Store Installed Base by Channel', 'installed_base_by_channel', snapResult.data.installed_base_by_channel, { from, to });
    printSnapSection('Snap Store Weekly Device Change', 'weekly_device_change', snapResult.data.weekly_device_change, { from, to });
  } else if (snapResult?.reason === 'missing-env') {
    console.log(`\n  ${dim}📦 Snap Store sections skipped: SNAPCRAFT_METRICS_AUTH not set. See --help for setup.${reset}`);
  } else if (snapResult && !snapResult.ok) {
    console.log(`\n  ${red}📦 Snap Store sections failed:${reset}`);
    for (const m of SNAP_METRICS) {
      const e = snapResult.data?.[m]?.error;
      if (e) console.log(`  ${dim}- ${m}:${reset} ${e}`);
    }
  }

  console.log(`\n${magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}\n`);
}

// ─── chartli integration ────────────────────────────────────────────────────
// chartli uses whitespace-separated values (NOT CSV)

function buildChartliData(cfData) {
  const byDateVersion = aggregateByDateVersion(cfData);
  const dates = Object.keys(byDateVersion).sort();
  const versions = [...new Set(Object.values(byDateVersion).flatMap((d) => Object.keys(d)))].sort();
  const lines = dates.map((date) => versions.map((v) => byDateVersion[date]?.[v] ?? 0).join(' '));
  return { dates, versions, lines };
}

async function printChartli(cfData, type = 'ascii') {
  const { dates, versions, lines } = buildChartliData(cfData);
  const tmpFile = join(__dirname, '.analytics-chartli-tmp.txt');
  const { writeFileSync } = await import('fs');

  writeFileSync(tmpFile, lines.join('\n'));

  const { execFileSync } = await import('child_process');
  try {
    const out = execFileSync(
      'chartli',
      [
        tmpFile,
        '-t',
        type,
        '-w',
        '60',
        '-h',
        '14',
        '--x-labels',
        dates.join(','),
        '--series-labels',
        versions.join(','),
      ],
      { encoding: 'utf8' },
    );
    console.log(out);
  } catch (e) {
    try {
      execFileSync('chartli', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      console.error(
        `${red}Error:${reset} chartli not installed. Run: ${yellow}npm i -g chartli${reset}`,
      );
      process.exit(1);
    }
    console.error(`${red}chartli error:${reset}`, e.message);
    process.exit(1);
  } finally {
    try {
      writeFileSync(tmpFile, '');
    } catch {}
  }
}

// ─── Raw JSON output ───────────────────────────────────────────────────────

function printRaw(cfData, githubData, snapResult) {
  // Never echo process.env.SNAPCRAFT_METRICS_AUTH in any branch.
  // The `snap` key holds either the parsed data or an error / reason descriptor.
  const snapOut =
    snapResult?.reason === 'missing-env'
      ? { skipped: 'SNAPCRAFT_METRICS_AUTH not set' }
      : snapResult?.ok
        ? snapResult.data
        : snapResult?.data ?? { error: 'snap fetch failed' };
  console.log(
    JSON.stringify({ cloudflare: cfData, github: githubData, snap: snapOut }, null, 2),
  );
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};

for (const arg of args) {
  if (arg === '--help' || arg === '--h' || arg === '-h') {
    showHelp();
  } else if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=');
    flags[k] = v ?? true;
  } else if (arg.startsWith('-')) {
    flags[arg.slice(1)] = true;
  }
}

const mode = flags.mode ?? 'dashboard';
const chartType = flags.chart ?? 'ascii';
const days = parseInt(flags.days ?? '7', 10);
// Clamp --days to the snapcraft API max (1 year) and warn if clipping.
const { days: clampedDays, clipped } = clampDaysToOneYear(days);
if (clipped) {
  console.error(
    `${yellow}Note:${reset} --days=${days} exceeds the snapcraft API maximum of ${SNAP_MAX_DAYS}; ` +
      `using ${clampedDays} for snapcraft queries (other sources keep the original window).`,
  );
}
const { from, to } = dateRange(clampedDays);

(async () => {
  try {
    // Always fetch GitHub downloads in dashboard/raw modes
    const fetchGH = mode !== 'chart';
    // Snap metrics only in dashboard/raw (chart mode is CF-only).
    const fetchSnap = mode !== 'chart';

    const [cfResult, ghResult, snapResult] = await Promise.allSettled([
      fetchCloudflareStats({ from, to }),
      fetchGH ? fetchGitHubDownloads() : Promise.resolve(null),
      fetchSnap ? fetchAllSnapMetrics({ from, to }) : Promise.resolve(null),
    ]);

    if (cfResult.status === 'rejected') {
      console.error(`${red}Cloudflare fetch failed:${reset}`, cfResult.reason.message);
      process.exit(1);
    }

    const cfData = cfResult.value;
    const ghData = fetchGH && ghResult.status === 'fulfilled' ? ghResult.value : null;
    const snap = snapResult.status === 'fulfilled' ? snapResult.value : null;

    if (mode === 'raw') {
      printRaw(cfData, ghData, snap);
    } else if (mode === 'chart') {
      await printChartli(cfData, chartType);
    } else {
      printDashboard(cfData, ghData, snap, { from, to });
    }
  } catch (err) {
    console.error(`${red}Error:${reset}`, err.message);
    process.exit(1);
  }
})();
