import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TourOverlay, { TOUR_STEPS } from '../components/TourOverlay';
import HelpPanel from '../components/HelpPanel';

// ── TourOverlay ───────────────────────────────────────────────────────────────
describe('TourOverlay', () => {
  it('renders the first step title on mount', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('renders the step body text', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(TOUR_STEPS[0].body)).toBeInTheDocument();
  });

  it('renders progress dots equal to the number of steps', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    // Each dot has role="button" with aria-label "Go to step N"
    const dots = screen.getAllByRole('button', { name: /Go to step/i });
    expect(dots).toHaveLength(TOUR_STEPS.length);
  });

  it('shows "Next →" button on the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Next →/ })).toBeInTheDocument();
  });

  it('does NOT show "Back" button on the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
  });

  it('shows "Back" button after advancing past the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next →/ }));
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('advances to step 2 when "Next" is clicked', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next →/ }));
    expect(screen.getByText(TOUR_STEPS[1].title)).toBeInTheDocument();
  });

  it('goes back to step 1 when "Back" is clicked from step 2', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next →/ }));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('shows "🌱 Start playing!" button on the last step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    // Advance to the last step by clicking a progress dot
    const lastDot = screen.getAllByRole('button', { name: /Go to step/i }).at(-1);
    fireEvent.click(lastDot);
    expect(screen.getByRole('button', { name: /Start playing/i })).toBeInTheDocument();
  });

  it('calls onFinish when "🌱 Start playing!" is clicked on the last step', () => {
    const onFinish = jest.fn();
    render(<TourOverlay onFinish={onFinish} />);
    const lastDot = screen.getAllByRole('button', { name: /Go to step/i }).at(-1);
    fireEvent.click(lastDot);
    fireEvent.click(screen.getByRole('button', { name: /Start playing/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onFinish when "Skip tour" is clicked', () => {
    const onFinish = jest.fn();
    render(<TourOverlay onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('jumps to the clicked step dot', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    const dots = screen.getAllByRole('button', { name: /Go to step/i });
    // Click the third dot (index 2 → step 3)
    fireEvent.click(dots[2]);
    expect(screen.getByText(TOUR_STEPS[2].title)).toBeInTheDocument();
  });

  it('renders the step counter text "1 / N"', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(`1 / ${TOUR_STEPS.length}`)).toBeInTheDocument();
  });

  it('has a dialog role for accessibility', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ── HelpPanel ─────────────────────────────────────────────────────────────────
describe('HelpPanel', () => {
  it('renders the panel title', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: /Help/i })).toBeInTheDocument();
  });

  it('renders all 5 tab buttons', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Quick Start/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plants/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Structures/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Multiplayer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tips/i })).toBeInTheDocument();
  });

  it('shows Quick Start content by default', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByText(/Your first harvest in 4 steps/i)).toBeInTheDocument();
  });

  it('switches to Plants tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Plants/i }));
    // Use selector:'h4' so we match only the section heading, not ancestor divs
    expect(screen.getByText(/Growth times/i, { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Structures tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Structures/i }));
    expect(screen.getByText(/Water Well/i,   { selector: 'h4' })).toBeInTheDocument();
    expect(screen.getByText(/Compost Heap/i, { selector: 'h4' })).toBeInTheDocument();
    expect(screen.getByText(/Greenhouse/i,   { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Multiplayer tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Multiplayer/i }));
    expect(screen.getByText(/World Map/i,   { selector: 'h4' })).toBeInTheDocument();
    expect(screen.getByText(/Marketplace/i, { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Tips tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tips/i }));
    expect(screen.getByText(/Early game/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<HelpPanel onClose={onClose} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /close help panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onStartTour when "Take the tour again" is clicked', () => {
    const onStartTour = jest.fn();
    render(<HelpPanel onClose={jest.fn()} onStartTour={onStartTour} />);
    fireEvent.click(screen.getByRole('button', { name: /Take the tour again/i }));
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<HelpPanel onClose={onClose} onStartTour={jest.fn()} />);
    // The backdrop is the outermost div — clicking it (but not the panel) triggers close
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders bold text for **bold** markdown in help items', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    // "Your first harvest in 4 steps" section has **Till** etc.
    const strong = screen.getAllByText('Till');
    expect(strong.length).toBeGreaterThan(0);
    expect(strong[0].tagName).toBe('STRONG');
  });
});
