import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetupWizard from '../components/SetupWizard';

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderWizard(electronAPI = null) {
  // Set up window.electronAPI mock
  if (electronAPI) {
    window.electronAPI = electronAPI;
  } else {
    delete window.electronAPI;
  }
  return render(<SetupWizard />);
}

afterEach(() => {
  delete window.electronAPI;
  delete window.__ELECTRON_SETUP__;
});

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
describe('SetupWizard — Welcome step', () => {
  it('renders the welcome heading', () => {
    renderWizard();
    expect(screen.getByText(/Welcome to AllOne Garden/i)).toBeInTheDocument();
  });

  it('renders a Get Started button', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /Get Started/i })).toBeInTheDocument();
  });

  it('shows progress dots', () => {
    const { container } = renderWizard();
    // 3 dots total, first one active
    const dots = container.querySelectorAll('[style*="border-radius: 50%"]');
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  it('advances to mode selection on Get Started click', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
    expect(screen.getByText(/How do you want to play\?/i)).toBeInTheDocument();
  });
});

// ── Step 1: Mode selection ─────────────────────────────────────────────────────
describe('SetupWizard — Mode step', () => {
  function advanceToMode() {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
  }

  it('shows Local server and Join a server options', () => {
    advanceToMode();
    expect(screen.getByText(/Local server/i)).toBeInTheDocument();
    expect(screen.getByText(/Join a server/i)).toBeInTheDocument();
  });

  it('Next button is disabled until mode is selected', () => {
    advanceToMode();
    expect(screen.getByRole('button', { name: /Next →/i })).toBeDisabled();
  });

  it('enables Next button after selecting Local', () => {
    advanceToMode();
    fireEvent.click(screen.getByText(/Local server/i));
    expect(screen.getByRole('button', { name: /Next →/i })).not.toBeDisabled();
  });

  it('enables Next button after selecting Remote', () => {
    advanceToMode();
    fireEvent.click(screen.getByText(/Join a server/i));
    expect(screen.getByRole('button', { name: /Next →/i })).not.toBeDisabled();
  });

  it('can go Back to Welcome from Mode step', () => {
    advanceToMode();
    fireEvent.click(screen.getByRole('button', { name: /← Back/i }));
    expect(screen.getByText(/Welcome to AllOne Garden/i)).toBeInTheDocument();
  });

  it('advances to Configure step after selecting mode and clicking Next', () => {
    advanceToMode();
    fireEvent.click(screen.getByText(/Local server/i));
    fireEvent.click(screen.getByRole('button', { name: /Next →/i }));
    expect(screen.getByText(/Configure your local server/i)).toBeInTheDocument();
  });
});

// ── Step 2: Configure (Local mode) ────────────────────────────────────────────
describe('SetupWizard — Configure step (local)', () => {
  function advanceToLocal() {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
    fireEvent.click(screen.getByText(/Local server/i));
    fireEvent.click(screen.getByRole('button', { name: /Next →/i }));
  }

  it('shows server name and port fields', () => {
    advanceToLocal();
    expect(screen.getByLabelText(/Server name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Port/i)).toBeInTheDocument();
  });

  it('default server name is "My Garden"', () => {
    advanceToLocal();
    expect(screen.getByLabelText(/Server name/i)).toHaveValue('My Garden');
  });

  it('default port is 5000', () => {
    advanceToLocal();
    expect(screen.getByLabelText(/Port/i)).toHaveValue(5000);
  });

  it('can change server name', () => {
    advanceToLocal();
    const input = screen.getByLabelText(/Server name/i);
    fireEvent.change(input, { target: { value: 'Nick\'s Garden' } });
    expect(input).toHaveValue('Nick\'s Garden');
  });

  it('shows error when server name is empty on submit', async () => {
    advanceToLocal();
    const input = screen.getByLabelText(/Server name/i);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Start playing/i }));
    await screen.findByText(/Please enter a server name/i);
  });

  it('calls electronAPI.completeSetup with local config on submit', async () => {
    const mockSetup = jest.fn().mockResolvedValue({ ok: true });
    advanceToLocal();
    // re-set electronAPI after render (advanceToLocal doesn't pass it)
    window.electronAPI = { completeSetup: mockSetup, isElectron: true };

    const input = screen.getByLabelText(/Server name/i);
    fireEvent.change(input, { target: { value: 'Test Garden' } });
    fireEvent.click(screen.getByRole('button', { name: /Start playing/i }));

    await waitFor(() => expect(mockSetup).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local', serverName: 'Test Garden' })
    ));
  });

  it('shows "Starting…" spinner after submitting local config', async () => {
    const mockSetup = jest.fn(() => new Promise(() => {})); // never resolves
    window.electronAPI = { completeSetup: mockSetup, isElectron: true };
    advanceToLocal();

    fireEvent.click(screen.getByRole('button', { name: /Start playing/i }));
    await screen.findByText(/Starting your garden/i);
  });

  it('can go Back from Configure to Mode', () => {
    advanceToLocal();
    fireEvent.click(screen.getByRole('button', { name: /← Back/i }));
    expect(screen.getByText(/How do you want to play\?/i)).toBeInTheDocument();
  });
});

// ── Step 2: Configure (Remote mode) ───────────────────────────────────────────
describe('SetupWizard — Configure step (remote)', () => {
  function advanceToRemote() {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
    fireEvent.click(screen.getByText(/Join a server/i));
    fireEvent.click(screen.getByRole('button', { name: /Next →/i }));
  }

  it('shows server URL input', () => {
    advanceToRemote();
    expect(screen.getByLabelText(/Server URL/i)).toBeInTheDocument();
  });

  it('Connect button is disabled when URL is empty', () => {
    advanceToRemote();
    expect(screen.getByRole('button', { name: /Connect!/i })).toBeDisabled();
  });

  it('Connect button enables when URL is filled', () => {
    advanceToRemote();
    fireEvent.change(screen.getByLabelText(/Server URL/i), {
      target: { value: 'https://garden.example.com' },
    });
    expect(screen.getByRole('button', { name: /Connect!/i })).not.toBeDisabled();
  });

  it('shows validation error for non-http URL', async () => {
    advanceToRemote();
    fireEvent.change(screen.getByLabelText(/Server URL/i), {
      target: { value: 'garden.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Connect!/i }));
    await screen.findByText(/must start with http/i);
  });

  it('calls electronAPI.completeSetup with remote config', async () => {
    const mockSetup = jest.fn().mockResolvedValue({ ok: true });
    advanceToRemote();
    // Set electronAPI AFTER renderWizard() so it isn't deleted by the helper
    window.electronAPI = { completeSetup: mockSetup, isElectron: true };

    fireEvent.change(screen.getByLabelText(/Server URL/i), {
      target: { value: 'https://garden.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Connect!/i }));

    await waitFor(() => expect(mockSetup).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'remote', serverUrl: 'https://garden.example.com' })
    ));
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────
describe('SetupWizard — accessibility', () => {
  it('has role=main and aria-label on the overlay', () => {
    renderWizard();
    expect(screen.getByRole('main', { name: /Setup wizard/i })).toBeInTheDocument();
  });
});
