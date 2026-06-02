import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(userId) {
  const hue = ((Number(userId) || 0) * 73 + 137) % 360;
  return `hsl(${hue},60%,45%)`;
}

function ChatPanel({ socket, username, currentUserId }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('everyone'); // 'everyone' | 'direct'

  // ── Global chat state ─────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState([
    { id: 1, username: 'System', text: 'Welcome to AllOne Garden! 🌱', timestamp: Date.now() },
  ]);
  const [inputText,   setInputText]   = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [chatError,   setChatError]   = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const errorTimerRef  = useRef(null);

  // ── DM state ──────────────────────────────────────────────────────────────
  const [onlinePlayers,   setOnlinePlayers]   = useState([]);
  const [dmHistory,       setDmHistory]       = useState({}); // { userId: [msg, ...] }
  const [selectedUser,    setSelectedUser]    = useState(null);
  const [dmInput,         setDmInput]         = useState('');
  const [dmSearch,        setDmSearch]        = useState('');
  const [unreadDm,        setUnreadDm]        = useState({}); // { userId: count }
  const dmBottomRef = useRef(null);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmHistory, selectedUser]);

  // Clear unread when opening a conversation
  useEffect(() => {
    if (!selectedUser) return;
    const key = String(selectedUser.id);
    setUnreadDm((prev) => prev[key] ? { ...prev, [key]: 0 } : prev);
  }, [selectedUser]);

  // ── Socket: global chat ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg) => setMessages((prev) => [...prev, msg]);

    const onTyping = ({ username: user, isTyping }) =>
      setTypingUsers((prev) =>
        isTyping ? [...prev.filter((u) => u !== user), user] : prev.filter((u) => u !== user)
      );

    const onError = ({ message }) => {
      setChatError(message);
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setChatError(null), 4000);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:typing',  onTyping);
    socket.on('chat:error',   onError);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:typing',  onTyping);
      socket.off('chat:error',   onError);
    };
  }, [socket]);

  // ── Socket: online players ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onList   = (list)     => setOnlinePlayers(list.filter((p) => String(p.id) !== String(currentUserId)));
    const onJoined = (player)   => setOnlinePlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
    const onLeft   = ({ id })   => setOnlinePlayers((prev) => prev.filter((p) => p.id !== id));

    socket.on('players:list',  onList);
    socket.on('player:joined', onJoined);
    socket.on('player:left',   onLeft);

    return () => {
      socket.off('players:list',  onList);
      socket.off('player:joined', onJoined);
      socket.off('player:left',   onLeft);
    };
  }, [socket, currentUserId]);

  // ── Socket: incoming DMs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onDm = (msg) => {
      // Discard messages with no valid sender (e.g. malformed payloads)
      if (!msg.from && msg.from !== 0) return;
      const fromId = String(msg.from);
      if (!fromId || fromId === 'null' || fromId === 'undefined') return;
      setDmHistory((prev) => ({
        ...prev,
        [fromId]: [...(prev[fromId] || []), msg],
      }));
      setUnreadDm((prev) => {
        if (tab === 'direct' && selectedUser && String(selectedUser.id) === fromId) return prev;
        return { ...prev, [fromId]: (prev[fromId] || 0) + 1 };
      });
    };

    socket.on('dm:receive', onDm);
    return () => socket.off('dm:receive', onDm);
  }, [socket, tab, selectedUser]);

  // ── Global chat: send ─────────────────────────────────────────────────────
  const sendMessage = () => {
    const text = inputText.trim();
    if (!text) return;

    if (socket) {
      socket.emit('chat:message', { text });
    } else {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), username: username || 'You', text, timestamp: Date.now() },
      ]);
    }
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { sendMessage(); return; }
    if (socket) {
      socket.emit('chat:typing', { isTyping: true });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => socket.emit('chat:typing', { isTyping: false }), 1500);
    }
  };

  // ── DM: send ──────────────────────────────────────────────────────────────
  const sendDm = useCallback(() => {
    const text = dmInput.trim();
    if (!text || !selectedUser || !socket) return;
    socket.emit('dm:send', { to: selectedUser.id, text });
    const key = String(selectedUser.id);
    setDmHistory((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), {
        from:         currentUserId,
        fromUsername: username || 'You',
        text,
        timestamp:    Date.now(),
      }],
    }));
    setDmInput('');
  }, [dmInput, selectedUser, socket, currentUserId, username]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadDm).reduce((s, n) => s + n, 0);

  // Players who match search, plus any we have DM history with (even if offline)
  const knownDmUserIds = Object.keys(dmHistory);
  const offlineWithHistory = knownDmUserIds
    .filter((id) => !onlinePlayers.some((p) => String(p.id) === id))
    .map((id) => ({ id, username: dmHistory[id]?.[0]?.fromUsername || `User ${id}`, offline: true }));

  const playerPool = [...onlinePlayers, ...offlineWithHistory];
  const filteredPlayers = dmSearch.trim()
    ? playerPool.filter((p) => p.username?.toLowerCase().includes(dmSearch.trim().toLowerCase()))
    : playerPool;

  const selectedKey = selectedUser ? String(selectedUser.id) : null;
  const selectedDmMessages = selectedKey ? (dmHistory[selectedKey] || []) : [];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="card">
      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border, #e0e0e0)', marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setTab('everyone')}
          style={{
            flex: 1, padding: '0.45rem 0.5rem', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === 'everyone' ? 700 : 400,
            borderBottom: tab === 'everyone' ? '2px solid #4caf50' : '2px solid transparent',
            color: tab === 'everyone' ? '#2e7d32' : '#666',
            fontSize: '0.88rem',
          }}
        >
          💬 {t('chat')}
        </button>
        <button
          type="button"
          onClick={() => setTab('direct')}
          style={{
            flex: 1, padding: '0.45rem 0.5rem', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === 'direct' ? 700 : 400,
            borderBottom: tab === 'direct' ? '2px solid #4caf50' : '2px solid transparent',
            color: tab === 'direct' ? '#2e7d32' : '#666',
            fontSize: '0.88rem',
            position: 'relative',
          }}
        >
          ✉️ Direct
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 8,
              background: '#e53935', color: '#fff',
              borderRadius: '9px', fontSize: '0.68rem', fontWeight: 700,
              padding: '0 5px', lineHeight: '16px', minWidth: 16, textAlign: 'center',
            }}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* ── Everyone tab ── */}
      {tab === 'everyone' && (
        <>
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className="chat-message">
                <span className="username">{msg.username}: </span>
                <span className="text">{msg.text}</span>
                <span className="timestamp">{formatTime(msg.timestamp)}</span>
              </div>
            ))}
            {typingUsers.length > 0 && (
              <div className="chat-message" style={{ fontStyle: 'italic', color: '#aaa' }}>
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div style={{ color: '#c62828', fontSize: '13px', padding: '4px 8px', background: '#ffebee', borderRadius: '6px', marginBottom: '6px' }}>
              {chatError}
            </div>
          )}

          <div className="chat-input-row">
            <input
              className="chat-input"
              type="text"
              placeholder="Type a message…"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={200}
            />
            <button className="btn btn-primary" onClick={sendMessage}>
              {t('send')}
            </button>
          </div>
        </>
      )}

      {/* ── Direct tab ── */}
      {tab === 'direct' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedUser ? (
            /* Player list / search */
            <div>
              <input
                className="chat-input"
                type="text"
                placeholder="Zoek op naam…"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                style={{ marginBottom: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {filteredPlayers.length === 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#aaa', textAlign: 'center', padding: '1rem 0' }}>
                    {onlinePlayers.length === 0 ? 'Geen andere spelers online' : 'Geen spelers gevonden'}
                  </div>
                )}
                {filteredPlayers.map((player) => {
                  const key = String(player.id);
                  const unread = unreadDm[key] || 0;
                  const lastMsg = dmHistory[key]?.slice(-1)[0];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedUser(player)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        width: '100%', padding: '0.5rem 0.4rem', border: 'none', background: 'none',
                        cursor: 'pointer', borderRadius: '6px', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(0,0,0,0.05))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: avatarColor(player.id), color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.9rem',
                        opacity: player.offline ? 0.5 : 1,
                      }}>
                        {player.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {player.username}
                          {!player.offline && (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
                          )}
                        </div>
                        {lastMsg && (
                          <div style={{ fontSize: '0.75rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                            {lastMsg.from === currentUserId ? 'Jij: ' : ''}{lastMsg.text}
                          </div>
                        )}
                      </div>
                      {unread > 0 && (
                        <span style={{
                          background: '#e53935', color: '#fff',
                          borderRadius: '9px', fontSize: '0.68rem', fontWeight: 700,
                          padding: '0 5px', lineHeight: '16px', minWidth: 16, textAlign: 'center',
                        }}>
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* DM conversation */
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem', color: '#666' }}
                  title="Terug naar overzicht"
                >
                  ←
                </button>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: avatarColor(selectedUser.id),
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {selectedUser.username?.[0]?.toUpperCase() || '?'}
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{selectedUser.username}</span>
                {!selectedUser.offline && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
                )}
              </div>

              <div className="chat-messages" style={{ flex: 1 }}>
                {selectedDmMessages.length === 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#aaa', textAlign: 'center', padding: '1rem 0' }}>
                    Stuur een bericht aan {selectedUser.username}
                  </div>
                )}
                {selectedDmMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`chat-message${String(msg.from) === String(currentUserId) ? ' chat-message--own' : ''}`}
                    style={{
                      justifyContent: String(msg.from) === String(currentUserId) ? 'flex-end' : 'flex-start',
                      display: 'flex', flexDirection: 'column',
                      alignItems: String(msg.from) === String(currentUserId) ? 'flex-end' : 'flex-start',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <div style={{
                      background: String(msg.from) === String(currentUserId) ? '#4caf50' : 'var(--surface2, #f0f0f0)',
                      color: String(msg.from) === String(currentUserId) ? '#fff' : 'inherit',
                      padding: '0.35rem 0.65rem', borderRadius: '12px',
                      maxWidth: '80%', fontSize: '0.85rem', wordBreak: 'break-word',
                    }}>
                      {msg.text}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '0.15rem' }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                ))}
                <div ref={dmBottomRef} />
              </div>

              <div className="chat-input-row" style={{ marginTop: '0.4rem' }}>
                <input
                  className="chat-input"
                  type="text"
                  placeholder={`Bericht aan ${selectedUser.username}…`}
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendDm()}
                  maxLength={300}
                />
                <button className="btn btn-primary" onClick={sendDm} style={{ padding: '0.4rem 0.8rem' }}>
                  ➤
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
