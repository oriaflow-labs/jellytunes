// src/renderer/src/components/SnapPermissionsSection.test.tsx
// Unit tests for the about/settings section that surfaces missing snap
// interfaces with their exact `snap connect` commands.
//
// ORAIN-0578 T2: a line per missing interface, a single "copy all" button
// that puts every command on its own line (so the user can paste all of
// them into a terminal at once), and a restart notice. Renders nothing
// when there is nothing to report.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnapPermissionsSection } from './SnapPermissionsSection';

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe('SnapPermissionsSection', () => {
  const sampleReport = {
    isSnap: true,
    snapName: 'jellytunes',
    interfaces: [
      {
        interface: 'password-manager-service' as const,
        status: 'missing' as const,
        command: 'sudo snap connect jellytunes:password-manager-service',
      },
      {
        interface: 'mount-observe' as const,
        status: 'missing' as const,
        command: 'sudo snap connect jellytunes:mount-observe',
      },
    ],
  };

  it('renders nothing when there are no missing interfaces', () => {
    const { container } = render(
      <SnapPermissionsSection report={{ isSnap: true, snapName: 'jellytunes', interfaces: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when not running under snap', () => {
    // Defensive: even if the caller forgets to gate, we don't surface
    // snap-specific commands outside snap.
    const { container } = render(
      <SnapPermissionsSection report={{ isSnap: false, snapName: null, interfaces: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a line per missing interface with its command', () => {
    render(<SnapPermissionsSection report={sampleReport} />);
    expect(screen.getByTestId('snap-permissions-section')).toBeInTheDocument();
    // Each interface gets its own code block with the command.
    expect(
      screen.getByText('sudo snap connect jellytunes:password-manager-service'),
    ).toBeInTheDocument();
    expect(screen.getByText('sudo snap connect jellytunes:mount-observe')).toBeInTheDocument();
    // Per-line human-readable label (rendered alongside the same interface
    // name inside the <code> block, so use getAllByText).
    expect(screen.getAllByText(/password-manager-service/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/mount-observe/).length).toBeGreaterThanOrEqual(1);
  });

  it('covers all four interfaces, including hardware-observe', () => {
    // ORAIN-0578: hardware-observe is declared in the snapcraft plugs but was
    // not probed or surfaced, so a missing udev permission was invisible.
    const allFour = {
      isSnap: true,
      snapName: 'jellytunes',
      interfaces: (
        [
          'password-manager-service',
          'mount-observe',
          'removable-media',
          'hardware-observe',
        ] as const
      ).map((name) => ({
        interface: name,
        status: 'missing' as const,
        command: `sudo snap connect jellytunes:${name}`,
      })),
    };
    render(<SnapPermissionsSection report={allFour} />);
    expect(screen.getByText('sudo snap connect jellytunes:hardware-observe')).toBeInTheDocument();
    expect(screen.getByText(/udev access for USB attach\/detach events/i)).toBeInTheDocument();
  });

  it('shows the restart notice', () => {
    render(<SnapPermissionsSection report={sampleReport} />);
    expect(screen.getByText(/restart JellyTunes/i)).toBeInTheDocument();
  });

  it('copies all commands separated by newlines when "copy all" is clicked', async () => {
    render(<SnapPermissionsSection report={sampleReport} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('snap-permissions-copy-all'));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'sudo snap connect jellytunes:password-manager-service\nsudo snap connect jellytunes:mount-observe',
    );
  });
});
