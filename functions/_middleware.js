/**
 * Pages _redirects cannot return 503. This middleware keeps /api and
 * Socket.IO on the static site in the same "under construction" state
 * as the login page, without a game server behind them.
 */
const BODY = {
  error: 'Under construction',
  message: 'Login en registratie zijn tijdelijk niet beschikbaar. De server staat even uit.',
  contact: 'mail@030.dev',
};

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  const paused =
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/socket.io' ||
    pathname.startsWith('/socket.io/');
  if (!paused) return context.next();
  return new Response(JSON.stringify(BODY), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '86400',
    },
  });
}
