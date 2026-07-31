import { describe, it, expect } from 'vitest';
import {
  buildMetricsRequestBody,
  parseSnapMetricsResponse,
  formatWeeklyDeviceChange,
  latestNonNullIndex,
  buildSnapSectionEntries,
  clampDaysToOneYear,
  snapAuthErrorMessage,
  SNAP_METRICS_ENDPOINT,
  SNAP_METRICS_SNAP_ID,
} from '../../scripts/analytics.mjs';

describe('Snap Store constants', () => {
  it('uses the verified metrics endpoint', () => {
    expect(SNAP_METRICS_ENDPOINT).toBe('https://dashboard.snapcraft.io/dev/api/snaps/metrics');
  });

  it('uses the verified snap_id for jellytunes', () => {
    expect(SNAP_METRICS_SNAP_ID).toBe('xW8t5nYJls85ii9a6t1pYjMnOE8sHYGp');
  });
});

describe('buildMetricsRequestBody', () => {
  it('builds the canonical POST body', () => {
    const body = buildMetricsRequestBody('weekly_device_change', '2026-07-22', '2026-07-28');
    expect(body).toEqual({
      filters: [
        {
          snap_id: SNAP_METRICS_SNAP_ID,
          metric_name: 'weekly_device_change',
          start: '2026-07-22',
          end: '2026-07-28',
        },
      ],
    });
  });
});

describe('parseSnapMetricsResponse', () => {
  it('returns series and buckets for an OK payload', () => {
    const payload = {
      metrics: [
        {
          status: 'OK',
          metric_name: 'weekly_device_change',
          buckets: ['2026-07-28'],
          series: [
            { name: 'continued', values: [0] },
            { name: 'lost', values: [0] },
            { name: 'new', values: [9] },
          ],
        },
      ],
    };
    const result = parseSnapMetricsResponse(payload, 'weekly_device_change');
    expect(result.status).toBe('OK');
    expect(result.buckets).toEqual(['2026-07-28']);
    expect(result.series).toHaveLength(3);
  });

  it('returns NO_DATA status without series', () => {
    const payload = {
      metrics: [
        {
          status: 'NO_DATA',
          metric_name: 'installed_base_by_country',
          buckets: [],
          series: [],
        },
      ],
    };
    const result = parseSnapMetricsResponse(payload, 'installed_base_by_country');
    expect(result.status).toBe('NO_DATA');
    expect(result.buckets).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it('returns FAIL status with a string error', () => {
    const payload = {
      metrics: [{ status: 'FAIL', metric_name: 'weekly_device_change', error: 'bad date' }],
    };
    const result = parseSnapMetricsResponse(payload, 'weekly_device_change');
    expect(result.status).toBe('FAIL');
    expect(result.error).toBe('bad date');
  });
});

describe('formatWeeklyDeviceChange', () => {
  it('always emits new → continued → lost regardless of input order', () => {
    const buckets = ['2026-07-21', '2026-07-28'];
    const series = [
      { name: 'lost', values: [1, 0] },
      { name: 'continued', values: [2, 0] },
      { name: 'new', values: [5, 9] },
    ];
    const entries = formatWeeklyDeviceChange(buckets, series);
    expect(entries.map((e) => e[0])).toEqual(['new', 'continued', 'lost']);
    // For the latest bucket (2026-07-28), values are [0, 0, 9] for lost/cont/new.
    expect(entries[0][1]).toBe(9); // new
    expect(entries[1][1]).toBe(0); // continued
    expect(entries[2][1]).toBe(0); // lost
  });

  // The snapcraft API reports data up to *yesterday* UTC; the current day's
  // bucket is always null. formatWeeklyDeviceChange must skip trailing nulls
  // instead of returning [0, 0, 0] for the today's bucket.
  it('skips trailing null buckets and uses the last bucket with data', () => {
    const buckets = [
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ];
    const series = [
      { name: 'continued', values: [null, null, null, 0, 0, 0, 0, null] },
      { name: 'lost', values: [null, null, null, 0, 0, 0, 0, null] },
      { name: 'new', values: [null, null, null, 3, 9, 12, 12, null] },
    ];
    const entries = formatWeeklyDeviceChange(buckets, series);
    expect(entries.map((e) => e[0])).toEqual(['new', 'continued', 'lost']);
    // Latest bucket with data is 2026-07-30 (idx 6), not 2026-07-31 (idx 7).
    expect(entries[0][1]).toBe(12); // new
    expect(entries[1][1]).toBe(0); // continued
    expect(entries[2][1]).toBe(0); // lost
  });

  it('returns all zeros when every bucket is null (snap just published)', () => {
    const buckets = ['2026-07-30', '2026-07-31'];
    const series = [
      { name: 'continued', values: [null, null] },
      { name: 'lost', values: [null, null] },
      { name: 'new', values: [null, null] },
    ];
    const entries = formatWeeklyDeviceChange(buckets, series);
    expect(entries.map((e) => e[1])).toEqual([0, 0, 0]);
  });
});

describe('clampDaysToOneYear', () => {
  it('leaves small ranges untouched', () => {
    const { days, clipped } = clampDaysToOneYear(30);
    expect(days).toBe(30);
    expect(clipped).toBe(false);
  });

  it('clamps at 365 days and flags clipping', () => {
    const { days, clipped } = clampDaysToOneYear(500);
    expect(days).toBe(365);
    expect(clipped).toBe(true);
  });
});

describe('snapAuthErrorMessage', () => {
  it('points to header regeneration for 401', () => {
    const msg = snapAuthErrorMessage(401);
    expect(msg).toContain('SNAPCRAFT_METRICS_AUTH');
    expect(msg).toMatch(/regenerar|regenerate|header/i);
  });

  it('points to header regeneration for 403', () => {
    const msg = snapAuthErrorMessage(403);
    expect(msg).toContain('SNAPCRAFT_METRICS_AUTH');
  });
});

// The snapcraft API reports data up to *yesterday* UTC; the current day's
// bucket is always null. latestNonNullIndex finds the last bucket where any
// series has a non-null value, so the dashboard shows real data instead of 0.
describe('latestNonNullIndex', () => {
  it('returns -1 when there are no buckets', () => {
    expect(latestNonNullIndex([], [])).toBe(-1);
  });

  it('returns -1 when every bucket is null across all series', () => {
    const buckets = ['2026-07-30', '2026-07-31'];
    const series = [
      { name: 'DE', values: [null, null] },
      { name: 'US', values: [null, null] },
    ];
    expect(latestNonNullIndex(buckets, series)).toBe(-1);
  });

  it('returns the last index where any series has a non-null value', () => {
    const buckets = [
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ];
    const series = [
      { name: '0.6.0', values: [null, null, null, null, 8, 8, 5, null] },
      { name: '0.5.0', values: [null, null, null, 3, 1, null, null, null] },
    ];
    expect(latestNonNullIndex(buckets, series)).toBe(6); // 2026-07-30
  });

  it('handles a single non-null bucket', () => {
    const buckets = ['2026-07-30', '2026-07-31'];
    const series = [{ name: 'DE', values: [null, null] }];
    expect(latestNonNullIndex(buckets, series)).toBe(-1);
  });
});

// buildSnapSectionEntries powers the four non-weekly sections in the
// dashboard. It must pick the last bucket with data so that "today" (always
// null from the API) does not blank out the entire chart.
describe('buildSnapSectionEntries', () => {
  it('returns sorted entries from the last non-null bucket', () => {
    const buckets = [
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ];
    const series = [
      { name: '0.5.0', values: [null, null, null, 3, 1, null, null, null] },
      { name: '0.6.0', values: [null, null, null, null, 8, 8, 5, null] },
    ];
    const { entries, latestIdx } = buildSnapSectionEntries(buckets, series);
    expect(latestIdx).toBe(6); // 2026-07-30
    expect(entries).toEqual([
      ['0.6.0', 5],
      ['0.5.0', 0],
    ]);
  });

  it('returns empty entries when every bucket is null', () => {
    const buckets = ['2026-07-30', '2026-07-31'];
    const series = [{ name: '0.6.0', values: [null, null] }];
    const { entries, latestIdx } = buildSnapSectionEntries(buckets, series);
    expect(latestIdx).toBe(-1);
    expect(entries).toEqual([]);
  });
});
