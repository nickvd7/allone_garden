import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GradendexPanel from '../components/GradendexPanel';

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

jest.mock('../components/ContentWikiPage', () =>
  function MockWiki() {
    return <div data-testid="content-wiki">wiki</div>;
  }
);

jest.mock('../components/PlantRecognitionModal', () =>
  function MockRecognize() {
    return <div data-testid="plant-recognize">recognize</div>;
  }
);

describe('GradendexPanel', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders hub title', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders wiki tab by default', () => {
    render(<GradendexPanel onClose={onClose} />);
    expect(screen.getByTestId('content-wiki')).toBeInTheDocument();
  });

  it('switches to gradendex tab', () => {
    render(<GradendexPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: /Gradendex/i }));
    expect(screen.getByTestId('gradendex-view')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(<GradendexPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    render(<GradendexPanel onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders full page link', () => {
    render(<GradendexPanel onClose={onClose} />);
    const link = screen.getByRole('link', { name: /Full page/i });
    expect(link).toHaveAttribute('href', '/gradendex');
  });
});
