// src/renderer/src/components/SnapKeyringBanner.tsx
// ORAIN-0578 T1: shown on the login screen when `session:save` returns
// `encryption_unavailable` while running under snap. Surfaces the exact
// `snap connect` command to fix the missing `password-manager-service`
// interface, plus a copy-to-clipboard button and a notice that JellyTunes
// must be restarted after connecting.
//
// Not dismissable: the AppArmor profile of a running process is not
// refreshed by `snap connect` (the new plug takes effect on the next
// launch), so closing the banner would just hide the only signal that
// tells the user what to do.

import { useState } from 'react';

interface SnapKeyringBannerProps {
  /** Whether the underlying condition still holds (set by the parent). */
  visible: boolean;
  /** The exact `sudo snap connect <snap>:password-manager-service` command. */
  command: string;
  /** Snap name to display in the headline (e.g. "jellytunes"). */
  snapName: string;
}

export function SnapKeyringBanner({
  visible,
  command,
  snapName,
}: SnapKeyringBannerProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard not available (e.g. permission denied) — leave the
      // command visible so the user can select and copy manually.
    }
  };

  return (
    <div
      data-testid="snap-keyring-banner"
      role="alert"
      className="bg-error_container border border-error/40 text-on_error_container rounded-lg p-4 mb-4"
    >
      <p className="text-body-md font-medium mb-1">
        Session login won’t persist on this snap install
      </p>
      <p className="text-body-sm mb-3">
        The <code className="font-mono">password-manager-service</code> interface is not connected
        to <strong>{snapName}</strong>, so encrypted credentials can’t be saved. Run the command
        below in a terminal, then restart JellyTunes:
      </p>
      <div className="flex items-stretch gap-2">
        <code
          data-testid="snap-keyring-command"
          className="flex-1 font-mono text-body-sm bg-surface_container_highest text-on_surface px-3 py-2 rounded select-all break-all"
        >
          {command}
        </code>
        <button
          data-testid="snap-keyring-copy"
          type="button"
          onClick={() => void handleCopy()}
          className="px-3 py-2 text-body-sm rounded bg-primary text-on_primary hover:bg-primary/90 transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-caption text-on_error_container/70 mt-2">
        Manual restart is required — the new plug takes effect on the next launch.
      </p>
    </div>
  );
}
