import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../hooks/useApi';

const GROUPS_STORAGE_PREFIX = 'garden_group_chats_';

function groupsStorageKey(userId) {
  return `${GROUPS_STORAGE_PREFIX}${userId || 'guest'}`;
}

function loadStoredGroups(userId) {
  try {
    const raw = localStorage.getItem(groupsStorageKey(userId));
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredGroups(userId, groups) {
  if (!userId) return;
  localStorage.setItem(groupsStorageKey(userId), JSON.stringify(groups));
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(userId) {
  const hue = ((Number(userId) || 0) * 73 + 137) % 360;
  return `hsl(${hue},60%,45%)`;
}

function ChatPanel({ socket, username, currentUserId, dmTarget, onDmTargetClear, onStartCall, onStartGroupCall, dmOnly = false, isOpen = false, onUnreadChange }) {
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
  const [searchOpen,         setSearchOpen]         = useState(false);
  const [searchResults,      setSearchResults]      = useState([]);
  const [searchLoading,      setSearchLoading]      = useState(false);
  const [unreadDm,           setUnreadDm]           = useState({}); // { userId: count }
  const [unreadGlobal,       setUnreadGlobal]       = useState(0);
  const [historyLoading,     setHistoryLoading]     = useState(false);
  const [convsLoading,       setConvsLoading]       = useState(false);
  const [groups,             setGroups]             = useState([]);
  const [groupsLoading,      setGroupsLoading]      = useState(false);
  const [selectedGroup,      setSelectedGroup]      = useState(null);
  const [groupHistory,       setGroupHistory]       = useState({});
  const [groupInput,         setGroupInput]         = useState('');
  const [creatingGroup,      setCreatingGroup]      = useState(false);
  const [groupName,          setGroupName]          = useState('');
  const [groupPick,          setGroupPick]          = useState([]);
  const [unreadGroup,        setUnreadGroup]        = useState({});
  const groupBottomRef = useRef(null);
  const dmBottomRef = useRef(null);
  const loadedGroupHistoriesRef = useRef(new Set());

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── dmTarget prop: switch to DM tab and pre-select user ───────────────────
  useEffect(() => {
    if (!dmTarget) return;
    setTab('direct');
    setSelectedUser(dmTarget);
    setSelectedGroup(null);
    setCreatingGroup(false);
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

  useEffect(() => {
    if (!currentUserId) {
      setGroups([]);
      return;
    }
    loadedGroupHistoriesRef.current.clear();
    setGroupsLoading(true);
    api.get('/api/group-chats')
      .then((data) => {
        const serverGroups = (data?.groups || []).map((g) => ({
          id: g.id,
          name: g.name,
          memberIds: g.memberIds || [],
          lastMessage: g.lastMessage || '',
          lastAt: g.lastAt || Date.now(),
        }));
        const cached = loadStoredGroups(currentUserId);
        const merged = new Map();
        [...cached, ...serverGroups].forEach((g) => {
          if (!g?.id) return;
          const prev = merged.get(g.id);
          merged.set(g.id, prev && (prev.lastAt || 0) > (g.lastAt || 0) ? prev : g);
        });
        const next = Array.from(merged.values()).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
        setGroups(next);
        saveStoredGroups(currentUserId, next);
      })
      .catch(() => {
        setGroups(loadStoredGroups(currentUserId));
      })
      .finally(() => setGroupsLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    if (!socket || !currentUserId || !groups.length) return;
    groups.forEach((g) => {
      if (!g?.id || !Array.isArray(g.memberIds) || g.memberIds.length < 2) return;
      socket.emit('group-chat:register', {
        groupId: g.id,
        name: g.name || 'Groep',
        memberIds: g.memberIds,
      });
    });
  }, [socket, currentUserId, groups]);

  useEffect(() => {
    if (!socket || !currentUserId) return;
    socket.emit('group-chat:sync', { groupIds: groups.map((g) => g.id) });
  }, [socket, currentUserId, groups]);

  useEffect(() => {
    if (!socket) return;
    const onGroupMsg = (msg) => {
      if (!msg?.groupId) return;
      const key = String(msg.groupId);
      setGroupHistory((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), msg],
      }));
      setGroups((prev) => {
        const next = prev.map((g) => (
          String(g.id) === key
            ? { ...g, lastMessage: msg.text, lastAt: msg.timestamp }
            : g
        ));
        saveStoredGroups(currentUserId, next);
        return next;
      });
      if (!isOpen || selectedGroup?.id !== key) {
        setUnreadGroup((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
      }
    };
    const onRegistered = ({ groupId, name, memberIds }) => {
      setGroups((prev) => {
        if (prev.some((g) => String(g.id) === String(groupId))) return prev;
        const next = [...prev, { id: groupId, name, memberIds, lastAt: Date.now() }];
        saveStoredGroups(currentUserId, next);
        return next;
      });
    };
    socket.on('group-chat:receive', onGroupMsg);
    socket.on('group-chat:registered', onRegistered);
    return () => {
      socket.off('group-chat:receive', onGroupMsg);
      socket.off('group-chat:registered', onRegistered);
    };
  }, [socket, isOpen, selectedGroup?.id, currentUserId]);

  useEffect(() => {
    if (!selectedGroup || !currentUserId) return;
    const key = String(selectedGroup.id);
    setUnreadGroup((prev) => (prev[key] ? { ...prev, [key]: 0 } : prev));
    if (loadedGroupHistoriesRef.current.has(key)) return;
    loadedGroupHistoriesRef.current.add(key);
    api.get(`/api/group-chats/${encodeURIComponent(selectedGroup.id)}/messages`)
      .then((data) => {
        const msgs = data?.messages || [];
        if (!msgs.length) return;
        setGroupHistory((prev) => ({ ...prev, [key]: msgs }));
      })
      .catch(() => {});
  }, [selectedGroup, currentUserId]);

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
  const totalUnread = Object.values(unreadDm).reduce((s, n) => s + n, 0)
    + Object.values(unreadGroup).reduce((s, n) => s + n, 0);
  const badgeCount = isOpen ? 0 : totalUnread + unreadGlobal;

  useEffect(() => {
    if (!isOpen) return;
    setUnreadGlobal(0);
  }, [isOpen]);

  useEffect(() => {
    onUnreadChange?.(badgeCount);
  }, [badgeCount, onUnreadChange]);

  const conversationContacts = conversations.map((c) => ({
    id: c.contact_id,
    username: c.contact_username,
    offline: !onlinePlayers.some((p) => String(p.id) === String(c.contact_id)),
  }));

  useEffect(() => {
    if (!searchOpen || dmSearch.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      api.get(`/api/dm/search?q=${encodeURIComponent(dmSearch.trim())}`)
        .then((data) => setSearchResults(data.users || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [dmSearch, searchOpen]);

  const filteredPlayers = searchOpen
    ? searchResults
    : conversationContacts;

  function lastMsgFor(userId) {
    const key = String(userId);
    const live = dmHistory[key];
    if (live?.length) return live[live.length - 1];
    const conv = conversations.find((c) => String(c.contact_id) === key);
    if (conv) return { text: conv.last_message, from: conv.from_user_id, timestamp: conv.created_at };
    return null;
  }

  const inboxItems = useMemo(() => {
    const groupItems = groups.map((g) => ({
      kind: 'group',
      id: g.id,
      name: g.name,
      preview: g.lastMessage,
      lastAt: g.lastAt || 0,
      unread: unreadGroup[String(g.id)] || 0,
    }));
    const dmItems = conversationContacts.map((p) => ({
      kind: 'dm',
      id: p.id,
      name: p.username,
      player: p,
      preview: lastMsgFor(p.id)?.text,
      lastAt: lastMsgFor(p.id)?.timestamp || 0,
      unread: unreadDm[String(p.id)] || 0,
    }));
    return [...groupItems, ...dmItems].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }, [groups, conversationContacts, unreadGroup, unreadDm, dmHistory, conversations]);

  const selectedGroupMessages = selectedGroup
    ? (groupHistory[String(selectedGroup.id)] || [])
    : [];

  useEffect(() => {
    if (!selectedGroup) return;
    groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedGroup, selectedGroupMessages.length]);

  const toggleGroupPick = useCallback((player) => {
    setGroupPick((prev) => {
      const key = String(player.id);
      if (prev.some((p) => String(p.id) === key)) {
        return prev.filter((p) => String(p.id) !== key);
      }
      return [...prev, player];
    });
  }, []);

  const createGroupChat = useCallback(() => {
    const name = groupName.trim() || t('chat_group_default_name', { defaultValue: 'Groepschat' });
    if (groupPick.length < 1 || !socket || !currentUserId) return;
    const memberIds = [...new Set([String(currentUserId), ...groupPick.map((p) => String(p.id))])];
    const groupId = `grp-${Date.now()}-${memberIds.sort().join('-').slice(0, 48)}`;
    const group = {
      id: groupId,
      name,
      memberIds,
      memberNames: Object.fromEntries(groupPick.map((p) => [String(p.id), p.username])),
      lastAt: Date.now(),
    };
    const next = [...groups, group];
    setGroups(next);
    saveStoredGroups(currentUserId, next);
    socket.emit('group-chat:register', { groupId, name, memberIds });
    setCreatingGroup(false);
    setGroupName('');
    setGroupPick([]);
    setSearchOpen(false);
    setDmSearch('');
    setSelectedGroup(group);
    setSelectedUser(null);
  }, [groupName, groupPick, socket, currentUserId, groups, t]);

  const sendGroupMessage = useCallback(() => {
    const text = groupInput.trim();
    if (!text || !selectedGroup || !socket) return;
    socket.emit('group-chat:message', { groupId: selectedGroup.id, text });
    const key = String(selectedGroup.id);
    const myMsg = {
      groupId: selectedGroup.id,
      from: currentUserId,
      fromUsername: username || 'You',
      text,
      timestamp: Date.now(),
    };
    setGroupHistory((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), myMsg],
    }));
    setGroupInput('');
  }, [groupInput, selectedGroup, socket, currentUserId, username]);

  const selectedKey       = selectedUser ? String(selectedUser.id) : null;
  const selectedDmMessages = selectedKey ? (dmHistory[selectedKey] || []) : [];

  useEffect(() => {
    if (!selectedKey) return;
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedKey, selectedDmMessages.length]);

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

      {(dmOnly || tab === 'direct') && !selectedUser && !selectedGroup && !creatingGroup && (
        <div className="chat-panel__list-header">
          <strong>✉️ {t('chat_conversations', { defaultValue: 'Gesprekken' })}</strong>
          <div className="chat-panel__list-header-actions">
            {totalUnread > 0 && (
              <span className="chat-panel__tab-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
            )}
            <button
              type="button"
              className="chat-panel__search-btn"
              onClick={() => { setCreatingGroup(true); setSearchOpen(true); setGroupPick([]); setGroupName(''); }}
              aria-label={t('chat_create_group', { defaultValue: 'Nieuwe groep' })}
              title={t('chat_create_group', { defaultValue: 'Nieuwe groep' })}
            >
              👥
            </button>
            <button
              type="button"
              className={`chat-panel__search-btn${searchOpen && !creatingGroup ? ' chat-panel__search-btn--active' : ''}`}
              onClick={() => {
                setCreatingGroup(false);
                setSearchOpen((open) => {
                  const next = !open;
                  if (!next) setDmSearch('');
                  return next;
                });
              }}
              aria-label={t('chat_search_players', { defaultValue: 'Search by name…' })}
              title={t('chat_search_players', { defaultValue: 'Search by name…' })}
            >
              🔍
            </button>
          </div>
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
          {creatingGroup && !selectedUser && !selectedGroup && (
            <div className="chat-panel__group-form">
              <button type="button" className="chat-panel__back-btn" onClick={() => { setCreatingGroup(false); setGroupPick([]); setGroupName(''); }}>
                ← {t('worldMap.back', { defaultValue: 'Terug' })}
              </button>
              <input
                className="chat-input"
                type="text"
                placeholder={t('chat_group_name', { defaultValue: 'Groepsnaam…' })}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <input
                className="chat-input chat-panel__search-input"
                type="text"
                placeholder={t('chat_search_players', { defaultValue: 'Zoek spelers…' })}
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
              />
              <div className="chat-panel__group-picks">
                {groupPick.map((p) => (
                  <button key={p.id} type="button" className="chat-panel__group-chip" onClick={() => toggleGroupPick(p)}>
                    {p.username} ✕
                  </button>
                ))}
              </div>
              <div className="chat-panel__contact-list chat-panel__contact-list--compact">
                {filteredPlayers.map((player) => {
                  const picked = groupPick.some((p) => String(p.id) === String(player.id));
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={`chat-panel__contact${picked ? ' chat-panel__contact--picked' : ''}`}
                      onClick={() => toggleGroupPick(player)}
                    >
                      <div className="chat-panel__contact-avatar" style={{ background: avatarColor(player.id) }}>
                        {player.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="chat-panel__contact-body">
                        <div className="chat-panel__contact-name">{player.username}</div>
                      </div>
                      <span>{picked ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn btn-primary chat-panel__group-create-btn"
                disabled={groupPick.length < 1}
                onClick={createGroupChat}
              >
                {t('chat_create_group', { defaultValue: 'Groep aanmaken' })}
              </button>
            </div>
          )}

          {!creatingGroup && !selectedUser && !selectedGroup && (
            <div>
              {searchOpen && (
                <input
                  className="chat-input chat-panel__search-input"
                  type="text"
                  placeholder={t('chat_search_players', { defaultValue: 'Search by name…' })}
                  value={dmSearch}
                  onChange={(e) => setDmSearch(e.target.value)}
                  autoFocus
                />
              )}
              <div className="chat-panel__contact-list">
                {(convsLoading || groupsLoading || searchLoading) && (
                  <div className="chat-panel__empty-hint">Laden…</div>
                )}
                {!convsLoading && !searchLoading && !searchOpen && inboxItems.length === 0 && (
                  <div className="chat-panel__empty-hint">
                    {t('chat_no_conversations', { defaultValue: 'Nog geen gesprekken — tik op 🔍 of 👥' })}
                  </div>
                )}
                {!searchOpen && inboxItems.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    className="chat-panel__contact"
                    onClick={() => {
                      if (item.kind === 'group') {
                        setSelectedGroup(groups.find((g) => String(g.id) === String(item.id)) || { id: item.id, name: item.name });
                        setSelectedUser(null);
                      } else {
                        setSelectedUser(item.player);
                        setSelectedGroup(null);
                      }
                      setSearchOpen(false);
                      setDmSearch('');
                    }}
                  >
                    <div
                      className="chat-panel__contact-avatar"
                      style={{
                        background: item.kind === 'group' ? '#5c6bc0' : avatarColor(item.id),
                        opacity: item.kind === 'dm' && item.player?.offline ? 0.55 : 1,
                      }}
                    >
                      {item.kind === 'group' ? '👥' : item.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="chat-panel__contact-body">
                      <div className="chat-panel__contact-name">
                        {item.name}
                        {item.kind === 'dm' && !item.player?.offline && <span className="chat-panel__online-dot" />}
                      </div>
                      {item.preview ? (
                        <div className="chat-panel__contact-preview">{item.preview}</div>
                      ) : (
                        <div className="chat-panel__contact-preview chat-panel__contact-preview--empty">
                          {item.kind === 'group'
                            ? t('chat_group_empty', { defaultValue: 'Groepschat' })
                            : t('chat_start_conversation', { defaultValue: 'Stuur bericht' })}
                        </div>
                      )}
                    </div>
                    {item.unread > 0 && (
                      <span className="chat-panel__contact-unread">{item.unread > 9 ? '9+' : item.unread}</span>
                    )}
                  </button>
                ))}
                {searchOpen && filteredPlayers.map((player) => {
                  const key = String(player.id);
                  const unread = unreadDm[key] || 0;
                  const last = lastMsgFor(player.id);
                  return (
                    <button
                      key={key}
                      type="button"
                      className="chat-panel__contact"
                      onClick={() => {
                        setSelectedUser(player);
                        setSelectedGroup(null);
                        setSearchOpen(false);
                        setDmSearch('');
                      }}
                    >
                      <div className="chat-panel__contact-avatar" style={{ background: avatarColor(player.id), opacity: player.offline ? 0.55 : 1 }}>
                        {player.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="chat-panel__contact-body">
                        <div className="chat-panel__contact-name">
                          {player.username}
                          {!player.offline && <span className="chat-panel__online-dot" />}
                        </div>
                        {last ? (
                          <div className="chat-panel__contact-preview">
                            {String(last.from) === String(currentUserId) ? 'Jij: ' : ''}{last.text}
                          </div>
                        ) : (
                          <div className="chat-panel__contact-preview chat-panel__contact-preview--empty">
                            {t('chat_start_conversation', { defaultValue: 'Stuur bericht' })}
                          </div>
                        )}
                      </div>
                      {unread > 0 && <span className="chat-panel__contact-unread">{unread > 9 ? '9+' : unread}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedGroup && !selectedUser && (
            <>
              <div className="chat-panel__thread-header">
                <button type="button" className="chat-panel__back-btn" onClick={() => setSelectedGroup(null)}>←</button>
                <span className="chat-panel__thread-title">👥 {selectedGroup.name}</span>
                {onStartGroupCall && (
                  <button
                    type="button"
                    className="chat-panel__call-btn"
                    onClick={() => onStartGroupCall({ roomId: selectedGroup.id })}
                    title={t('chat_group_call', { defaultValue: 'Groepsgesprek' })}
                  >
                    📹
                  </button>
                )}
              </div>
              <div className="chat-messages" style={{ flex: 1 }}>
                {selectedGroupMessages.length === 0 && (
                  <div className="chat-panel__empty-hint">{t('chat_group_start', { defaultValue: 'Stuur het eerste bericht in deze groep' })}</div>
                )}
                {selectedGroupMessages.map((msg, i) => {
                  const isOwn = String(msg.from) === String(currentUserId);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: '0.35rem' }}>
                      {!isOwn && <span style={{ fontSize: '0.68rem', color: '#888' }}>{msg.fromUsername}</span>}
                      <div style={{
                        background: isOwn ? '#4caf50' : 'var(--surface2, #f0f0f0)',
                        color: isOwn ? '#fff' : 'inherit',
                        padding: '0.35rem 0.65rem', borderRadius: '12px',
                        maxWidth: '80%', fontSize: '0.85rem', wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '0.15rem' }}>{formatTime(msg.timestamp)}</span>
                    </div>
                  );
                })}
                <div ref={groupBottomRef} />
              </div>
              <div className="chat-input-row" style={{ marginTop: '0.4rem' }}>
                <input
                  className="chat-input"
                  type="text"
                  placeholder={t('chat_group_placeholder', { defaultValue: 'Bericht aan groep…' })}
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendGroupMessage()}
                  maxLength={300}
                />
                <button className="btn btn-primary" onClick={sendGroupMessage} style={{ padding: '0.4rem 0.8rem' }}>➤</button>
              </div>
            </>
          )}

          {selectedUser && !selectedGroup && (
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
                {onStartCall && (
                  <>
                    <button type="button" className="chat-panel__call-btn" onClick={() => onStartCall({ mode: 'outgoing', peerId: selectedUser.id, peerUsername: selectedUser.username, audioOnly: false })} title="Videogesprek">📹</button>
                    <button type="button" className="chat-panel__call-btn" onClick={() => onStartCall({ mode: 'outgoing', peerId: selectedUser.id, peerUsername: selectedUser.username, audioOnly: true })} title="Audiogesprek">📞</button>
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
