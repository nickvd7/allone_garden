import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GradendexPanel from '../components/GradendexPanel';

// Mock GradendexView so panel tests focus on panel behaviour (not view internals)
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

describe('GradendexPanel', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the panel with header title', () => {
    render(<GradendexPanel onClose={onClose} />);
    // i18n mock uses defaultValue: full title includes emoji prefix
    expect(screen.getByText(/Gradendex/)).toBeInTheDocument();
  });

  it('renders GradendexView inside the panel', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByTestId('gradendex-view')).toBeInTheDocument();
  });

  it('passes token to GradendexView', () => {
    render(<GradendexPanel token="my-jwt" onClose={onClose} />);
    expect(screen.getByTestId('view-token')).toHaveTextContent('my-jwt');
  });

  it('passes compact=true to GradendexView', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByTestId('view-compact')).toHaveTextContent('true');
  });

  it('shows a close button', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByTitle(/Close Gradendex/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<GradendexPanel onClose={onClose} />);
    fireEvent.click(screen.getByTitle(/Close Gradendex/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    render(<GradendexPanel onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<GradendexPanel onClose={onClose} />);
    // The outer overlay div has the click handler
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel', () => {
    render(<GradendexPanel onClose={onClose} />);
    // Clicking inside the view should not trigger close
    fireEvent.click(screen.getByTestId('gradendex-view'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has aria-modal and aria-label on the dialog', () => {
    render(<GradendexPanel onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Gradendex');
  });

  it('renders a "Full page" link targeting /gradendex', () => {
    render(<GradendexPanel onClose={onClose} />);
    const link = screen.getByTitle(/Open Gradendex in full page/i);
    expect(link).toHaveAttribute('href', '/gradendex');
  });

  it('renders subtitle text', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByText(/crop.*structure reference/i)).toBeInTheDocument();
  });
});
