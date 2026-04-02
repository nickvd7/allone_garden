/**
 * Tests — GardenConflictModal (409 garden sync conflict)
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GardenConflictModal from '../components/GardenConflictModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

describe('GardenConflictModal', () => {
  it('renders dialog with title and body keys', () => {
    render(
      <GardenConflictModal
        onUseServer={() => {}}
        onForceLocal={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('gardenConflict.title')).toBeInTheDocument();
    expect(screen.getByText('gardenConflict.body')).toBeInTheDocument();
  });

  it('calls onUseServer when primary button is clicked', () => {
    const onUseServer = jest.fn();
    render(
      <GardenConflictModal
        onUseServer={onUseServer}
        onForceLocal={() => {}}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByText('gardenConflict.use_server'));
    expect(onUseServer).toHaveBeenCalledTimes(1);
  });

  it('calls onForceLocal when secondary button is clicked', () => {
    const onForceLocal = jest.fn();
    render(
      <GardenConflictModal
        onUseServer={() => {}}
        onForceLocal={onForceLocal}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByText('gardenConflict.force_local'));
    expect(onForceLocal).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when dismiss is clicked', () => {
    const onDismiss = jest.fn();
    render(
      <GardenConflictModal
        onUseServer={() => {}}
        onForceLocal={() => {}}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByText('gardenConflict.dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
