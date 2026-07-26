// src/renderer/src/components/SnapPermissionsBanner.tsx
// ORAIN-0578: persistent banner listing every snap interface whose plug
// isn't connected, with the exact `sudo snap connect <snap>:<interface>`
// command and the user-visible symptom for each.
//
// Driven by `snap:checkPermissions` alone — it does NOT wait for a feature
// to fail first. The previous keyring-only banner was gated on a failed
// `session:save`, which set `isConnected` in the same update that raised
// the flag, so the login screen hosting it was already unmounted by the
// time it had anything to show.
//
// Not dismissable: `snap connect` does not refresh the AppArmor profile of
// a running process, so the fix always needs a manual restart. Hiding the
// banner would hide the only signal saying so.

import { useState } from 'react';
import { SNAP_PERMISSION_META, type SnapPermissionsReport } from '../utils/snapPermissions';

interface SnapPermissionsBannerProps {
  report: SnapPermissionsReport;
}

export function SnapPermissionsBanner({
  report,
}: SnapPermissionsBannerProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  // Nothing to fix, or not a snap install — no nag, no false positives.
  if (!report.isSnap || report.interfaces.length === 0) return null;

  const allCommands = report.interfaces.map((entry) => entry.command).join('\n');

  const handleCopyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(allCommands);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the commands stay on screen so the user
      // can select and copy them by hand.
    }
  };

  return (
    <div
      data-testid="snap-permissions-banner"
      role="alert"
      className="shrink-0 bg-error_container border-b border-error/40 text-on_error_container px-4 py-3"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-body-md font-medium">
          {report.interfaces.length === 1
            ? 'A snap permission is missing'
            : `${report.interfaces.length} snap permissions are missing`}
        </p>
        <button
          data-testid="snap-permissions-banner-copy-all"
          type="button"
          onClick={() => void handleCopyAll()}
          className="shrink-0 px-3 py-1.5 text-body-sm rounded bg-primary text-on_primary hover:bg-primary/90 transition-colors"
        >
          {copied ? 'Copied' : 'Copy all commands'}
        </button>
      </div>

      <ul className="mt-2 space-y-2">
        {report.interfaces.map((entry) => (
          <li
            key={entry.interface}
            data-testid={`snap-permissions-banner-row-${entry.interface}`}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
          >
            <code className="font-mono text-body-sm bg-surface_container_highest text-on_surface px-2 py-1 rounded select-all break-all sm:shrink-0">
              {entry.command}
            </code>
            <span className="text-body-sm text-on_error_container/80">
              {SNAP_PERMISSION_META[entry.interface].impact}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-caption text-on_error_container/70 mt-2">
        Run these in a terminal, then restart JellyTunes — the new plugs only take effect on the
        next launch.
      </p>
    </div>
  );
}
