/**
 * Tests — HelpPanel
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPanel from '../components/HelpPanel';
import i18n from '../i18n/config';

const t = (...args) => i18n.t(...args);

describe('HelpPanel — tabs', () => {
  it('renders all five tab buttons', () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByText(t('helpPanel.tabs.start'))).toBeInTheDocument();
    expect(screen.getByText(t('helpPanel.tabs.plants'))).toBeInTheDocument();
    expect(screen.getByText(t('helpPanel.tabs.garden'))).toBeInTheDocument();
    expect(screen.getByText(t('helpPanel.tabs.village'))).toBeInTheDocument();
    expect(screen.getByText(t('helpPanel.tabs.tips'))).toBeInTheDocument();
  });

  it('shows Quick Start content by default', () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByText(/Your first harvest/i)).toBeInTheDocument();
  });

  it('switches to Plants tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(t('helpPanel.tabs.plants')));
    expect(screen.getByText(/How long does it take/i)).toBeInTheDocument();
  });

  it('switches to Garden tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(t('helpPanel.tabs.garden')));
    expect(screen.getByText(/Only in YOUR garden/i)).toBeInTheDocument();
  });

  it('switches to Village tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(t('helpPanel.tabs.village')));
    expect(screen.getByText(/Explore the village/i)).toBeInTheDocument();
  });

  it('switches to Tips tab', () => {
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText(t('helpPanel.tabs.tips')));
    expect(screen.getByText(/Helpful tips/i)).toBeInTheDocument();
  });
});

describe('HelpPanel — close', () => {
  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<HelpPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: t('helpPanel.closeAria') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = jest.fn();
    render(<HelpPanel onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
