// src/renderer/src/utils/snapPermissions.ts
// ORAIN-0578: shared renderer-side contract for the snap permission report
// returned by `window.api.checkSnapPermissions()`.
//
// The report shape used to be re-declared inline in every consumer
// (AboutModal, SnapPermissionsSection, the banner). Adding a fourth
// interface meant editing four copies, so the shape and the user-facing
// copy for each interface live here instead.

export type SnapPermissionInterface =
  | 'password-manager-service'
  | 'mount-observe'
  | 'removable-media'
  | 'hardware-observe';

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
  'password-manager-service': {
    grants: 'OS keyring (libsecret / kwallet)',
    impact: "your login isn't saved — you have to re-enter the API key on every launch",
  },
  'mount-observe': {
    grants: 'read /proc/mounts',
    impact: 'drives mounted under a user folder are detected with the wrong name',
  },
  'removable-media': {
    grants: 'read /media, /run/media, /mnt',
    impact: 'USB drives and SD cards do not appear in the device list',
  },
  'hardware-observe': {
    grants: 'read the udev device database',
    impact: 'removable devices cannot be told apart from ordinary folders',
  },
};
