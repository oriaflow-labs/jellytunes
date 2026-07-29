import { describe, it, expect } from 'vitest';
import { _aggregators } from '../../scripts/analytics.mjs';

const { aggregateByDate, aggregateByVersion, aggregateByPlatform, aggregateByCountry } =
  _aggregators;

// Simulated KV with a mix of plain "linux" and snap-folded "linux-snap"
// platform values, both sharing the same 4-segment shape.
const fixture = {
  '2026-07-29:0.6.0:linux:ES': 4,
  '2026-07-29:0.6.0:linux:US': 12,
  '2026-07-29:0.6.0:linux-snap:DE': 3,
  '2026-07-29:0.6.0:linux-snap:FR': 1,
  '2026-07-29:0.5.0:linux-snap:DE': 1,
  '2026-07-29:0.5.0:darwin:US': 2,
};

describe('aggregators with linux-snap keys (AC 4)', () => {
  it('aggregateByDate sums by the first segment only', () => {
    expect(aggregateByDate(fixture)).toEqual({ '2026-07-29': 23 });
  });

  it('aggregateByVersion splits the second segment intact (linux-snap stays together)', () => {
    expect(aggregateByVersion(fixture)).toEqual({ '0.6.0': 20, '0.5.0': 3 });
  });

  it('aggregateByPlatform keeps linux and linux-snap as distinct buckets', () => {
    expect(aggregateByPlatform(fixture)).toEqual({
      'linux': 16,
      'linux-snap': 5,
      'darwin': 2,
    });
  });

  it('aggregateByCountry splits the fourth segment intact', () => {
    expect(aggregateByCountry(fixture)).toEqual({
      ES: 4,
      US: 14,
      DE: 4,
      FR: 1,
    });
  });

  it('no aggregator needs a code change when the snap marker folds into the platform field', () => {
    // Regression guard: the original behavior for plain keys is unchanged.
    const plain = {
      '2026-07-29:0.6.0:linux:ES': 5,
      '2026-07-29:0.6.0:darwin:US': 2,
    };
    expect(aggregateByPlatform(plain)).toEqual({ linux: 5, darwin: 2 });
  });
});
