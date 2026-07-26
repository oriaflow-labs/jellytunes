// src/renderer/src/components/SnapPermissionsSection.tsx
// ORAIN-0578 T2: section shown in the About modal (and reachable via
// Settings → About) that lists every snap interface whose plug isn't
// connected, with the exact `sudo snap connect <snap>:<interface>`
// command for each. A single "Copy all" button copies every command on
// its own line so the user can paste the whole block into a terminal.
//
// Renders nothing outside snap or when nothing is missing — no nag,
// no false positives.

import { useState } from 'react';

interface SnapPermissionReportEntry {
  interface: 'password-manager-service' | 'mount-observe' | 'removable-media';
  status: 'missing';
  command: string;
}

interface SnapPermissionsReport {
  isSnap: boolean;
  snapName: string | null;
  interfaces: SnapPermissionReportEntry[];
}

interface SnapPermissionsSectionProps {
  report: SnapPermissionsReport;
}

const INTERFACE_LABEL: Record<SnapPermissionReportEntry['interface'], string> = {
  'password-manager-service': 'password-manager-service — OS keyring',
  'mount-observe': 'mount-observe — read /proc/mounts',
  'removable-media': 'removable-media — read /media, /run/media, /mnt',
};

export function SnapPermissionsSection({
  report,
}: SnapPermissionsSectionProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  // Suppress entirely outside snap or when there's nothing to fix.
  if (!report.isSnap || report.interfaces.length === 0) return null;

  const allCommands = report.interfaces.map((entry) => entry.command).join('\n');

  const handleCopyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(allCommands);
      setCopied(true);
    } catch {
      // Clipboard unavailable — leave the commands visible so the user
      // can select/copy manually.
    }
  };

  return (
    <div
      data-testid="snap-permissions-section"
      className="mt-4 bg-surface_container_high border border-outline_variant rounded-lg p-4 text-left"
    >
      <h3 className="text-body-md font-medium mb-1">Snap permissions missing</h3>
      <p className="text-body-sm text-on_surface_variant mb-3">
        Run the commands below in a terminal, then restart JellyTunes for the new plugs to take
        effect.
      </p>
      <ul className="space-y-2 mb-3">
        {report.interfaces.map((entry) => (
          <li key={entry.interface} className="flex flex-col gap-1">
            <span className="text-body-sm">{INTERFACE_LABEL[entry.interface]}</span>
            <code
              data-testid={`snap-permissions-command-${entry.interface}`}
              className="font-mono text-body-sm bg-surface_container_highest text-on_surface px-3 py-2 rounded select-all break-all"
            >
              {entry.command}
            </code>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          data-testid="snap-permissions-copy-all"
          type="button"
          onClick={() => void handleCopyAll()}
          className="px-3 py-1.5 text-body-sm rounded bg-primary_container/20 border border-primary_container/40 text-primary hover:bg-primary_container/30 transition-colors"
        >
          {copied ? 'Copied' : 'Copy all commands'}
        </button>
      </div>
      <p className="text-caption text-on_surface_variant/70 mt-2">
        Manual restart is required — the AppArmor profile of a running process is not refreshed by
        `snap connect`.
      </p>
    </div>
  );
}
