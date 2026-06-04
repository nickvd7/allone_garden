import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import api from '../hooks/useApi';
import NotificationsPanel from '../components/NotificationsPanel';
import '../i18n/config';

jest.mock('../hooks/useApi');

describe('NotificationsPanel', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/api/player-proposals') {
        return Promise.resolve({
          proposals: [{
            id: 1,
            fromUserId: '2',
            fromUsername: 'Mila',
            toUserId: '1',
            kind: 'trade',
            status: 'pending',
            message: 'Ruil?',
            payload: { offer: { tomato: 1 }, request: { carrot: 1 } },
          }],
        });
      }
      if (url === '/api/content/proposals/mine') {
        return Promise.resolve({ proposals: [] });
      }
      return Promise.resolve({ proposals: [] });
    });
  });

  it('toont inkomend voorstel met actieknoppen', async () => {
    render(
      <NotificationsPanel
        currentUserId={1}
        hasServerAuth
        onCountChange={() => {}}
      />,
    );

    expect(await screen.findByText('Mila')).toBeInTheDocument();
    expect(screen.getByText('Ruil?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept|Accepteer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline|Weiger/i })).toBeInTheDocument();
  });
});
