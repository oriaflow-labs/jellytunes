// src/renderer/src/components/NoSessionStorageBanner.tsx
// ORAIN-0590: shown on the login screen when no OS-backed encryption
// provider is available (neither `secret-tool` under snap nor
// `safeStorage` with a real keyring). Tells the user the session will
// not be saved — they will need to re-enter the URL and API key every
// time they open the app.
//
// Pure presentation, no state. The parent owns the boolean that drives
// visibility (`isSessionStorageAvailable` from main).
//
// Copy is deliberately neutral — no commands, no snap-specific jargon.
// The banner mechanism is the same red alert surface the snap-permissions
// banner uses, so visually it doesn't read as a new UI shape.

interface NoSessionStorageBannerProps {
  /** When false the banner shows; when true it returns null. */
  available: boolean;
}

export function NoSessionStorageBanner({
  available,
}: NoSessionStorageBannerProps): JSX.Element | null {
  if (available) return null;
  return (
    <div
      data-testid="no-session-storage-banner"
      role="alert"
      className="shrink-0 bg-error_container border-b border-error/40 text-on_error_container px-4 py-3"
    >
      <p className="text-body-md font-medium">Your session won&apos;t be saved</p>
      <p className="text-body-sm text-on_error_container/80 mt-1">
        JellyTunes couldn&apos;t find a secure place to store your login on this computer.
        You&apos;ll need to enter your server URL and API key every time you open the app.
      </p>
    </div>
  );
}
