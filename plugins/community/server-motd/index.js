/**
 * Community plugin: server-motd
 *
 * Message of the Day — server admins can set a message that is shown
 * to all players when they connect.
 *
 * Default message: the server name from the SERVER_NAME env var.
 *
 * Admin commands (sent via socket event):
 *   plugin:server-motd:set   { message: string }  — set a new MOTD (admin only)
 *   plugin:server-motd:clear {}                    — revert to default (admin only)
 *
 * Client events:
 *   plugin:server-motd:request {}                  — fetch current MOTD
 *
 * Server emits:
 *   plugin:server-motd:data { message, setBy, setAt }  — current MOTD
 *   plugin:server-motd:broadcast { message, setBy }    — pushed to all when changed
 *
 * License: MIT
 * Author: AllOne Garden Community
 */

const MAX_MOTD_LENGTH = 280;

module.exports = {
  name:    'server-motd',
  version: '1.0.0',

  async init(api) {
    api.log('Server-MOTD plugin initialised');

    // Persist the MOTD in a single-row plugin table
    await api.dbCreateTable('motd',
      `id       INTEGER PRIMARY KEY DEFAULT 1,
       message  TEXT    NOT NULL DEFAULT '',
       set_by   VARCHAR(50),
       set_at   TIMESTAMP DEFAULT NOW(),
       CHECK (id = 1)`    // enforce single row
    );

    // Ensure the row exists
    await api.dbQuery('motd',
      `INSERT INTO {{table}} (id, message) VALUES (1, $1) ON CONFLICT DO NOTHING`,
      ['Welcome to the garden! 🌱']
    );

    // ── Helper: fetch current MOTD ────────────────────────────────────────────
    async function getCurrent() {
      const result = await api.dbQuery('motd',
        `SELECT message, set_by, set_at FROM {{table}} WHERE id = 1`,
        []
      );
      return result?.rows[0] || { message: 'Welcome! 🌱', set_by: null, set_at: null };
    }

    // ── On connect: send MOTD to the joining player ───────────────────────────
    api.on('onPlayerJoin', async ({ socket }) => {
      if (!socket) return;
      const motd = await getCurrent();
      api.sendTo(socket.id, 'server-motd:data', motd);
    });

    // ── Client requests current MOTD ─────────────────────────────────────────
    api.on('plugin:server-motd:request', async ({ socket }) => {
      const motd = await getCurrent();
      api.sendTo(socket.id, 'server-motd:data', motd);
    });

    // ── Admin sets a new MOTD ─────────────────────────────────────────────────
    api.on('plugin:server-motd:set', async ({ socket, userId, username, isAdmin, message }) => {
      if (!isAdmin) {
        api.sendTo(socket.id, 'server-motd:error', { error: 'Admin access required' });
        return;
      }
      if (!message || typeof message !== 'string') {
        api.sendTo(socket.id, 'server-motd:error', { error: 'Message is required' });
        return;
      }
      const trimmed = message.trim().slice(0, MAX_MOTD_LENGTH);
      await api.dbQuery('motd',
        `UPDATE {{table}} SET message = $1, set_by = $2, set_at = NOW() WHERE id = 1`,
        [trimmed, username || String(userId)]
      );

      // Confirm to the admin
      api.sendTo(socket.id, 'server-motd:data', { message: trimmed, set_by: username, set_at: new Date() });

      // Broadcast to everyone else
      api.broadcast('server-motd:broadcast', {
        message: trimmed,
        setBy:   username || 'admin',
      });

      api.log(`MOTD updated by ${username}: "${trimmed}"`);
    });

    // ── Admin clears MOTD (revert to default) ─────────────────────────────────
    api.on('plugin:server-motd:clear', async ({ socket, isAdmin, username }) => {
      if (!isAdmin) {
        api.sendTo(socket.id, 'server-motd:error', { error: 'Admin access required' });
        return;
      }
      const defaultMsg = 'Welcome to the garden! 🌱';
      await api.dbQuery('motd',
        `UPDATE {{table}} SET message = $1, set_by = $2, set_at = NOW() WHERE id = 1`,
        [defaultMsg, username || 'admin']
      );
      api.broadcast('server-motd:broadcast', { message: defaultMsg, setBy: username || 'admin' });
      api.log(`MOTD cleared by ${username}`);
    });

    const motd = await getCurrent();
    api.log(`Current MOTD: "${motd.message}"`);
  },
};
