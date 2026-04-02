import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../components/Header';

describe('Header', () => {
  const noop = jest.fn();

  const defaultProps = {
    onLanguageChange: noop,
    currentLang: 'en',
    serverInfo: null,
    username: null,
    darkMode: false,
    onToggleDark: noop,
    onLogout: noop,
    onOpenTrade: null,
    onOpenPlugins: null,
    onOpenAchievements: null,
    onOpenAdmin: null,
    onOpenAccount: noop,
    onOpenLeaderboard: null,
    onOpenWorldMap: null,
  };

  // ── Title ───────────────────────────────────────────────────────────────────

  it('renders the h1 heading', () => {
    render(<Header {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByAltText('AllOne Garden')).toBeInTheDocument();
  });

  // ── Language selector ───────────────────────────────────────────────────────

  it('renders the language selector with the extended language set', () => {
    render(<Header {...defaultProps} />);
    const select = screen.getByRole('combobox', { name: /language/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /EN/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /NL/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /DE/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /FR/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ES/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /TR/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ZH/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /KO/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /HI/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ID/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /VI/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /UK/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /AR/i })).toBeInTheDocument();
  });

  it('shows the currently active language', () => {
    render(<Header {...defaultProps} currentLang="nl" />);
    expect(screen.getByRole('combobox', { name: /language/i })).toHaveValue('nl');
  });

  it('calls onLanguageChange when the language is changed', () => {
    const onLanguageChange = jest.fn();
    render(<Header {...defaultProps} onLanguageChange={onLanguageChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: /language/i }), {
      target: { value: 'de' },
    });
    expect(onLanguageChange).toHaveBeenCalledWith('de');
  });

  // ── Dark mode ───────────────────────────────────────────────────────────────

  it('shows moon icon when dark mode is off', () => {
    render(<Header {...defaultProps} darkMode={false} />);
    // button has aria-label="Toggle dark mode"
    expect(screen.getByRole('button', { name: /toggle dark mode/i })).toHaveTextContent('🌙');
  });

  it('shows sun icon when dark mode is on', () => {
    render(<Header {...defaultProps} darkMode={true} />);
    expect(screen.getByRole('button', { name: /toggle dark mode/i })).toHaveTextContent('☀️');
  });

  it('calls onToggleDark when the dark mode button is clicked', () => {
    const onToggleDark = jest.fn();
    render(<Header {...defaultProps} onToggleDark={onToggleDark} />);
    fireEvent.click(screen.getByRole('button', { name: /toggle dark mode/i }));
    expect(onToggleDark).toHaveBeenCalledTimes(1);
  });

  // ── Username ─────────────────────────────────────────────────────────────────

  it('shows the username in the account button when provided', () => {
    render(<Header {...defaultProps} username="Alice" />);
    // button title="Account settings" contains the username
    const accountBtn = screen.getByTitle('Account settings');
    expect(accountBtn).toBeInTheDocument();
    expect(accountBtn).toHaveTextContent('Alice');
  });

  it('does not show the account button when username is null', () => {
    render(<Header {...defaultProps} username={null} />);
    expect(screen.queryByTitle('Account settings')).not.toBeInTheDocument();
  });

  // ── Server badge ─────────────────────────────────────────────────────────────

  it('shows server badge with name when serverInfo is provided', () => {
    render(<Header {...defaultProps} serverInfo={{ name: 'My Garden', players: 5 }} />);
    const badge = screen.getByText('My Garden');
    expect(badge).toBeInTheDocument();
  });

  it('does not show server badge when serverInfo is null', () => {
    render(<Header {...defaultProps} serverInfo={null} />);
    expect(screen.queryByText(/online/)).not.toBeInTheDocument();
  });

  // ── Optional action buttons ───────────────────────────────────────────────────

  it('shows Trade button and calls onOpenTrade on click', () => {
    const onOpenTrade = jest.fn();
    render(<Header {...defaultProps} onOpenTrade={onOpenTrade} />);
    const btn = screen.getByTitle('Marketplace');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenTrade).toHaveBeenCalledTimes(1);
  });

  it('does not show Trade button when onOpenTrade is null', () => {
    render(<Header {...defaultProps} onOpenTrade={null} />);
    expect(screen.queryByTitle('Marketplace')).not.toBeInTheDocument();
  });

  it('shows World Map button and calls onOpenWorldMap on click', () => {
    const onOpenWorldMap = jest.fn();
    render(<Header {...defaultProps} onOpenWorldMap={onOpenWorldMap} />);
    const btn = screen.getByTitle(/World Map/i);
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenWorldMap).toHaveBeenCalledTimes(1);
  });

  it('opens More menu and calls onOpenLeaderboard from Scores', () => {
    const onOpenLeaderboard = jest.fn();
    render(<Header {...defaultProps} onOpenLeaderboard={onOpenLeaderboard} />);
    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    const item = screen.getByRole('menuitem', { name: /Scores/i });
    fireEvent.click(item);
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('calls onLogout when the Logout button is clicked', () => {
    const onLogout = jest.fn();
    render(<Header {...defaultProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByTitle('Log out'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
