import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Format HH:MM timestamp
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatPanel({ socket, username }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([
    { id: 1, username: 'System', text: 'Welcome to AllOne Garden! 🌱', timestamp: Date.now() },
  ]);
  const [inputText,    setInputText]    = useState('');
  const [typingUsers,  setTypingUsers]  = useState([]);
  const [chatError,    setChatError]    = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const errorTimerRef  = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen to socket events
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onTyping = ({ username: user, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping ? [...prev.filter((u) => u !== user), user] : prev.filter((u) => u !== user)
      );
    };

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

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text) return;

    if (socket) {
      socket.emit('chat:message', { text });
    } else {
      // Offline fallback: show message locally
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), username: username || 'You', text, timestamp: Date.now() },
      ]);
    }

    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
      return;
    }

    if (socket) {
      socket.emit('chat:typing', { isTyping: true });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socket.emit('chat:typing', { isTyping: false });
      }, 1500);
    }
  };

  return (
    <div className="card">
      <h3>💬 {t('chat')}</h3>

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
    </div>
  );
}

export default ChatPanel;
