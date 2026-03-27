/**
 * P2P Federation module — Hyperswarm-based server discovery and cross-server messaging.
 *
 * When P2P_ENABLED=true this module:
 *   1. Joins the AllOne Garden DHT swarm using a well-known topic key.
 *   2. Maintains a list of peer servers (known_peers table).
 *   3. Allows cross-server garden visits and chat federation.
 *   4. Broadcasts server stats (player count, name) to the swarm.
 *
 * Each server is identified by its Hyperswarm public key (32-byte hex string).
 * Communication uses line-delimited JSON over the raw P2P stream.
 *
 * Architecture:
 *   Pi Node A  ←──── Hyperswarm DHT ────→  Pi Node B
 *       ↓  JSON messages over TCP stream  ↑
 *   { type, payload }   ←───────────────→   { type, payload }
 */

const Hyperswarm = require('hyperswarm');
const crypto     = require('crypto');
const db         = require('../db');

// The shared topic all AllOne Garden servers join.
// Changing this string creates a separate isolated network.
const GARDEN_TOPIC = crypto
  .createHash('sha256')
  .update('allone-garden-federation-v1')
  .digest();

/** Message types the federation protocol understands */
const MSG = {
  HELLO:         'hello',          // initial handshake: { serverName, playerCount, version }
  PING:          'ping',           // keepalive
  PONG:          'pong',
  PLAYER_VISIT:  'player:visit',   // a player wants to visit a garden on another server
  GARDEN_DATA:   'garden:data',    // response: serialised garden state
  CHAT_FORWARD:  'chat:forward',   // federated chat message
  PEER_LIST:     'peer:list',      // share known peers
};

class FederationServer {
  constructor({ io, eventBus }) {
    this.io       = io;
    this.eventBus = eventBus;
    this.swarm    = null;
    this.peers    = new Map();   // peerId → { stream, info }
    this.serverId = null;
  }

  async start() {
    this.swarm = new Hyperswarm();
    this.serverId = this.swarm.keyPair.publicKey.toString('hex');

    console.log(`[p2p] Server ID: ${this.serverId.slice(0, 16)}...`);
    console.log(`[p2p] Joining AllOne Garden swarm…`);

    // Discover and connect to peers
    this.swarm.on('connection', (stream, info) => {
      this._onPeerConnected(stream, info);
    });

    await this.swarm.join(GARDEN_TOPIC, { server: true, client: true });
    await this.swarm.flush();

    console.log('[p2p] ✅ Joined federation swarm');

    // Broadcast our presence every 60 s
    this._heartbeatTimer = setInterval(() => this._broadcastHello(), 60_000);

    // Forward federated chat to local clients
    this.eventBus.on('onChat', (msg) => {
      if (!msg.federated) {
        this._broadcast({ type: MSG.CHAT_FORWARD, payload: msg });
      }
    });

    // Persist our own ID
    await this._savePeer(this.serverId, 'This Server', 0);
  }

  async stop() {
    clearInterval(this._heartbeatTimer);
    await this.swarm?.destroy();
    console.log('[p2p] Federation stopped');
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _onPeerConnected(stream, info) {
    const peerId = info.publicKey.toString('hex');
    console.log(`[p2p] Peer connected: ${peerId.slice(0, 16)}…`);

    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();           // last incomplete line stays in buffer
      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line);
          this._handleMessage(peerId, stream, msg);
        } catch {
          // ignore malformed messages
        }
      });
    });

    stream.on('error', () => this.peers.delete(peerId));
    stream.on('close', () => {
      console.log(`[p2p] Peer disconnected: ${peerId.slice(0, 16)}…`);
      this.peers.delete(peerId);
    });

    this.peers.set(peerId, { stream, info: {} });

    // Introduce ourselves
    this._send(stream, { type: MSG.HELLO, payload: {
      serverName: process.env.SERVER_NAME || 'AllOne Node',
      playerCount: this.io.engine.clientsCount,
      version: '1.0.0',
    }});
  }

  _handleMessage(peerId, stream, msg) {
    const { type, payload } = msg;

    switch (type) {
      case MSG.HELLO: {
        const peer = this.peers.get(peerId);
        if (peer) peer.info = payload;
        console.log(`[p2p] Hello from "${payload.serverName}" (${payload.playerCount} players)`);
        this._savePeer(peerId, payload.serverName, payload.playerCount);
        // Respond with a PONG
        this._send(stream, { type: MSG.PONG });
        break;
      }

      case MSG.PING:
        this._send(stream, { type: MSG.PONG });
        break;

      case MSG.CHAT_FORWARD: {
        // Deliver to local players, tagged as federated
        const chatMsg = { ...payload, federated: true, serverName: this.peers.get(peerId)?.info?.serverName };
        this.io.emit('chat:message', chatMsg);
        break;
      }

      case MSG.PLAYER_VISIT: {
        // Another server's player wants to visit a local garden
        const { targetUserId, visitorName, visitorServerId } = payload;
        this.io.to(targetUserId).emit('garden:visitor', {
          username: `${visitorName} (from ${visitorServerId?.slice(0, 8)}…)`,
          remote: true,
        });
        break;
      }

      case MSG.PEER_LIST: {
        // Store additional peers we learned about
        (payload.peers || []).forEach((p) => {
          if (!this.peers.has(p.peerId)) {
            this._savePeer(p.peerId, p.serverName, p.playerCount);
          }
        });
        break;
      }

      default:
        break;
    }
  }

  _send(stream, msg) {
    try {
      stream.write(JSON.stringify(msg) + '\n');
    } catch {
      // stream may be closed
    }
  }

  _broadcast(msg) {
    for (const { stream } of this.peers.values()) {
      this._send(stream, msg);
    }
  }

  _broadcastHello() {
    this._broadcast({
      type: MSG.HELLO,
      payload: {
        serverName: process.env.SERVER_NAME || 'AllOne Node',
        playerCount: this.io.engine.clientsCount,
        version: '1.0.0',
      },
    });
  }

  async _savePeer(peerId, serverName, playerCount) {
    if (!db.isConnected()) return;
    await db.query(
      `INSERT INTO known_peers (peer_id, server_name, player_count, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (peer_id) DO UPDATE
         SET server_name = EXCLUDED.server_name,
             player_count = EXCLUDED.player_count,
             last_seen = NOW()`,
      [peerId, serverName, playerCount]
    );
  }
}

// Singleton
let instance = null;

async function start(deps) {
  if (instance) return instance;
  instance = new FederationServer(deps);
  await instance.start();
  return instance;
}

async function stop() {
  if (instance) await instance.stop();
  instance = null;
}

module.exports = { start, stop };
