/**
 * Tests — HelpPanel
 *
 * Covers:
 *  - Renders all five tab buttons
 *  - Default tab shows Quick Start content
 *  - Tab switching shows correct content
 *  - Close button calls onClose
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPanel from '../components/HelpPanel';

describe('HelpPanel — tabs', () => {
  it('renders all five tab buttons', () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByText(/🚀 Quick Start/i)).toBeInTheDocument();
    expect(screen.getByText(/🌱 Plants/i)).toBeInTheDocument();
    expect(screen.getByText(/🏗️ Structures/i)).toBeInTheDocument();
    expect(screen.getByText(/🌍 Multiplayer/i)).toBeInTheDocument();
    expect(screen.getByText(/💡 Tips/i)).toBeInTheDocument();
  });

  it('shows Quick Start content by default', () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByText(/Your first harvest/i)).toBeInTheDocument();
  });

  it('switches to Plants tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(/🌱 Plants/i));
    expect(screen.getByText(/Growth times/i)).toBeInTheDocument();
  });

  it('switches to Structures tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(/🏗️ Structures/i));
    expect(screen.getByText(/Structures/i)).toBeInTheDocument();
  });

  it('switches to Multiplayer tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(/🌍 Multiplayer/i));
    expect(screen.getByText(/Multiplayer/i)).toBeInTheDocument();
  });

  it('switches to Tips tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(/💡 Tips/i));
    expect(screen.getByText(/Tips/i)).toBeInTheDocument();
  });
});

describe('HelpPanel — close', () => {
  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<HelpPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close help panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
