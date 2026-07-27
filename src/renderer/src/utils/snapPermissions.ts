// src/renderer/src/utils/snapPermissions.ts
// ORAIN-0578, reduced in ORAIN-0590 and ORAIN-0591: shared renderer-side
// contract for the snap permission report returned by
// `window.api.checkSnapPermissions()`.
//
// The report shape used to be re-declared inline in every consumer
// (AboutModal, SnapPermissionsSection, the banner). Adding a fourth
// interface meant editing four copies, so the shape and the user-facing
// copy for each interface live here instead.
//
// `password-manager-service` is intentionally absent: ORAIN-0590 replaced
// the session-storage provider with `secret-tool`, which routes through
// the Secret portal without the plug. Surfacing the old `sudo snap
// connect jellytunes:password-manager-service` command would only confuse
// users — the interface isn't even in the snap plugs anymore.
// `hardware-observe` is also absent: ORAIN-0591 dropped the native
// `usb-detection` addon under snap in favor of polling, so the plug is no
// longer declared.

export type SnapPermissionInterface = 'mount-observe' | 'removable-media';

export interface SnapPermissionReportEntry {
  interface: SnapPermissionInterface;
  status: 'missing';
  command: string;
}

export interface SnapPermissionsReport {
  isSnap: boolean;
  snapName: string | null;
  interfaces: SnapPermissionReportEntry[];
}

/** Report with nothing to show — safe initial state for every consumer. */
export const EMPTY_SNAP_PERMISSIONS_REPORT: SnapPermissionsReport = {
  isSnap: false,
  snapName: null,
  interfaces: [],
};

/**
 * What each interface grants and — more usefully for the user — what
 * visibly breaks in JellyTunes while its plug isn't connected.
 */
export const SNAP_PERMISSION_META: Record<
  SnapPermissionInterface,
  { grants: string; impact: string }
> = {
  'mount-observe': {
    grants: 'read /proc/mounts',
    impact: 'drives mounted under a user folder are detected with the wrong name',
  },
  'removable-media': {
    grants: 'read /media, /run/media, /mnt',
    impact: 'USB drives and SD cards do not appear in the device list',
  },
};
