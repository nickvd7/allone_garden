import React from 'react';
import { render, screen } from '@testing-library/react';
import GradendexPage from '../components/GradendexPage';

// Mock GradendexView — GradendexPage tests focus on page layout, not view internals
jest.mock('../components/GradendexView', () =>
  function MockGradendexView({ token, compact }) {
    return (
      <div data-testid="gradendex-view">
        <span data-testid="view-token">{token || 'no-token'}</span>
        <span data-testid="view-compact">{String(compact)}</span>
      </div>
    );
  }
);

// Control localStorage per test
let localStorageStore = {};
beforeEach(() => {
  localStorageStore = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) =>
    localStorageStore[key] !== undefined ? localStorageStore[key] : null
  );
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
    localStorageStore[key] = val;
  });
  jest.spyOn(document.documentElement, 'setAttribute');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GradendexPage', () => {
  it('renders the Gradendex page title', () => {
    render(<GradendexPage />);
    // The h1 contains 📖 Gradendex
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gradendex');
  });

  it('renders the AllOne Garden breadcrumb link', () => {
    render(<GradendexPage />);
    // Use link role so we pick the <a> anchor specifically, not ancestor elements
    const link = screen.getByRole('link', { name: /AllOne Garden/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the dark-mode toggle button', () => {
    render(<GradendexPage />);
    // Default is light mode → shows 🌙
    expect(screen.getByTitle(/Switch to dark mode/i)).toBeInTheDocument();
  });

  it('renders GradendexView', () => {
    render(<GradendexPage />);
    expect(screen.getByTestId('gradendex-view')).toBeInTheDocument();
  });

  it('passes compact=false to GradendexView', () => {
    render(<GradendexPage />);
    expect(screen.getByTestId('view-compact')).toHaveTextContent('false');
  });

  it('passes null token when no JWT in localStorage', () => {
    render(<GradendexPage />);
    expect(screen.getByTestId('view-token')).toHaveTextContent('no-token');
  });

  it('passes stored token to GradendexView when user is logged in', () => {
    localStorageStore['garden_token'] = 'stored-jwt';
    render(<GradendexPage />);
    expect(screen.getByTestId('view-token')).toHaveTextContent('stored-jwt');
  });

  it('shows "Log in" link when no token present', () => {
    render(<GradendexPage />);
    expect(screen.getByText(/Log in/i)).toBeInTheDocument();
  });

  it('shows "Back to game" link when token is stored', () => {
    localStorageStore['garden_token'] = 'stored-jwt';
    render(<GradendexPage />);
    expect(screen.getByText(/Back to game/i)).toBeInTheDocument();
  });

  it('does not show "Back to game" when not logged in', () => {
    render(<GradendexPage />);
    expect(screen.queryByText(/Back to game/i)).not.toBeInTheDocument();
  });

  it('renders footer with API URL hint', () => {
    render(<GradendexPage />);
    expect(screen.getByText(/api\/gradendex/i)).toBeInTheDocument();
  });

  it('shows ☀️ toggle when dark mode is on', () => {
    localStorageStore['garden_dark'] = 'true';
    render(<GradendexPage />);
    expect(screen.getByTitle(/Switch to light mode/i)).toBeInTheDocument();
  });

  it('applies data-theme attribute on mount', () => {
    render(<GradendexPage />);
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });
});
