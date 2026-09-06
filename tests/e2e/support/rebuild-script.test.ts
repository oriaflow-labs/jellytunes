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

describe('rebuild.sh harness correctness', () => {
  it('stops the throwaway container before copying config/cache (Bug A fix)', () => {
    const rebuildScript = readFileSync(join(__dirname, '../docker/rebuild.sh'), 'utf-8');

    // Find the line where docker cp "$BUILD_NAME:/config" appears
    const dockerCpConfigIndex = rebuildScript.indexOf('docker cp "$BUILD_NAME:/config"');
    expect(dockerCpConfigIndex).toBeGreaterThan(-1, 'rebuild.sh should contain docker cp command');

    // Find the line where docker stop "$BUILD_NAME" appears
    const dockerStopIndex = rebuildScript.indexOf('docker stop "$BUILD_NAME"');

    // Verify docker stop comes BEFORE docker cp, and it's not commented out
    expect(dockerStopIndex).toBeGreaterThan(
      -1,
      'rebuild.sh must issue `docker stop "$BUILD_NAME"` before copying the config; ' +
        "a live-container snapshot bakes an inconsistent DB that crashes Jellyfin 12's migration service on boot",
    );
    expect(dockerStopIndex).toBeLessThan(
      dockerCpConfigIndex,
      'docker stop must come BEFORE docker cp so SQLite checkpoints its WAL',
    );
  });
});

describe('docker-compose files have unique project names', () => {
  it('docker-compose.v11.yml declares a unique top-level name:', () => {
    const composeV11 = readFileSync(join(__dirname, '../docker-compose.v11.yml'), 'utf-8');

    // Look for a top-level "name:" field in YAML (should be at the start of a line, not indented under services)
    const nameMatch = composeV11.match(/^name:\s*(.+)$/m);
    expect(nameMatch).toBeTruthy(
      'docker-compose.v11.yml must declare a top-level `name:` field; ' +
        'distinct compose project names so `pnpm test:e2e` can hold both Jellyfin containers up at once',
    );
    expect(nameMatch?.[1]?.trim()).toBe('jellytunes-e2e-v11');
  });

  it('docker-compose.v12.yml declares a unique top-level name:', () => {
    const composeV12 = readFileSync(join(__dirname, '../docker-compose.v12.yml'), 'utf-8');

    // Look for a top-level "name:" field in YAML
    const nameMatch = composeV12.match(/^name:\s*(.+)$/m);
    expect(nameMatch).toBeTruthy(
      'docker-compose.v12.yml must declare a top-level `name:` field; ' +
        'distinct compose project names prevent the second `docker compose up` from evicting the first',
    );
    expect(nameMatch?.[1]?.trim()).toBe('jellytunes-e2e-v12');
  });

  it('v11 and v12 have different project names (Bug B fix)', () => {
    const composeV11 = readFileSync(join(__dirname, '../docker-compose.v11.yml'), 'utf-8');
    const composeV12 = readFileSync(join(__dirname, '../docker-compose.v12.yml'), 'utf-8');

    const nameV11 = composeV11.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const nameV12 = composeV12.match(/^name:\s*(.+)$/m)?.[1]?.trim();

    expect(nameV11).toBeDefined();
    expect(nameV12).toBeDefined();
    expect(nameV11).not.toBe(nameV12);
  });
});
