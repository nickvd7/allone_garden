import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../hooks/useApi';

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(userId) {
  const hue = ((Number(userId) || 0) * 73 + 137) % 360;
  return `hsl(${hue},60%,45%)`;
}

function ChatPanel({ socket, username, currentUserId, dmTarget, onDmTargetClear, onStartCall, dmOnly = false, isOpen = false, onUnreadChange }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(dmOnly ? 'direct' : 'everyone'); // 'everyone' | 'direct'

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
  const [dmTypingUser,       setDmTypingUser]       = useState(null);
  const dmTypingTimerRef = useRef(null);
  const [onlinePlayers,      setOnlinePlayers]      = useState([]);
  const [dmHistory,          setDmHistory]          = useState({}); // { userId: [msg, ...] }
  const [loadedHistories,    setLoadedHistories]    = useState(new Set()); // userId strings
  const [conversations,      setConversations]      = useState([]); // from API
  const [selectedUser,       setSelectedUser]       = useState(null);
  const [dmInput,            setDmInput]            = useState('');
  const [dmSearch,           setDmSearch]           = useState('');
  const [unreadDm,           setUnreadDm]           = useState({}); // { userId: count }
  const [unreadGlobal,       setUnreadGlobal]       = useState(0);
  const [historyLoading,     setHistoryLoading]     = useState(false);
  const [convsLoading,       setConvsLoading]       = useState(false);
  const dmBottomRef = useRef(null);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── dmTarget prop: switch to DM tab and pre-select user ───────────────────
  useEffect(() => {
    if (!dmTarget) return;
    setTab('direct');
    setSelectedUser(dmTarget);
    setUnreadDm((prev) => {
      const key = String(dmTarget.id);
      return prev[key] ? { ...prev, [key]: 0 } : prev;
    });
    onDmTargetClear?.();
  }, [dmTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear unread when opening a conversation ──────────────────────────────
  useEffect(() => {
    if (!selectedUser) return;
    const key = String(selectedUser.id);
    setUnreadDm((prev) => prev[key] ? { ...prev, [key]: 0 } : prev);
  }, [selectedUser]);

  // ── Fetch conversation list when DM tab opens ─────────────────────────────
  useEffect(() => {
    if ((!dmOnly && tab !== 'direct') || !currentUserId || convsLoading) return;
    setConvsLoading(true);
    api.get('/api/dm/conversations')
      .then((data) => {
        setConversations(data.conversations || []);
      })
      .catch(() => {})
      .finally(() => setConvsLoading(false));
  }, [tab, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch message history when selecting a user (once per session) ────────
  useEffect(() => {
    if (!selectedUser || !currentUserId) return;
    const key = String(selectedUser.id);
    if (loadedHistories.has(key)) return;
    setHistoryLoading(true);
    api.get(`/api/dm/history/${selectedUser.id}`)
      .then((data) => {
        const msgs = data.messages || [];
        if (msgs.length) {
          setDmHistory((prev) => ({
            ...prev,
            [key]: msgs,
          }));
        }
        setLoadedHistories((prev) => new Set([...prev, key]));
      })
      .catch(() => {
        setLoadedHistories((prev) => new Set([...prev, key]));
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedUser, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: global chat ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen && msg?.username && msg.username !== username) {
        setUnreadGlobal((n) => n + 1);
      }
    };

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
  }, [socket, isOpen, username]);

  // ── Socket: online players ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onList   = (list)   => setOnlinePlayers(list.filter((p) => String(p.id) !== String(currentUserId)));
    const onJoined = (player) => setOnlinePlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
    const onLeft   = ({ id }) => setOnlinePlayers((prev) => prev.filter((p) => p.id !== id));

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
      // Discard messages with no valid sender
      if (!msg.from && msg.from !== 0) return;
      const fromId = String(msg.from);
      if (!fromId || fromId === 'null' || fromId === 'undefined') return;

      setDmHistory((prev) => ({
        ...prev,
        [fromId]: [...(prev[fromId] || []), msg],
      }));
      setUnreadDm((prev) => {
        if (isOpen && tab === 'direct' && selectedUser && String(selectedUser.id) === fromId) return prev;
        return { ...prev, [fromId]: (prev[fromId] || 0) + 1 };
      });
    };

    const onDmTyping = ({ from, isTyping }) => {
      const fromId = String(from);
      if (!selectedUser || String(selectedUser.id) !== fromId) return;
      setDmTypingUser(isTyping ? fromId : null);
      if (isTyping) {
        clearTimeout(dmTypingTimerRef.current);
        dmTypingTimerRef.current = setTimeout(() => setDmTypingUser(null), 3000);
      }
    };
    socket.on('dm:typing', onDmTyping);

    socket.on('dm:receive', onDm);
    return () => {
      socket.off('dm:receive', onDm);
      socket.off('dm:typing', onDmTyping);
    };
  }, [socket, tab, selectedUser, isOpen]);

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
    const myMsg = { from: currentUserId, fromUsername: username || 'You', text, timestamp: Date.now() };
    setDmHistory((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), myMsg],
    }));
    setDmInput('');
    if (selectedUser.offline) {
      // Bericht is opgeslagen in DB; ontvanger leest het bij volgende login.
    }
  }, [dmInput, selectedUser, socket, currentUserId, username]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadDm).reduce((s, n) => s + n, 0);
  const badgeCount = isOpen ? 0 : totalUnread + unreadGlobal;

  useEffect(() => {
    if (!isOpen) return;
    setUnreadGlobal(0);
  }, [isOpen]);

  useEffect(() => {
    onUnreadChange?.(badgeCount);
  }, [badgeCount, onUnreadChange]);

  // Merge: online players + contacts from conversation history (even if offline)
  const historyContacts = conversations
    .filter((c) => !onlinePlayers.some((p) => String(p.id) === String(c.contact_id)))
    .map((c) => ({ id: c.contact_id, username: c.contact_username, offline: true }));

  const playerPool = [
    ...onlinePlayers,
    ...historyContacts,
  ];

  const filteredPlayers = dmSearch.trim()
    ? playerPool.filter((p) => p.username?.toLowerCase().includes(dmSearch.trim().toLowerCase()))
    : playerPool;

  const selectedKey       = selectedUser ? String(selectedUser.id) : null;
  const selectedDmMessages = selectedKey ? (dmHistory[selectedKey] || []) : [];

  useEffect(() => {
    if (!selectedKey) return;
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedKey, selectedDmMessages.length]);

  // Last-message snippet per user (from live history or conversations API)
  function lastMsgFor(userId) {
    const key = String(userId);
    const live = dmHistory[key];
    if (live?.length) return live[live.length - 1];
    const conv = conversations.find((c) => String(c.contact_id) === key);
    if (conv) return { text: conv.last_message, from: conv.from_user_id, timestamp: conv.created_at };
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="card chat-panel">
      {!dmOnly && (
        <div className="chat-panel__tabs">
          <button
            type="button"
            className={`chat-panel__tab${tab === 'everyone' ? ' chat-panel__tab--active' : ''}`}
            onClick={() => setTab('everyone')}
          >
            💬 {t('chat')}
          </button>
          <button
            type="button"
            className={`chat-panel__tab${tab === 'direct' ? ' chat-panel__tab--active' : ''}`}
            onClick={() => setTab('direct')}
          >
            ✉️ {t('chat_direct', { defaultValue: 'Direct' })}
            {totalUnread > 0 && (
              <span className="chat-panel__tab-badge">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      )}

      {dmOnly && (
        <div className="chat-panel__dm-heading">
          <strong>✉️ {t('chat_direct_messages', { defaultValue: 'Direct messages' })}</strong>
          {totalUnread > 0 && (
            <span className="chat-panel__tab-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
          )}
        </div>
      )}

      {/* ── Everyone tab ── */}
      {!dmOnly && tab === 'everyone' && (
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
              placeholder={t('chat_placeholder', { defaultValue: 'Type a message…' })}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={200}
            />
            <button className="btn btn-primary" onClick={sendMessage}>
              {t('send')}
            </button>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#aaa', textAlign: 'center', padding: '0.25rem 0', borderTop: '1px solid var(--border-subtle, #e8f5e9)' }}>
            {t('chat_kindness_note', { defaultValue: '🌱 Be kind to each other' })}
          </div>
        </>
      )}

      {/* ── Direct tab ── */}
      {(dmOnly || tab === 'direct') && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedUser ? (
            /* Player list / search */
            <div>
              <input
                className="chat-input"
                type="text"
                placeholder={t('chat_search_players', { defaultValue: 'Search by name…' })}
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                style={{ marginBottom: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
              {!selectedUser && filteredPlayers.length > 0 && !dmOnly && tab !== 'direct' && (
                <div style={{ fontSize: '0.75rem', color: '#888', padding: '0.2rem 0.4rem', borderBottom: '1px solid var(--border, #e0e0e0)', marginBottom: '0.25rem' }}>
                  {onlinePlayers.length} online · {filteredPlayers.length} zichtbaar
                </div>
              )}
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {convsLoading && (
                  <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center', padding: '0.5rem' }}>
                    Laden…
                  </div>
                )}
                {!convsLoading && filteredPlayers.length === 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#aaa', textAlign: 'center', padding: '1rem 0' }}>
                    {onlinePlayers.length === 0 ? 'Geen andere spelers online' : 'Geen spelers gevonden'}
                  </div>
                )}
                {filteredPlayers.map((player) => {
                  const key    = String(player.id);
                  const unread = unreadDm[key] || 0;
                  const last   = lastMsgFor(player.id);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedUser(player)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        width: '100%', padding: '0.5rem 0.4rem', border: 'none',
                        background: 'var(--hover, rgba(76,175,80,0.04))',
                        cursor: 'pointer', borderRadius: '6px', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(0,0,0,0.08))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(76,175,80,0.04))'; }}
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
                        {last ? (
                          <div style={{ fontSize: '0.75rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                            {String(last.from) === String(currentUserId) ? 'Jij: ' : ''}{last.text}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: '#bbb', fontStyle: 'italic' }}>Stuur bericht</div>
                        )}
                      </div>
                      <span style={{ color: '#aaa', fontSize: '0.8rem', flexShrink: 0 }}>→</span>
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
                {selectedUser.offline && (
                  <span style={{ fontSize: '0.72rem', color: '#888' }}>
                    {t('chat_offline_stored', { defaultValue: 'Offline — bericht blijft bewaard' })}
                  </span>
                )}
                {!selectedUser.offline && onStartCall && (
                  <>
                    <button type="button" onClick={() => onStartCall({ mode: 'outgoing', peerId: selectedUser.id, peerUsername: selectedUser.username, audioOnly: false })} title="Videogesprek" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0.15rem 0.3rem' }}>📹</button>
                    <button type="button" onClick={() => onStartCall({ mode: 'outgoing', peerId: selectedUser.id, peerUsername: selectedUser.username, audioOnly: true })} title="Audiogesprek" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0.15rem 0.3rem' }}>📞</button>
                  </>
                )}
              </div>

              <div className="chat-messages" style={{ flex: 1 }}>
                {historyLoading && (
                  <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center', padding: '0.75rem' }}>
                    Geschiedenis laden…
                  </div>
                )}
                {!historyLoading && selectedDmMessages.length === 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#aaa', textAlign: 'center', padding: '1rem 0' }}>
                    Stuur een bericht aan {selectedUser.username}
                  </div>
                )}
                {selectedDmMessages.map((msg, i) => {
                  const isOwn = String(msg.from) === String(currentUserId);
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: isOwn ? 'flex-end' : 'flex-start',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <div style={{
                        background: isOwn ? '#4caf50' : 'var(--surface2, #f0f0f0)',
                        color: isOwn ? '#fff' : 'inherit',
                        padding: '0.35rem 0.65rem', borderRadius: '12px',
                        maxWidth: '80%', fontSize: '0.85rem', wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '0.15rem' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  );
                })}
                {dmTypingUser && (
                  <div style={{ fontSize: '0.78rem', color: '#aaa', fontStyle: 'italic', padding: '0.2rem 0' }}>
                    {selectedUser?.username} typt…
                  </div>
                )}
                <div ref={dmBottomRef} />
              </div>

              <div className="chat-input-row" style={{ marginTop: '0.4rem' }}>
                <input
                  className="chat-input"
                  type="text"
                  placeholder={`Bericht aan ${selectedUser.username}…`}
                  value={dmInput}
                  onChange={(e) => {
                    setDmInput(e.target.value);
                    if (socket && selectedUser) {
                      socket.emit('dm:typing', { to: selectedUser.id, isTyping: true });
                      clearTimeout(dmTypingTimerRef.current);
                      dmTypingTimerRef.current = setTimeout(() => {
                        socket.emit('dm:typing', { to: selectedUser.id, isTyping: false });
                      }, 1500);
                    }
                  }}
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
