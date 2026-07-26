// src/renderer/src/components/SnapKeyringBanner.test.tsx
// Unit tests for the keyring-missing banner shown on the login screen when
// `session:save` returns `encryption_unavailable` under snap.
//
// ORAIN-0578 T1: the banner surfaces the exact `snap connect` command,
// offers a copy-to-clipboard button, and is not dismissable while the
// condition persists (no close button rendered at all — the parent
// controls visibility via the `visible` prop).

// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { SnapKeyringBanner } from './SnapKeyringBanner';

beforeAll(() => {
  // Mock clipboard API (jsdom doesn't ship navigator.clipboard by default)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('SnapKeyringBanner', () => {
  const command = 'sudo snap connect jellytunes:password-manager-service';

  it('renders nothing when not visible', () => {
    const { container } = render(
      <SnapKeyringBanner visible={false} command={command} snapName="jellytunes" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the snap connect command when visible', () => {
    render(<SnapKeyringBanner visible={true} command={command} snapName="jellytunes" />);
    expect(screen.getByTestId('snap-keyring-banner')).toBeInTheDocument();
    expect(screen.getByText(command)).toBeInTheDocument();
  });

  it('mentions that JellyTunes must be restarted after connecting', () => {
    render(<SnapKeyringBanner visible={true} command={command} snapName="jellytunes" />);
    // Reinicio manual — único modo garantizado (AppArmor profile no se refresca en proceso vivo).
    expect(screen.getByText(/restart JellyTunes/i)).toBeInTheDocument();
  });

  it('copies the command to clipboard when the copy button is clicked', async () => {
    render(<SnapKeyringBanner visible={true} command={command} snapName="jellytunes" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('snap-keyring-copy'));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(command);
  });

  it('has no close button — the banner is not dismissable while the condition persists', () => {
    // ORAIN-0578 AC: "no descartable mientras la condición persista" — the
    // parent gates visibility via the `visible` prop, so a built-in close
    // button would only let the user hide a problem we cannot fix without
    // their action.
    render(<SnapKeyringBanner visible={true} command={command} snapName="jellytunes" />);
    expect(screen.queryByRole('button', { name: /dismiss|close|cerrar/i })).not.toBeInTheDocument();
  });
});
