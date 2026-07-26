/**
 * Snap interface state via `snapctl` (ORAIN-0578).
 *
 * snapd answers "is this plug connected?" directly, so we ask it instead of
 * inferring the answer from what the filesystem lets us touch. The earlier
 * filesystem probes were unreliable in both directions — most visibly,
 * `hardware-observe` was reported missing even with the plug connected,
 * because the interface grants reading the udev data files without granting
 * a listing of `/run/udev/data` itself.
 *
 * `snapctl is-connected <plug>` exits 0 when connected and 1 when not.
 * Anything else (snapctl absent, unknown plug, timeout) is inconclusive and
 * maps to `unknown`, which produces no command and no banner entry — better
 * silent than wrong.
 *
 * Plug names match the interface names because `package.json` declares them
 * as bare strings under `build.snapcraft.plugs`; a renamed plug would need
 * its snapctl name here, not the interface name.
 *
 * Pure: the caller injects the runner, so this is unit-tested without snapd.
 */

import {
  SNAP_PERMISSION_INTERFACES,
  type BuildSnapPermissionsReportInput,
  type SnapPermissionInterface,
  type SnapPermissionProbeResult,
} from './snap-permissions';

/** Subset of `spawnSync`'s result that the mapping actually depends on. */
export interface SnapctlResult {
  /** Exit code, or `null` when the process could not run or was killed. */
  status: number | null;
  error?: Error;
}

export type SnapctlRunner = (args: string[]) => SnapctlResult;

export function probeSnapConnection(
  run: SnapctlRunner,
  plug: SnapPermissionInterface,
): SnapPermissionProbeResult {
  const result = run(['is-connected', plug]);
  if (result.error) return { status: 'unknown' };
  if (result.status === 0) return { status: 'connected' };
  if (result.status === 1) return { status: 'missing' };
  return { status: 'unknown' };
}

/** Ask snapd about every interface we surface. */
export function runSnapConnectionProbes(
  run: SnapctlRunner,
): BuildSnapPermissionsReportInput['probes'] {
  const probes: BuildSnapPermissionsReportInput['probes'] = {};
  for (const name of SNAP_PERMISSION_INTERFACES) {
    probes[name] = probeSnapConnection(run, name);
  }
  return probes;
}
