// src/renderer/src/components/SnapPermissionsBanner.test.tsx
// Unit tests for the persistent banner that surfaces every snap interface
// whose plug isn't connected, with the `snap connect` command for each.
//
// ORAIN-0578: replaces the keyring-only banner. It is driven purely by the
// report from `snap:checkPermissions`, so it no longer depends on a failed
// `session:save` to appear — the previous design could only trigger in a
// state where its host screen was already unmounted.
//
// ORAIN-0590: `password-manager-service` is no longer surfaced (the
// session-storage provider switched to `secret-tool`).
// ORAIN-0591: `hardware-observe` is no longer surfaced either (USB
// detection under snap uses polling only).
// ORAIN-0592: `mount-observe` is no longer surfaced either (nested mount
// detection uses `st_dev`/`statfs` instead of `/proc/mounts`).
// `removable-media` is now the only interface the banner can show.

// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { SnapPermissionsBanner } from './SnapPermissionsBanner';
import type { SnapPermissionsReport } from '../utils/snapPermissions';

beforeAll(() => {
  // jsdom doesn't ship navigator.clipboard by default
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

const removableCommand = 'sudo snap connect jellytunes:removable-media';

// ORAIN-0590 (password-manager-service), ORAIN-0591 (hardware-observe) and
// ORAIN-0592 (mount-observe) all removed — the banner now surfaces the one
// remaining interface only.
const allMissing: SnapPermissionsReport = {
  isSnap: true,
  snapName: 'jellytunes',
  interfaces: [{ interface: 'removable-media', status: 'missing', command: removableCommand }],
};

describe('SnapPermissionsBanner', () => {
  describe('suppression', () => {
    it('renders nothing outside snap', () => {
      const { container } = render(
        <SnapPermissionsBanner report={{ isSnap: false, snapName: null, interfaces: [] }} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing under snap when every interface is connected', () => {
      const { container } = render(
        <SnapPermissionsBanner report={{ isSnap: true, snapName: 'jellytunes', interfaces: [] }} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('missing interfaces', () => {
    it('lists the command when the plug is missing', () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      expect(screen.getByTestId('snap-permissions-banner')).toBeInTheDocument();
      expect(screen.getByText(removableCommand)).toBeInTheDocument();
    });

    it('renders one row per missing interface, keyed by interface name', () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      expect(screen.getByTestId('snap-permissions-banner-row-removable-media')).toBeInTheDocument();
    });

    it('shows only the interfaces that are actually missing', () => {
      render(
        <SnapPermissionsBanner
          report={{
            isSnap: true,
            snapName: 'jellytunes',
            interfaces: [
              { interface: 'removable-media', status: 'missing', command: removableCommand },
            ],
          }}
        />,
      );
      expect(screen.getByText(removableCommand)).toBeInTheDocument();
      expect(
        screen.queryByTestId('snap-permissions-banner-row-password-manager-service'),
      ).not.toBeInTheDocument();
    });

    it('explains the user-visible impact of each missing interface', () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      expect(screen.getByText(/do not appear in the device list/i)).toBeInTheDocument();
    });

    it('is announced to assistive tech as an alert', () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('mentions that JellyTunes must be restarted after connecting', () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      expect(screen.getByText(/restart JellyTunes/i)).toBeInTheDocument();
    });
  });

  describe('copy', () => {
    it('copies every command, one per line, from the copy-all button', async () => {
      render(<SnapPermissionsBanner report={allMissing} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('snap-permissions-banner-copy-all'));
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith([removableCommand].join('\n'));
    });

    it('keeps the commands visible when the clipboard write fails', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
      render(<SnapPermissionsBanner report={allMissing} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('snap-permissions-banner-copy-all'));
      });
      expect(screen.getByText(removableCommand)).toBeInTheDocument();
    });
  });

  it('has no close button — not dismissable while the condition persists', () => {
    // `snap connect` does not refresh the AppArmor profile of a running
    // process, so hiding the banner would hide the only signal telling the
    // user what to run and that a restart is required.
    render(<SnapPermissionsBanner report={allMissing} />);
    expect(screen.queryByRole('button', { name: /dismiss|close|cerrar/i })).not.toBeInTheDocument();
  });
});
