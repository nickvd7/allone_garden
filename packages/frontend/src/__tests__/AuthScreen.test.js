import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import AuthScreen from '../components/AuthScreen';

jest.mock('axios');

describe('AuthScreen', () => {
  const noop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset URL so the reset-token useEffect doesn't activate by default
    delete window.location;
    window.location = { search: '' };
  });

  // ── Layout / mode switching ─────────────────────────────────────────────────

  it('renders the app title and subtitle', () => {
    render(<AuthScreen onLogin={noop} />);
    expect(screen.getByText('🌱 AllOne Garden')).toBeInTheDocument();
    expect(screen.getByText(/Open-source multiplayer/i)).toBeInTheDocument();
  });

  it('shows Login and Register tab buttons in default (login) mode', () => {
    render(<AuthScreen onLogin={noop} />);
    // Tab buttons — exact text = 'Login' and 'Register' (no emoji prefix)
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it('switches to Register mode when the Register tab is clicked', () => {
    render(<AuthScreen onLogin={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    // Submit button changes to "🌱 Create account"
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
  });

  it('switches back to Login mode when the Login tab is clicked', () => {
    render(<AuthScreen onLogin={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    // Email field disappears again
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
  });

  it('opens forgot-password mode from the "Wachtwoord vergeten?" link', () => {
    render(<AuthScreen onLogin={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Wachtwoord vergeten/i }));
    // Forgot heading appears; email field present; username/password gone
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  it('"Terug naar inloggen" returns from forgot mode to login', () => {
    render(<AuthScreen onLogin={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Wachtwoord vergeten/i }));
    fireEvent.click(screen.getByRole('button', { name: /Terug naar inloggen/i }));
    // Login/Register tabs are back
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  // ── Guest play ───────────────────────────────────────────────────────────────

  it('calls onLogin with a Guest user object when "Play as Guest" is clicked', () => {
    const onLogin = jest.fn();
    render(<AuthScreen onLogin={onLogin} />);
    fireEvent.click(screen.getByRole('button', { name: /Play as Guest/i }));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Guest' }),
      null
    );
  });

  // ── Login form submission ────────────────────────────────────────────────────

  it('calls the login API and invokes onLogin on success', async () => {
    const onLogin = jest.fn();
    axios.post.mockResolvedValueOnce({
      data: { token: 'tok123', user: { id: 1, username: 'Alice' } },
    });

    render(<AuthScreen onLogin={onLogin} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret123' } });

    // Submit button in login mode reads "🚪 Login" — distinct from the Login *tab* ('Login')
    fireEvent.click(screen.getByRole('button', { name: /🚪/ }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Alice' }),
      'tok123'
    );
  });

  it('shows an error message when login fails', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'Invalid credentials' } },
    });

    render(<AuthScreen onLogin={noop} />);
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /🚪/ }));

    await waitFor(() =>
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    );
  });

  // ── Register form ────────────────────────────────────────────────────────────

  it('includes email in the register API call', async () => {
    const onLogin = jest.fn();
    axios.post.mockResolvedValueOnce({
      data: { token: 'tok456', user: { id: 2, username: 'Bob' } },
    });

    render(<AuthScreen onLogin={onLogin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('Email'),    { target: { value: 'bob@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass12345' } });
    // Submit button in register mode reads "🌱 Create account"
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/register'),
      expect.objectContaining({ username: 'Bob', email: 'bob@example.com' })
    );
  });

  // ── Forgot-password form ─────────────────────────────────────────────────────

  it('shows a success message after forgot-password is submitted', async () => {
    axios.post.mockResolvedValueOnce({ data: {} });

    render(<AuthScreen onLogin={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Wachtwoord vergeten/i }));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'alice@example.com' } });
    // Submit button in forgot mode reads "📧 Stuur resetlink"
    fireEvent.click(screen.getByRole('button', { name: /Stuur resetlink/i }));

    await waitFor(() =>
      expect(screen.getByText(/Als dit adres bekend is/i)).toBeInTheDocument()
    );
  });

  // ── Reset-password mode via URL token ────────────────────────────────────────

  it('activates reset mode when ?token= is present in the URL', () => {
    window.location = { search: '?token=abc123' };

    render(<AuthScreen onLogin={noop} />);
    // Reset mode shows the new-password input and "🔐 Wachtwoord opslaan" button
    expect(screen.getByPlaceholderText('Nieuw wachtwoord')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wachtwoord opslaan/i })).toBeInTheDocument();
  });
});
