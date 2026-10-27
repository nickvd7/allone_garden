import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n/config';
import UnderConstruction from '../components/UnderConstruction';

describe('UnderConstruction', () => {
  beforeEach(() => {
    localStorage.setItem('garden_lang', 'en');
    i18n.changeLanguage('en');
  });

  it('tells visitors login is paused and uses mail@030.dev', () => {
    render(<UnderConstruction />);
    expect(screen.getByRole('heading', { name: 'Under construction' })).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    const mail = screen.getByRole('link', { name: 'mail@030.dev' });
    expect(mail).toHaveAttribute('href', 'mailto:mail@030.dev');
    expect(screen.getByRole('link', { name: /back to homepage/i })).toHaveAttribute('href', '/home');
  });

  it('uses the Dutch copy when the language is nl', async () => {
    await i18n.changeLanguage('nl');
    render(<UnderConstruction />);
    expect(screen.getByRole('heading', { name: 'In aanbouw' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mail@030.dev' })).toBeInTheDocument();
  });
});
