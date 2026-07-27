// src/renderer/src/components/NoSessionStorageBanner.test.tsx
// Unit tests for the no-session-storage banner.
//
// ORAIN-0590: when neither `secret-tool` nor `safeStorage` is available,
// the login screen needs to tell the user that the session won't persist
// — without proposing commands (the snap connection is gone) and without
// leaking implementation details (which provider was tried). The banner
// is pure presentation; the boolean comes from main via
// `window.api.isSessionStorageAvailable`.

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NoSessionStorageBanner } from './NoSessionStorageBanner';

describe('NoSessionStorageBanner', () => {
  it('renders nothing when an encryption provider is available', () => {
    const { container } = render(<NoSessionStorageBanner available={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the banner when no encryption provider is available', () => {
    render(<NoSessionStorageBanner available={false} />);
    expect(screen.getByTestId('no-session-storage-banner')).toBeInTheDocument();
  });

  it('tells the user the session will not be saved', () => {
    render(<NoSessionStorageBanner available={false} />);
    expect(screen.getByText(/won't be saved/i)).toBeInTheDocument();
  });

  it('tells the user they will need to re-enter credentials', () => {
    render(<NoSessionStorageBanner available={false} />);
    expect(screen.getByText(/every time you open the app/i)).toBeInTheDocument();
  });

  it('does NOT propose any snap connect commands', () => {
    // ORAIN-0590 AC: "Sin proponer comandos." The interface is gone from
    // the snap plugs; surfacing `sudo snap connect ...` would be wrong.
    render(<NoSessionStorageBanner available={false} />);
    expect(screen.queryByText(/snap connect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/password-manager-service/i)).not.toBeInTheDocument();
  });

  it('is announced to assistive tech as an alert', () => {
    render(<NoSessionStorageBanner available={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('uses the same red alert surface as SnapPermissionsBanner', () => {
    // Visual consistency — both banners are critical, dismissable
    // conditions that the user must see.
    const { container } = render(<NoSessionStorageBanner available={false} />);
    expect(container.querySelector('[data-testid="no-session-storage-banner"]')).toHaveClass(
      'bg-error_container',
    );
  });
});
