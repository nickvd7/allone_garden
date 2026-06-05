import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../components/Header';

describe('Header', () => {
  const noop = jest.fn();

  const defaultProps = {
    username: 'Alice',
    darkMode: false,
    onToggleDark: noop,
    onLogout: noop,
    onOpenProfile: noop,
    onOpenWorldMap: noop,
    onOpenSocialMenu: noop,
    onOpenGradendex: noop,
    worldSummary: { currentDay: 3, season: 'spring', weather: 'sunny', xp: 50, coords: '11,7', onlineCount: 2, isGuest: false },
  };

  it('renders day chip with current day', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText(/📅 Day 3/)).toBeInTheDocument();
  });

  it('opens world map when world button clicked', () => {
    const onOpenWorldMap = jest.fn();
    render(<Header {...defaultProps} onOpenWorldMap={onOpenWorldMap} />);
    fireEvent.click(screen.getByTitle(/World Map/i));
    expect(onOpenWorldMap).toHaveBeenCalledTimes(1);
  });

  it('opens social menu when chat button clicked', () => {
    const onOpenSocialMenu = jest.fn();
    render(<Header {...defaultProps} onOpenSocialMenu={onOpenSocialMenu} />);
    fireEvent.click(screen.getByLabelText(/^Chat$/i));
    expect(onOpenSocialMenu).toHaveBeenCalledTimes(1);
  });

  it('shows profile menu with logout', () => {
    const onLogout = jest.fn();
    render(<Header {...defaultProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByTitle(/Profile — Alice/i));
    fireEvent.click(screen.getByRole('menuitem', { name: /Logout/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('toggles dark mode from profile menu', () => {
    const onToggleDark = jest.fn();
    render(<Header {...defaultProps} onToggleDark={onToggleDark} />);
    fireEvent.click(screen.getByTitle(/Profile — Alice/i));
    fireEvent.click(screen.getByRole('menuitem', { name: /Dark mode/i }));
    expect(onToggleDark).toHaveBeenCalledTimes(1);
  });

  it('shows status popover when day chip clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByText(/📅 Day 3/));
    expect(screen.getByText(/spring/i)).toBeInTheDocument();
    expect(screen.getByText(/2 online/i)).toBeInTheDocument();
  });

  it('shows admin menu item when isAdmin', () => {
    const onOpenAdmin = jest.fn();
    render(
      <Header
        {...defaultProps}
        isAdmin
        onOpenAdmin={onOpenAdmin}
      />,
    );
    fireEvent.click(screen.getByTitle(/Profile — Alice/i));
    fireEvent.click(screen.getByRole('menuitem', { name: /Admin/i }));
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it('shows notifications badge on bell, not profile', () => {
    render(
      <Header
        {...defaultProps}
        onOpenNotifications={noop}
        notificationsBadge={3}
      />,
    );
    const bell = screen.getByTitle(/Notifications/i);
    const profile = screen.getByTitle(/Profile — Alice/i);
    expect(bell.querySelector('.header-action-btn__badge')).toHaveTextContent('3');
    expect(profile.querySelector('.header-action-btn__badge')).toBeNull();
  });
});
