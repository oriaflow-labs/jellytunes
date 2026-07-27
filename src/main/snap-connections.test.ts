// src/main/snap-connections.test.ts
// ORAIN-0578: unit tests for the `snapctl is-connected` adapter.
//
// The previous implementation guessed each interface's state by poking the
// filesystem (readdir on /run/udev/data, /media, /proc/mounts). That was
// wrong: filesystem-derived answers diverged from what snapd actually
// granted. snapd answers the question directly, so we ask it instead of
// inferring.
//
// ORAIN-0591: `hardware-observe` removed — the snap no longer declares that
// plug, so the probes only iterate the three remaining interfaces.

import { describe, it, expect, vi } from 'vitest';
import { probeSnapConnection, runSnapConnectionProbes } from './snap-connections';
import type { SnapctlResult } from './snap-connections';

const ok = (): SnapctlResult => ({ status: 0 });
const notConnected = (): SnapctlResult => ({ status: 1 });

describe('probeSnapConnection', () => {
  it('reports connected on exit code 0', () => {
    expect(probeSnapConnection(ok, 'removable-media')).toEqual({ status: 'connected' });
  });

  it('reports missing on exit code 1', () => {
    expect(probeSnapConnection(notConnected, 'removable-media')).toEqual({ status: 'missing' });
  });

  it('passes the plug name to snapctl as `is-connected <plug>`', () => {
    const run = vi.fn(ok);
    probeSnapConnection(run, 'mount-observe');
    expect(run).toHaveBeenCalledWith(['is-connected', 'mount-observe']);
  });

  describe('inconclusive results never produce a command', () => {
    it('reports unknown when snapctl cannot be executed', () => {
      // e.g. not running under snap, or snapctl missing from PATH
      const run = (): SnapctlResult => ({ status: null, error: new Error('ENOENT') });
      expect(probeSnapConnection(run, 'removable-media')).toEqual({ status: 'unknown' });
    });

    it('reports unknown on a usage/other error exit code', () => {
      // Exit codes other than 0/1 mean snapctl failed to answer (unknown
      // plug, bad invocation) — not evidence that the plug is missing.
      const run = (): SnapctlResult => ({ status: 2 });
      expect(probeSnapConnection(run, 'removable-media')).toEqual({ status: 'unknown' });
    });

    it('reports unknown when the process was killed (timeout)', () => {
      const run = (): SnapctlResult => ({ status: null });
      expect(probeSnapConnection(run, 'mount-observe')).toEqual({ status: 'unknown' });
    });
  });
});

describe('runSnapConnectionProbes', () => {
  it('probes all three declared interfaces', () => {
    const run = vi.fn(ok);
    const probes = runSnapConnectionProbes(run);

    expect(Object.keys(probes).sort()).toEqual(
      ['mount-observe', 'password-manager-service', 'removable-media'].sort(),
    );
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('maps each interface independently', () => {
    // The whole point of asking snapd per plug: one missing interface must
    // not colour the verdict of the others.
    const run = (args: string[]): SnapctlResult =>
      args[1] === 'password-manager-service' ? { status: 1 } : { status: 0 };

    const probes = runSnapConnectionProbes(run);

    expect(probes['password-manager-service']).toEqual({ status: 'missing' });
    expect(probes['mount-observe']).toEqual({ status: 'connected' });
    expect(probes['removable-media']).toEqual({ status: 'connected' });
  });

  it('reports every interface as unknown when snapctl is unavailable', () => {
    // Degrade to silence rather than to a screen full of wrong commands.
    const run = (): SnapctlResult => ({ status: null, error: new Error('ENOENT') });
    const probes = runSnapConnectionProbes(run);

    expect(Object.values(probes).every((p) => p?.status === 'unknown')).toBe(true);
  });
});
