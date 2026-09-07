// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { LoginScreen } from './LoginScreen';

// Mock clipboard for SnapKeyringBanner (re-uses the same navigator.clipboard shim)
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

const mockApi = {
  listUsbDevices: vi.fn().mockResolvedValue([]),
  getDeviceInfo: vi.fn().mockResolvedValue({ total: 32e9, free: 16e9, used: 16e9 }),
  getFilesystem: vi.fn().mockResolvedValue('exfat'),
  getSyncedItems: vi.fn().mockResolvedValue([]),
  analyzeDiff: vi.fn().mockResolvedValue({ success: true, items: [] }),
  estimateSize: vi.fn().mockResolvedValue({ trackCount: 0, totalBytes: 0, formatBreakdown: {} }),
  startSync2: vi
    .fn()
    .mockResolvedValue({ success: true, tracksCopied: 10, tracksSkipped: 5, errors: [] }),
  removeItems: vi.fn().mockResolvedValue({ removed: 0, errors: [] }),
  cancelSync: vi.fn().mockResolvedValue({ cancelled: true }),
  onSyncProgress: vi.fn().mockReturnValue(() => {}),
  getDeviceSyncInfo: vi.fn().mockResolvedValue(null),
  selectFolder: vi.fn().mockResolvedValue('/mnt/usb'),
  saveSession: vi.fn().mockResolvedValue({ success: true }),
  loadSession: vi.fn().mockResolvedValue(null),
  clearSession: vi.fn().mockResolvedValue(undefined),
};
beforeAll(() => {
  Object.defineProperty(window, 'api', { value: mockApi, writable: true });
});
afterEach(() => {
  vi.resetAllMocks();
});

describe('LoginScreen', () => {
  // 1. renders with URL and API key inputs visible
  it('renders with URL and API key inputs visible', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    expect(screen.getByTestId('server-url-input')).toBeInTheDocument();
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
  });

  // 2. Connect button visible and inputs have required attribute
  it('Connect button is visible and inputs have required attribute', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    const connectButton = screen.getByTestId('connect-button');
    const urlInput = screen.getByTestId('server-url-input');
    const apiKeyInput = screen.getByTestId('api-key-input');
    expect(connectButton).toBeInTheDocument();
    expect(urlInput).toHaveAttribute('required');
    expect(apiKeyInput).toHaveAttribute('required');
  });

  // 3. submit with values: onSubmit called with url and apiKey
  it('calls onSubmit with url and apiKey when form is submitted', async () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    const form = document.querySelector('form') as HTMLFormElement;

    // Set actual DOM input values (form's onSubmit reads from DOM elements, not React state)
    const urlInput = form.elements.namedItem('url') as HTMLInputElement;
    const apiKeyInput = form.elements.namedItem('apiKey') as HTMLInputElement;

    // Update DOM values and fire input events so React's onChange fires
    await act(async () => {
      urlInput.value = 'https://jellyfin.example.com';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      apiKeyInput.value = 'test-api-key-123';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Submit the form
    await act(async () => {
      form.requestSubmit();
    });

    expect(props.onSubmit).toHaveBeenCalled();
    const call = props.onSubmit.mock.calls[0];
    expect(call[0]).toBe('https://jellyfin.example.com');
    expect(call[1]).toBe('test-api-key-123');
  });

  // 4. error visible when error prop is a string
  it('shows error message when error prop is a string', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: 'Invalid credentials' as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid credentials');
  });

  // 5. API key helper text visible
  it('shows API key helper text', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    expect(screen.getByText(/Get your API Key in Jellyfin/)).toBeInTheDocument();
  });

  // 6. English strings displayed (default locale)
  it('displays English strings', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    // Header should be in English
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Connect to Jellyfin');
    // Label should be in English
    expect(screen.getByText('Server URL')).toBeInTheDocument();
    // Placeholder should be in English
    expect(screen.getByPlaceholderText(/jellyfin.example.com/i)).toBeInTheDocument();
    // API Key label in English
    expect(screen.getByText('API Key')).toBeInTheDocument();
    // Button should be in English
    expect(screen.getByRole('button')).toHaveTextContent('Connect');
    // Helper text should be in English
    expect(screen.getByText(/Get your API Key in Jellyfin/)).toBeInTheDocument();
  });

  // 7. ORAIN-0578: the snap permission banner is owned by `App`, not by this
  // screen. Keeping it here is what made it unreachable — it could only be
  // raised once the connection succeeded, which unmounts this screen.
  it('does not render any snap banner itself', () => {
    const props = {
      urlInput: '',
      apiKeyInput: '',
      error: null as string | null,
      onUrlChange: vi.fn(),
      onApiKeyChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    render(<LoginScreen {...props} />);
    expect(screen.queryByTestId('snap-permissions-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('snap-keyring-banner')).not.toBeInTheDocument();
  });
});

// ORAIN-0564 SO-1 — username+password mode in LoginScreen.
// The recommended runtime path is password mode; API key is the advanced
// fallback for administrators (mirrors the design constraint in the spec).
describe('LoginScreen — password mode (ORAIN-0564 SO-1)', () => {
  const baseProps = () => ({
    urlInput: '',
    apiKeyInput: '',
    usernameInput: '',
    passwordInput: '',
    error: null as string | null,
    onUrlChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onUsernameChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    onPasswordSubmit: vi.fn(),
  });

  it('renders password mode by default (username + password inputs visible without clicking a toggle)', () => {
    render(<LoginScreen {...baseProps()} />);
    expect(screen.getByTestId('username-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
  });

  it('renders a visible toggle to switch to API key mode, labelled as advanced', () => {
    render(<LoginScreen {...baseProps()} />);
    const toggle = screen.getByTestId('mode-toggle-apikey');
    expect(toggle).toBeInTheDocument();
    expect(toggle.textContent ?? '').toMatch(/advanced|administrator|admin/i);
  });

  it('submits with (url, username, password) when password form is submitted', async () => {
    const props = baseProps();
    render(<LoginScreen {...props} />);

    const urlInput = screen.getByTestId('server-url-input') as HTMLInputElement;
    const usernameInput = screen.getByTestId('username-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('password-input') as HTMLInputElement;

    await act(async () => {
      urlInput.value = 'https://jellyfin.example.com';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.value = 'alice';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.value = 's3cret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(props.onPasswordSubmit).toHaveBeenCalledTimes(1);
    const call = props.onPasswordSubmit.mock.calls[0];
    expect(call[0]).toBe('https://jellyfin.example.com');
    expect(call[1]).toBe('alice');
    expect(call[2]).toBe('s3cret');
  });

  it('still exposes the API-key inputs when the toggle is activated (default password mode is recommended)', () => {
    render(<LoginScreen {...baseProps()} />);
    // Password mode is the default; API-key mode needs an explicit toggle click.
    const toggle = screen.getByTestId('mode-toggle-apikey');
    act(() => {
      toggle.click();
    });
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
    expect(screen.queryByTestId('username-input')).not.toBeInTheDocument();
  });
});
