import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import './App.css';
import './i18n/config';

import api, { RateLimitError } from './hooks/useApi';
import { useNetwork } from './hooks/useNetwork';
import AuthScreen from './components/AuthScreen';
import Header from './components/Header';
import StatsBar from './components/StatsBar';
import Garden from './components/Garden';
import ToolsPanel from './components/ToolsPanel';
import ChatPanel from './components/ChatPanel';
import PlayersPanel from './components/PlayersPanel';
import Inventory from './components/Inventory';
import TradeModal from './components/TradeModal';
import PluginMarketplace from './components/PluginMarketplace';
import AchievementsPanel from './components/AchievementsPanel';
import AdminPanel from './components/AdminPanel';
import AccountSettings from './components/AccountSettings';
import Leaderboard from './components/Leaderboard';
import SeasonBanner from './components/SeasonBanner';
import StructuresPanel from './components/StructuresPanel';
import WorldMap from './components/WorldMap';
import VideoCall from './components/VideoCall';
import TourOverlay from './components/TourOverlay';
import HelpPanel from './components/HelpPanel';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const INITIAL_PLOTS = Array(24).fill(null).map(() => ({
  tilled: false, planted: false, plantType: null,
  waterLevel: 0, fertilized: false, daysPlanted: 0,
}));

const INITIAL_STRUCTURES = {
  well:       { built: false, charges: 3 },
  compost:    { built: false, charges: 0, harvestsUntilNext: 3 },
  greenhouse: { built: false },
};

const INITIAL_GAME = {
  currentDay: 1,
  weather: 'sunny',
  selectedTool: null,
  selectedSeed: 'tomato',
  playerStats: { xp: 0, coins: 100, level: 1, plantsGrown: 0 },
  inventory: { tomato: 0, carrot: 0, lettuce: 0, radish: 0, corn: 0, potato: 0, pumpkin: 0, sunflower: 0, blueberry: 0 },
  plots: INITIAL_PLOTS,
  structures: INITIAL_STRUCTURES,
};

// Debounce helper — saves to backend at most once every N ms
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

function App() {
  const { i18n } = useTranslation();
  const { online } = useNetwork();

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('garden_dark') === 'true'
  );

  // Apply data-theme attribute + persist whenever darkMode changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('garden_dark', String(darkMode));
  }, [darkMode]);

  const [authUser,    setAuthUser]    = useState(null);
  const [authToken,   setAuthToken]   = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [backendUp,   setBackendUp]   = useState(false);

  const [socket,     setSocket]     = useState(null);
  const [serverInfo, setServerInfo] = useState(null);

  const [notification,     setNotification]     = useState(null);
  const [bonusToast,       setBonusToast]       = useState(null);  // daily-bonus popup
  const [motd,             setMotd]             = useState(null);  // MOTD shown once per session
  const motdShown = useRef(false);
  const [showTrade,        setShowTrade]        = useState(false);
  const [showPlugins,      setShowPlugins]      = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showAdmin,        setShowAdmin]        = useState(false);
  const [showAccount,      setShowAccount]      = useState(false);
  const [showLeaderboard,  setShowLeaderboard]  = useState(false);
  const [showWorldMap,     setShowWorldMap]     = useState(false);
  const [callState,        setCallState]        = useState(null);   // { mode, peerId, peerUsername, offer? }

  // ── Tour & Help ───────────────────────────────────────────────────────────────
  // Show the tour automatically on first-ever login; persisted in localStorage
  const [showTour, setShowTour] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [gameState, setGameState] = useState(INITIAL_GAME);

  // ── Notification helper ───────────────────────────────────────────────────────
  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Restore session from localStorage ────────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem('garden_token');
    if (!savedToken) { setAuthChecked(true); return; }

    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ user }) => { setAuthUser(user); setAuthToken(savedToken); setBackendUp(true); })
      .catch(() => localStorage.removeItem('garden_token'))
      .finally(() => setAuthChecked(true));
  }, []);

  // ── Load garden + inventory from backend after login ──────────────────────────
  useEffect(() => {
    if (!authUser || !backendUp) return;

    api.get('/api/garden')
      .then((data) => {
        setGameState((prev) => ({
          ...prev,
          plots:      data.plots?.length ? data.plots : prev.plots,
          currentDay: data.currentDay || prev.currentDay,
          weather:    data.weather    || prev.weather,
          playerStats: {
            xp:          authUser.xp          || 0,
            coins:       authUser.coins        || 100,
            level:       authUser.level        || 1,
            plantsGrown: authUser.plantsGrown  || 0,
          },
        }));
      })
      .catch(() => {}); // backend garden not found — use defaults
  }, [authUser, backendUp]);

  // ── Auto-save garden to backend (debounced, 3 s after last change) ────────────
  const saveGarden = useCallback((state) => {
    if (!backendUp) return;
    api.post('/api/garden', {
      plots:      state.plots,
      currentDay: state.currentDay,
      weather:    state.weather,
    }).catch((err) => {
      if (err instanceof RateLimitError) {
        showNotification('Saving too fast — please wait a moment.');
      }
    });
  }, [backendUp, showNotification]);

  const debouncedSave = useDebounce(saveGarden, 3000);

  // Trigger save whenever plots / day / weather change
  useEffect(() => {
    debouncedSave(gameState);
  }, [gameState.plots, gameState.currentDay, gameState.weather, debouncedSave]); // eslint-disable-line

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      auth: { token: authToken },
    });

    newSocket.on('connect', () => {
      setSocket(newSocket);
      setBackendUp(true);
      setServerInfo({ name: process.env.REACT_APP_SERVER_NAME || 'Local Server', players: 1 });
    });

    newSocket.on('server:info', (info) => setServerInfo(info));
    newSocket.on('connect_error', () => newSocket.disconnect());

    return () => newSocket.disconnect();
  }, [authUser, authToken]);

  // ── Socket event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onVisitor = ({ username }) =>
      showNotification(`🌱 ${username} is visiting your garden!`);

    const onHelped = ({ username, amount }) => {
      showNotification(`🤝 ${username} helped you (+${amount} XP)!`);
      setGameState((prev) => ({
        ...prev,
        playerStats: { ...prev.playerStats, xp: prev.playerStats.xp + amount },
      }));
    };

    // Federated chat messages (from other servers via P2P)
    const onFederatedChat = (msg) => {
      // ChatPanel listens to socket directly; this handler is just for the notification
      if (msg.federated) showNotification(`🌍 ${msg.serverName}: ${msg.username}`);
    };

    socket.on('garden:visitor',  onVisitor);
    socket.on('player:helped',   onHelped);
    socket.on('chat:message',    onFederatedChat);

    // ── Plugin: daily-bonus ────────────────────────────────────────────────
    const onDailyBonus = (data) => {
      setBonusToast(data);
      setTimeout(() => setBonusToast(null), 5000);
      // Also update coin/xp counts
      setGameState((prev) => ({
        ...prev,
        playerStats: {
          ...prev.playerStats,
          coins: prev.playerStats.coins + (data.coins || 0),
          xp:    prev.playerStats.xp    + (data.xp    || 0),
        },
      }));
    };

    // ── Plugin: server-motd ────────────────────────────────────────────────
    const onMotd = (data) => {
      if (!motdShown.current && data.message) {
        motdShown.current = true;
        setMotd(data.message);
      }
    };

    socket.on('plugin:daily-bonus:awarded', onDailyBonus);
    socket.on('plugin:server-motd:data',    onMotd);

    // ── Incoming video call ────────────────────────────────────────────
    const onCallOffer = ({ from, fromUsername, offer }) => {
      // Only show if not already in a call
      setCallState((prev) => prev ? prev : {
        mode:         'incoming',
        peerId:       from,
        peerUsername: fromUsername,
        offer,
      });
    };

    socket.on('call:offer', onCallOffer);

    return () => {
      socket.off('garden:visitor',  onVisitor);
      socket.off('player:helped',   onHelped);
      socket.off('chat:message',    onFederatedChat);
      socket.off('plugin:daily-bonus:awarded', onDailyBonus);
      socket.off('plugin:server-motd:data',    onMotd);
      socket.off('call:offer',      onCallOffer);
    };
  }, [socket, showNotification]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleLogin = (user, token) => {
    setAuthUser(user);
    setAuthToken(token);
    if (token) setBackendUp(true);
    setGameState((prev) => ({
      ...prev,
      playerStats: {
        xp:          user.xp          || 0,
        coins:       user.coins        || 100,
        level:       user.level        || 1,
        plantsGrown: user.plantsGrown  || 0,
      },
    }));
    // Launch the tour automatically on first-ever login
    if (localStorage.getItem('garden_tour_done') !== 'true') {
      setShowTour(true);
    }
  };

  const handleTourFinish = () => {
    localStorage.setItem('garden_tour_done', 'true');
    setShowTour(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('garden_token');
    socket?.disconnect();
    setSocket(null);
    setAuthUser(null);
    setAuthToken(null);
    setServerInfo(null);
    setBackendUp(false);
    setGameState(INITIAL_GAME);
  };

  // Sell a crop from inventory
  const handleSell = useCallback((cropId, qty, priceEach) => {
    setGameState((prev) => {
      if ((prev.inventory[cropId] || 0) < qty) return prev;
      const earned = qty * priceEach;
      showNotification(`Sold ${qty}× ${cropId} for 🪙${earned}`);
      return {
        ...prev,
        inventory: { ...prev.inventory, [cropId]: prev.inventory[cropId] - qty },
        playerStats: { ...prev.playerStats, coins: prev.playerStats.coins + earned },
      };
    });
  }, [showNotification]);

  // Called by TradeModal after a successful purchase
  const handleTradeBuy = useCallback((cropId, qty, totalCost) => {
    setGameState((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, [cropId]: (prev.inventory[cropId] || 0) + qty },
      playerStats: { ...prev.playerStats, coins: prev.playerStats.coins - totalCost },
    }));
    showNotification(`Bought ${qty}× ${cropId} for 🪙${totalCost}`);
  }, [showNotification]);

  // ── Structures ────────────────────────────────────────────────────────────────
  const STRUCTURE_COSTS = { well: 50, compost: 30, greenhouse: 80 };

  const handleBuildStructure = useCallback((id) => {
    const cost = STRUCTURE_COSTS[id] || 0;
    const defaults = {
      well:       { built: true, charges: 3 },
      compost:    { built: true, charges: 0, harvestsUntilNext: 3 },
      greenhouse: { built: true },
    };
    setGameState((prev) => {
      if (prev.playerStats.coins < cost) return prev;
      return {
        ...prev,
        playerStats: { ...prev.playerStats, coins: prev.playerStats.coins - cost },
        structures:  { ...prev.structures, [id]: defaults[id] },
      };
    });
    showNotification(`🏗️ ${id} built!`);
  }, [showNotification]); // eslint-disable-line

  const handleUseWell = useCallback(() => {
    setGameState((prev) => {
      const well = prev.structures?.well;
      if (!well?.built || (well.charges ?? 0) <= 0) return prev;
      const updatedPlots = prev.plots.map((plot) =>
        plot.tilled ? { ...plot, waterLevel: Math.min((plot.waterLevel || 0) + 2, 3) } : plot
      );
      showNotification('🪣 Well used — plots watered!');
      return {
        ...prev,
        plots: updatedPlots,
        structures: {
          ...prev.structures,
          well: { ...well, charges: (well.charges ?? 0) - 1 },
        },
      };
    });
  }, [showNotification]);

  const handleUseCompost = useCallback(() => {
    setGameState((prev) => {
      const compost = prev.structures?.compost;
      if (!compost?.built || (compost.charges || 0) <= 0) return prev;
      const updatedPlots = prev.plots.map((plot) =>
        (plot.tilled && plot.planted && !plot.fertilized)
          ? { ...plot, fertilized: true }
          : plot
      );
      showNotification('🌿 Compost applied — all planted plots fertilized!');
      return {
        ...prev,
        plots: updatedPlots,
        structures: {
          ...prev.structures,
          compost: { ...compost, charges: (compost.charges || 0) - 1 },
        },
      };
    });
  }, [showNotification]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!authChecked) return null;
  if (!authUser)    return <AuthScreen onLogin={handleLogin} />;

  return (
    <div className="App">
      {!online && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#b71c1c', color: '#fff', textAlign: 'center',
          padding: '8px 16px', fontSize: '14px', fontWeight: 600,
        }}>
          You are offline — changes will not be saved until reconnected.
        </div>
      )}
      <Header
        onLanguageChange={(lang) => i18n.changeLanguage(lang)}
        currentLang={i18n.language}
        serverInfo={serverInfo}
        username={authUser.username}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onLogout={handleLogout}
        onOpenTrade={() => setShowTrade(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenAchievements={() => setShowAchievements(true)}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenAccount={() => setShowAccount(true)}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onOpenWorldMap={() => setShowWorldMap(true)}
      />

      <div className="game-container">
        <StatsBar stats={gameState.playerStats} />
        <SeasonBanner socket={socket} currentDay={gameState.currentDay} />

        <div className="tools-and-structures">
          <div data-tour="tools">
            <ToolsPanel
              selectedTool={gameState.selectedTool}
              selectedSeed={gameState.selectedSeed}
              onToolSelect={(tool) =>
                setGameState((prev) => ({ ...prev, selectedTool: tool }))
              }
              onSeedSelect={(seed) =>
                setGameState((prev) => ({ ...prev, selectedSeed: seed }))
              }
            />
          </div>
          <div data-tour="structures">
            <StructuresPanel
              structures={gameState.structures}
              coins={gameState.playerStats.coins}
              onBuild={handleBuildStructure}
              onUseWell={handleUseWell}
              onUseCompost={handleUseCompost}
            />
          </div>
        </div>

        <div data-tour="garden">
        <Garden
          plots={gameState.plots}
          selectedTool={gameState.selectedTool}
          selectedSeed={gameState.selectedSeed}
          currentDay={gameState.currentDay}
          weather={gameState.weather}
          structures={gameState.structures}
          onUpdateGame={setGameState}
          socket={socket}
        />
        </div>{/* /data-tour="garden" */}

        <div className="multiplayer-section" data-tour="chat">
          <ChatPanel socket={socket} username={authUser.username} />
          <PlayersPanel socket={socket} />
        </div>

        <div data-tour="inventory">
        <Inventory
          inventory={gameState.inventory}
          onSell={handleSell}
          onOpenTrade={() => setShowTrade(true)}
        />
        </div>{/* /data-tour="inventory" */}
      </div>

      {/* Modals */}
      {showTrade && (
        <TradeModal
          inventory={gameState.inventory}
          coins={gameState.playerStats.coins}
          userId={authUser.id}
          socket={socket}
          onBuy={handleTradeBuy}
          onClose={() => setShowTrade(false)}
        />
      )}

      {showPlugins && (
        <PluginMarketplace user={authUser} onClose={() => setShowPlugins(false)} />
      )}

      {showAchievements && (
        <AchievementsPanel
          socket={socket}
          userId={authUser.id}
          onClose={() => setShowAchievements(false)}
        />
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {showAccount && (
        <AccountSettings
          onClose={() => setShowAccount(false)}
          onDeleted={handleLogout}
        />
      )}

      {showLeaderboard && (
        <Leaderboard
          currentUserId={authUser.id}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {showWorldMap && (
        <WorldMap
          socket={socket}
          currentUserId={authUser.id}
          onClose={() => setShowWorldMap(false)}
          onStartCall={(state) => setCallState(state)}
        />
      )}

      {/* Video call overlay — rendered on top of everything */}
      {callState && socket && (
        <VideoCall
          socket={socket}
          callState={callState}
          onEnd={() => setCallState(null)}
        />
      )}

      {/* MOTD banner — shown once per session after connect */}
      {motd && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1b5e20', color: '#fff', borderRadius: '12px',
          padding: '0.9rem 1.4rem', maxWidth: '480px', width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 1100,
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
          <span style={{ fontSize: '1.4rem' }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
              SERVER MESSAGE
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{motd}</div>
          </div>
          <button
            onClick={() => setMotd(null)}
            style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Daily bonus toast */}
      {bonusToast && (
        <div style={{
          position: 'fixed', bottom: motd ? '10rem' : '5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#f57f17', color: '#fff', borderRadius: '12px',
          padding: '0.9rem 1.4rem', maxWidth: '360px', width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 1100,
          animation: 'slideUp 0.3s ease',
        }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.2rem' }}>
            {bonusToast.message || `🌅 Daily bonus claimed!`}
          </div>
          {bonusToast.streak > 1 && (
            <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>
              🔥 {bonusToast.streak}-day streak · keep it up!
            </div>
          )}
        </div>
      )}

      {notification && <div className="notification">{notification}</div>}

      {/* ── Persistent ❓ Help button ── */}
      <button
        onClick={() => setShowHelp(true)}
        title="Help & Reference"
        aria-label="Open help panel"
        style={{
          position: 'fixed', bottom: '1.25rem', right: '1.25rem',
          zIndex: 1400,
          width: 44, height: 44,
          borderRadius: '50%',
          border: '2px solid #a5d6a7',
          background: '#e8f5e9',
          color: '#2e7d32',
          fontSize: '1.2rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        ❓
      </button>

      {/* ── Help Panel ── */}
      {showHelp && (
        <HelpPanel
          onClose={() => setShowHelp(false)}
          onStartTour={() => { setShowHelp(false); setShowTour(true); }}
        />
      )}

      {/* ── First-time tour (or manual replay) ── */}
      {showTour && (
        <TourOverlay onFinish={handleTourFinish} />
      )}
    </div>
  );
}

export default App;
