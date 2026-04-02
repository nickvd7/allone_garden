/**
 * Tests — ErrorBoundary
 *
 * Covers:
 *  - Renders children when no error
 *  - Catches a render error and shows fallback UI
 *  - Shows the error message in a <pre>
 *  - Reload button triggers window.location.reload
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

// Suppress expected console.error from the thrown error
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// Component that throws on demand
function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('Garden exploded');
  return <div>All good</div>;
}

describe('ErrorBoundary — no error', () => {
  it('renders children normally', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('does not show fallback UI when no error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });
});

describe('ErrorBoundary — with error', () => {
  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('shows the error message in a pre element', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Garden exploded')).toBeInTheDocument();
  });

  it('shows the 🌱 emoji in the fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('🌱')).toBeInTheDocument();
  });

  it('shows "Reload garden" button', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /Reload garden/i })).toBeInTheDocument();
  });

  it('calls window.location.reload on Reload click', () => {
    const reload = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /Reload garden/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not render children in error state', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
  });
});
