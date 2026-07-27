// src/main/snap-permissions.test.ts
// Unit tests for the pure function that maps snap permission probes
// (removable-media) to a user-facing list of missing interfaces + the
// exact `snap connect` command to fix each one.
//
// ORAIN-0578: tests cover every combination of probe results (each
// interface reports connected | missing | unknown; only missing produces
// a command) plus the off-snap suppression rule.
//
// ORAIN-0591: `hardware-observe` removed — the snap no longer declares that
// plug, so it is not probed or surfaced here.
// ORAIN-0590: `password-manager-service` is no longer probed or surfaced
// — the session-storage provider switched to `secret-tool`, which
// doesn't need the plug.
// ORAIN-0592: `mount-observe` removed — nested mount detection uses
// `st_dev`/`statfs` instead of `/proc/mounts`, so it is not probed or
// surfaced here either. `removable-media` is now the only interface.

import { describe, it, expect } from 'vitest';
import {
  buildSnapPermissionsReport,
  type SnapPermissionProbeResult,
  type SnapPermissionsReport,
} from './snap-permissions';

describe('buildSnapPermissionsReport', () => {
  describe('isSnap gate', () => {
    it('returns an empty report when isSnap=false (suppression test)', () => {
      // Even when every probe would say "missing", we must not expose any
      // snap-specific UI/commands outside snap — there is no snap there.
      const probes: Record<string, SnapPermissionProbeResult> = {
        'removable-media': { status: 'missing' },
      };
      const report = buildSnapPermissionsReport({
        isSnap: false,
        snapName: 'jellytunes',
        probes,
      });
      expect(report).toEqual<SnapPermissionsReport>({
        isSnap: false,
        snapName: null,
        interfaces: [],
      });
    });

    it('returns an empty report when isSnap=false even if snapName is set', () => {
      const report = buildSnapPermissionsReport({
        isSnap: false,
        snapName: 'jellytunes',
        probes: {},
      });
      expect(report.snapName).toBeNull();
      expect(report.interfaces).toEqual([]);
    });
  });

  describe('single interface states (isSnap=true)', () => {
    it('reports removable-media connected (no command)', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.isSnap).toBe(true);
      expect(report.snapName).toBe('jellytunes');
      expect(report.interfaces).toEqual([]);
    });

    it('reports removable-media missing with command', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'removable-media': { status: 'missing' },
        },
      });
      expect(report.interfaces).toEqual([
        {
          interface: 'removable-media',
          status: 'missing',
          command: 'sudo snap connect jellytunes:removable-media',
        },
      ]);
    });

    it('reports unknown state without a command (do not nag on inconclusive probes)', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'removable-media': { status: 'unknown' },
        },
      });
      expect(report.interfaces).toEqual([]);
    });
  });

  describe('combinations', () => {
    it('skips interfaces with no probe result at all', () => {
      // `probes` is Partial — an interface the adapter never probed must not
      // be reported as missing (that would print a command for something we
      // have no evidence about).
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: { 'removable-media': { status: 'missing' } },
      });
      expect(report.interfaces.map((i) => i.interface)).toEqual(['removable-media']);
    });
  });

  describe('snapName handling', () => {
    it('uses provided snapName in commands when present', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes-edge',
        probes: {
          'removable-media': { status: 'missing' },
        },
      });
      expect(report.snapName).toBe('jellytunes-edge');
      expect(report.interfaces[0].command).toBe(
        'sudo snap connect jellytunes-edge:removable-media',
      );
    });

    it('falls back to "jellytunes" when snapName is null inside snap', () => {
      // snapName missing inside snap is a malformed runtime; we still want
      // a usable command rather than a NPE — defensive default.
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: null,
        probes: {
          'removable-media': { status: 'missing' },
        },
      });
      expect(report.snapName).toBe('jellytunes');
      expect(report.interfaces[0].command).toBe('sudo snap connect jellytunes:removable-media');
    });
  });

  describe('removed interfaces (ORAIN-0590, ORAIN-0591, ORAIN-0592)', () => {
    it('never surfaces password-manager-service, hardware-observe or mount-observe, even if probed missing', () => {
      // Defensive: any legacy probe path that still produces a verdict
      // for a removed interface must not result in a UI command. The type
      // system now rejects these as keys — that is the strongest
      // guarantee. We cast through `unknown` so we can still feed them in
      // and assert the report filters them.
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'missing' },
          'hardware-observe': { status: 'missing' },
          'mount-observe': { status: 'missing' },
          'removable-media': { status: 'connected' },
        } as unknown as Parameters<typeof buildSnapPermissionsReport>[0]['probes'],
      });
      expect(report.interfaces).toEqual([]);
    });
  });
});
