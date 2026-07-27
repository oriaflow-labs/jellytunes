/**
 * Snap permission check (ORAIN-0578, reduced in ORAIN-0590, ORAIN-0591 and
 * ORAIN-0592).
 *
 * Under Snap strict confinement, one interface is not auto-connected by
 * snapd and therefore can be silently missing in sideload/devmode/beta
 * installs and in badly-published releases:
 *   - `removable-media` (read /media, /run/media, /mnt — used to enumerate
 *     mounted volumes and detect their filesystem)
 *
 * `hardware-observe` was removed in ORAIN-0591: USB detection under snap
 * no longer relies on the `usb-detection` native addon (which needs that
 * plug), so the permission is not declared and no longer probed here.
 *
 * ORAIN-0590: `password-manager-service` is no longer probed or surfaced.
 * The session-storage provider now uses `secret-tool`, which routes
 * through the Secret portal inside the confinement without the plug.
 * Surfacing the old `sudo snap connect jellytunes:password-manager-service`
 * command would only confuse users (the interface isn't even in
 * `package.json:build.snapcraft.core24.plugs` anymore).
 *
 * `mount-observe` was a fourth entry until ORAIN-0592 replaced the
 * /proc/mounts read with st_dev mount-boundary detection and statfs, both of
 * which stay inside the `removable-media` grant.
 *
 * This module exposes a pure function that takes the result of probing
 * each interface (`connected | missing | unknown`) and produces a
 * user-facing report listing the missing ones together with the exact
 * `snap connect <snap>:<interface>` command to fix each.
 *
 * The probes themselves live in `snap-connections.ts`, which asks snapd
 * via `snapctl is-connected` — the state is not reliably inferable from
 * what the filesystem lets the process touch.
 *
 * Pure: no `fs` / `process.env` access here — that lives in the IPC
 * adapter (`main/index.ts`). This file is unit-tested by injecting probe
 * results directly.
 */

export type SnapPermissionStatus = 'connected' | 'missing' | 'unknown';

/** Result of probing a single interface. `command` is only set for `missing`. */
export interface SnapPermissionProbeResult {
  status: SnapPermissionStatus;
}

/** The interface we currently probe for. Order matters: report order. */
export type SnapPermissionInterface = 'removable-media';

export const SNAP_PERMISSION_INTERFACES: readonly SnapPermissionInterface[] = ['removable-media'];

/** Stable default — `package.json:2` hardcodes the snap name as "jellytunes". */
const DEFAULT_SNAP_NAME = 'jellytunes';

/** One entry in the user-facing report (only `missing` entries get one). */
export interface SnapPermissionReportEntry {
  interface: SnapPermissionInterface;
  status: 'missing';
  command: string;
}

/** Full report shape returned to the renderer via IPC. */
export interface SnapPermissionsReport {
  isSnap: boolean;
  /**
   * Echoed back so the UI can display the exact snap name in instructions.
   * `null` outside snap (no snap context to surface). Under snap, defaults to
   * the hardcoded `jellytunes` name from `package.json:2` if detection
   * somehow lost `SNAP_NAME` — defensive, avoids NPEs in command strings.
   */
  snapName: string | null;
  /** Empty outside snap; under snap, only `missing` interfaces appear. */
  interfaces: SnapPermissionReportEntry[];
}

export interface BuildSnapPermissionsReportInput {
  isSnap: boolean;
  snapName: string | null;
  probes: Partial<Record<SnapPermissionInterface, SnapPermissionProbeResult>>;
}

/**
 * Pure mapper — turns the result of the three probes into a user-facing
 * report. Only `missing` entries are emitted, each carrying the exact
 * `sudo snap connect <snap>:<interface>` command.
 *
 * Outside snap (`isSnap=false`) the function intentionally returns an
 * empty report — there is no snap to connect plugs to, so any
 * snap-specific UI/commands would be misleading.
 */
export function buildSnapPermissionsReport(
  input: BuildSnapPermissionsReportInput,
): SnapPermissionsReport {
  if (!input.isSnap) {
    return { isSnap: false, snapName: null, interfaces: [] };
  }
  const snapName = input.snapName ?? DEFAULT_SNAP_NAME;
  const interfaces: SnapPermissionReportEntry[] = [];
  for (const name of SNAP_PERMISSION_INTERFACES) {
    const probe = input.probes[name];
    if (probe?.status === 'missing') {
      interfaces.push({
        interface: name,
        status: 'missing',
        command: `sudo snap connect ${snapName}:${name}`,
      });
    }
  }
  return { isSnap: true, snapName, interfaces };
}
