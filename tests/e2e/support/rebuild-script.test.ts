import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('rebuild.sh image pinning', () => {
  it('pins v12 image to immutable timestamped tag, not bare rc tag', () => {
    // RUNTIME ASSUMPTION: the v12 e2e image tag must be immutable (contains .YYYYMMDD-HHMMSS)
    // so re-runs on any machine provision the same server build; a moving rc tag silently
    // changes the audited target.
    const rebuildScript = readFileSync(join(__dirname, '../docker/rebuild.sh'), 'utf-8');

    // Verify v12 case uses a timestamped tag (e.g., 12.0-rc7.20260831-232051)
    // Pattern: JELLYFIN_IMAGE="jellyfin/jellyfin:12.0-rc7.<YYYYMMDD-HHMMSS>"
    const v12Match = rebuildScript.match(/v12\)\s+JELLYFIN_IMAGE="([^"]+)"/);
    expect(v12Match).toBeTruthy();
    const v12Tag = v12Match![1];

    // Assert it is the immutable timestamped variant
    expect(v12Tag).toMatch(/12\.0-rc7\.\d{8}-\d{6}/);

    // Assert it does NOT use the bare rc tag (which is a moving tag)
    expect(v12Tag).not.toBe('jellyfin/jellyfin:12.0-rc7');
  });
});
