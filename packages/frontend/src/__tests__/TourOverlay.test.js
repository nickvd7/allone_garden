import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TourOverlay, { getTourSteps } from '../components/TourOverlay';
import HelpPanel from '../components/HelpPanel';
import i18n from '../i18n/config';

const t = (...args) => i18n.t(...args);
const TOUR_STEPS = getTourSteps(t);

describe('TourOverlay', () => {
  it('renders the first step title on mount', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('renders the step body text', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(/We'll show you how it works/i)).toBeInTheDocument();
  });

  it('renders progress dots equal to the number of steps', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    const dots = screen.getAllByRole('button', { name: /Go to step/i });
    expect(dots).toHaveLength(TOUR_STEPS.length);
  });

  it('shows Next button on the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByRole('button', { name: t('tour.next') })).toBeInTheDocument();
  });

  it('does NOT show Back button on the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.queryByRole('button', { name: t('tour.back') })).not.toBeInTheDocument();
  });

  it('shows Back button after advancing past the first step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('tour.next') }));
    expect(screen.getByRole('button', { name: t('tour.back') })).toBeInTheDocument();
  });

  it('advances to step 2 when Next is clicked', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('tour.next') }));
    expect(screen.getByText(TOUR_STEPS[1].title)).toBeInTheDocument();
  });

  it('goes back to step 1 when Back is clicked from step 2', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('tour.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('tour.back') }));
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('shows finish button on the last step', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    const lastDot = screen.getAllByRole('button', { name: /Go to step/i }).at(-1);
    fireEvent.click(lastDot);
    expect(screen.getByRole('button', { name: t('tour.finish') })).toBeInTheDocument();
  });

  it('calls onFinish when finish is clicked on the last step', () => {
    const onFinish = jest.fn();
    render(<TourOverlay onFinish={onFinish} />);
    const lastDot = screen.getAllByRole('button', { name: /Go to step/i }).at(-1);
    fireEvent.click(lastDot);
    fireEvent.click(screen.getByRole('button', { name: t('tour.finish') }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onFinish when Skip tour is clicked', () => {
    const onFinish = jest.fn();
    render(<TourOverlay onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: t('tour.skip') }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('jumps to the clicked step dot', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    const dots = screen.getAllByRole('button', { name: /Go to step/i });
    fireEvent.click(dots[2]);
    expect(screen.getByText(TOUR_STEPS[2].title)).toBeInTheDocument();
  });

  it('renders the step counter', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByText(t('tour.stepCounter', { current: 1, total: TOUR_STEPS.length }))).toBeInTheDocument();
  });

  it('has a dialog role for accessibility', () => {
    render(<TourOverlay onFinish={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('HelpPanel', () => {
  it('renders the panel title', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: t('helpPanel.title') })).toBeInTheDocument();
  });

  it('renders all 5 tab buttons', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByRole('button', { name: t('helpPanel.tabs.start') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('helpPanel.tabs.plants') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('helpPanel.tabs.garden') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('helpPanel.tabs.village') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('helpPanel.tabs.tips') })).toBeInTheDocument();
  });

  it('shows Start content by default', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    expect(screen.getByText(/Your first harvest/i)).toBeInTheDocument();
  });

  it('switches to Plants tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.tabs.plants') }));
    expect(screen.getByText(/How long does it take/i, { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Garden tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.tabs.garden') }));
    expect(screen.getByText(/Only in YOUR garden/i, { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Village tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.tabs.village') }));
    expect(screen.getByText(/Explore the village/i, { selector: 'h4' })).toBeInTheDocument();
  });

  it('switches to Tips tab when clicked', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.tabs.tips') }));
    expect(screen.getByText(/Helpful tips/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<HelpPanel onClose={onClose} onStartTour={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.closeAria') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onStartTour when tour again is clicked', () => {
    const onStartTour = jest.fn();
    render(<HelpPanel onClose={jest.fn()} onStartTour={onStartTour} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.tourAgain') }));
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<HelpPanel onClose={onClose} onStartTour={jest.fn()} />);
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders bold text for **bold** markdown in help items', () => {
    render(<HelpPanel onClose={jest.fn()} onStartTour={jest.fn()} />);
    const strong = screen.getAllByText('Till');
    expect(strong.length).toBeGreaterThan(0);
    expect(strong[0].tagName).toBe('STRONG');
  });
});
