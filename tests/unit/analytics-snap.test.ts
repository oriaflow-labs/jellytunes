import { describe, it, expect } from 'vitest';
import {
  buildMetricsRequestBody,
  parseSnapMetricsResponse,
  formatWeeklyDeviceChange,
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
