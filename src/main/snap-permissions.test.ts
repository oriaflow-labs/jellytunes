// src/main/snap-permissions.test.ts
// Unit tests for the pure function that maps snap permission probes
// (keyring, mount-observe, removable-media) to a user-facing list of
// missing interfaces + the exact `snap connect` command to fix each one.
//
// ORAIN-0578: tests cover every combination of probe results (each
// interface reports connected | missing | unknown; only missing produces
// a command) plus the off-snap suppression rule.
//
// ORAIN-0591: `hardware-observe` removed — the snap no longer declares that
// plug, so it is not probed or surfaced here.

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
        'password-manager-service': { status: 'missing' },
        'mount-observe': { status: 'missing' },
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
    it('reports password-manager-service connected (no command)', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'connected' },
          'mount-observe': { status: 'connected' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.isSnap).toBe(true);
      expect(report.snapName).toBe('jellytunes');
      expect(report.interfaces).toEqual([]);
    });

    it('reports password-manager-service missing with command', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'missing' },
          'mount-observe': { status: 'connected' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.interfaces).toHaveLength(1);
      expect(report.interfaces[0]).toEqual({
        interface: 'password-manager-service',
        status: 'missing',
        command: 'sudo snap connect jellytunes:password-manager-service',
      });
    });

    it('reports mount-observe missing with command', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'connected' },
          'mount-observe': { status: 'missing' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.interfaces).toEqual([
        {
          interface: 'mount-observe',
          status: 'missing',
          command: 'sudo snap connect jellytunes:mount-observe',
        },
      ]);
    });

    it('reports removable-media missing with command', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'connected' },
          'mount-observe': { status: 'connected' },
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
          'password-manager-service': { status: 'connected' },
          'mount-observe': { status: 'connected' },
          'removable-media': { status: 'unknown' },
        },
      });
      expect(report.interfaces).toEqual([]);
    });
  });

  describe('combinations', () => {
    it('reports two missing interfaces in stable order (password-manager, mount, removable)', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'missing' },
          'mount-observe': { status: 'missing' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.interfaces.map((i) => i.interface)).toEqual([
        'password-manager-service',
        'mount-observe',
      ]);
      expect(report.interfaces[0].command).toBe(
        'sudo snap connect jellytunes:password-manager-service',
      );
      expect(report.interfaces[1].command).toBe('sudo snap connect jellytunes:mount-observe');
    });

    it('reports all three missing with all three commands in stable order', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'missing' },
          'mount-observe': { status: 'missing' },
          'removable-media': { status: 'missing' },
        },
      });
      expect(report.interfaces).toHaveLength(3);
      expect(report.interfaces.map((i) => i.command)).toEqual([
        'sudo snap connect jellytunes:password-manager-service',
        'sudo snap connect jellytunes:mount-observe',
        'sudo snap connect jellytunes:removable-media',
      ]);
    });

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

    it('skips unknown and only emits missing commands', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes',
        probes: {
          'password-manager-service': { status: 'unknown' },
          'mount-observe': { status: 'missing' },
          'removable-media': { status: 'unknown' },
        },
      });
      expect(report.interfaces).toEqual([
        {
          interface: 'mount-observe',
          status: 'missing',
          command: 'sudo snap connect jellytunes:mount-observe',
        },
      ]);
    });
  });

  describe('snapName handling', () => {
    it('uses provided snapName in commands when present', () => {
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: 'jellytunes-edge',
        probes: {
          'password-manager-service': { status: 'missing' },
          'mount-observe': { status: 'connected' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.snapName).toBe('jellytunes-edge');
      expect(report.interfaces[0].command).toBe(
        'sudo snap connect jellytunes-edge:password-manager-service',
      );
    });

    it('falls back to "jellytunes" when snapName is null inside snap', () => {
      // snapName missing inside snap is a malformed runtime; we still want
      // a usable command rather than a NPE — defensive default.
      const report = buildSnapPermissionsReport({
        isSnap: true,
        snapName: null,
        probes: {
          'password-manager-service': { status: 'missing' },
          'mount-observe': { status: 'connected' },
          'removable-media': { status: 'connected' },
        },
      });
      expect(report.snapName).toBe('jellytunes');
      expect(report.interfaces[0].command).toBe(
        'sudo snap connect jellytunes:password-manager-service',
      );
    });
  });
});
