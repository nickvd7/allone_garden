import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import './App.css';
import './i18n/config';

import api, { RateLimitError, ConflictError } from './hooks/useApi';
import {
  AUTH_HTTPONLY,
  clearGardenToken,
  getFetchCredentials,
  hasAuthenticatedApi,
  readGardenToken,
} from './auth/session';
import { useAnalytics } from './hooks/useAnalytics';
import { useDiscordPresence } from './hooks/useDiscordPresence';
import { useSteamAchievements } from './hooks/useSteamAchievements';
import { useNetwork } from './hooks/useNetwork';
import { useMobile } from './hooks/useMobile';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useOfflineGardenQueue, GARDEN_SERVER_UPDATED_KEY } from './hooks/useOfflineGardenQueue';
import { useCapacitorPreferencesMirror } from './hooks/useCapacitorPreferencesMirror';
import AuthScreen from './components/AuthScreen';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel';
import PlayersPanel from './components/PlayersPanel';
import Inventory from './components/Inventory';
import TradeModal from './components/TradeModal';
import PluginMarketplace from './components/PluginMarketplace';
import AchievementsPanel from './components/AchievementsPanel';
import AdminPanel from './components/AdminPanel';
import AccountSettings from './components/AccountSettings';
import Leaderboard from './components/Leaderboard';
import WorldMap from './components/WorldMap';
import VideoCall from './components/VideoCall';
import TourOverlay from './components/TourOverlay';
import HelpPanel from './components/HelpPanel';
import StructuresPanel from './components/StructuresPanel';
import GradendexPage from './components/GradendexPage';
import GradendexPanel from './components/GradendexPanel';
import ContentWikiPage from './components/ContentWikiPage';
import HomePage from './components/HomePage';
import SetupWizard from './components/SetupWizard';
import QRPanel from './components/QRPanel';
import PlantRecognitionModal from './components/PlantRecognitionModal';
import GardenConflictModal from './components/GardenConflictModal';
import { GameContentProvider } from './context/GameContentContext';

const BACKEND_URL = process.env.REACT_APP_API_URL || '';
const WEATHER_ICONS = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  windy: '💨',
  storm: '⛈️',
  drought: '🏜️',
};
const LOCAL_WEATHER_TYPES = ['sunny', 'cloudy', 'rainy', 'windy', 'storm', 'drought'];

const INITIAL_PLOTS = Array(24).fill(null).map(() => ({
  tilled: false, planted: false, plantType: null,
  waterLevel: 0, fertilized: false, daysPlanted: 0,
}));

const INITIAL_STRUCTURES = {
  well:        { built: false, charges: 3 },
  compost:     { built: false, charges: 0, harvestsUntilNext: 3 },
  greenhouse:  { built: false },
  // Farm tier
  barn:        { built: false },
  chickenCoop: { built: false, daysSinceEgg: 0, eggReady: false },
  stable:      { built: false, daysSinceMilk: 0, milkReady: false },
  silo:        { built: false },
};

const INITIAL_GAME = {
  currentDay: 1,
  weather: 'sunny',
  selectedTool: null,
  selectedSeed: 'tomato',
  playerStats: { xp: 0, coins: 100, level: 1, plantsGrown: 0 },
  inventory: { tomato: 0, carrot: 0, lettuce: 0, radish: 0, corn: 0, potato: 0, pumpkin: 0, sunflower: 0, blueberry: 0, egg: 0, milk: 0 },
  plots: INITIAL_PLOTS,
  structures: INITIAL_STRUCTURES,
};

const LOCAL_GROWTH_STAGES = {
  tomato: 3, carrot: 2, lettuce: 2, radish: 1, corn: 4,
  potato: 3, pumpkin: 5, sunflower: 2, blueberry: 4,
};

// Debounce helper — saves to backend at most once every N ms
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// RTL languages that need dir="rtl" on <html>
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

function App() {
  const { i18n, t } = useTranslation();
  const { online } = useNetwork();
  const { triggerHaptic } = useMobile();

  // Apply RTL direction to the document root when an RTL language is active
  useEffect(() => {
    const isRtl = RTL_LANGS.has(i18n.language);
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);
  const { track }  = useAnalytics();
  const { unlock } = useSteamAchievements();

  // ── Auto-update banner (Electron only) ──────────────────────────────────────
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.onUpdateAvailable?.(() => {}); // acknowledge silently
    api.onUpdateDownloaded?.(() => setUpdateReady(true));
  }, []);

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
  const hasServerAuth = hasAuthenticatedApi(authUser, authToken);
  usePushNotifications(hasServerAuth);
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
  const [showProfile,      setShowProfile]      = useState(false);
  const [showAccount,      setShowAccount]      = useState(false);
  const [showLeaderboard,  setShowLeaderboard]  = useState(false);
  const [showGradendex,    setShowGradendex]    = useState(false);
  const [showGradendexQuick, setShowGradendexQuick] = useState(false);
  const [showContentWiki,  setShowContentWiki]  = useState(false);
  const [showSocialMenu,   setShowSocialMenu]   = useState(false);
  const [showInventoryMenu,setShowInventoryMenu]= useState(false);
  const [showXpDetails,    setShowXpDetails]    = useState(false);
  const [worldHud,         setWorldHud]         = useState({ coords: null, onlineCount: 0 });
  const [socialUnread,     setSocialUnread]     = useState(0);
  const [, setContentWikiBadge] = useState(0);
  const [callState,        setCallState]        = useState(null);   // { mode, peerId, peerUsername, offer? }

  // ── Tour & Help ───────────────────────────────────────────────────────────────
  // Show the tour automatically on first-ever login; persisted in localStorage
  const [showTour, setShowTour] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showQR,          setShowQR]          = useState(false);
  const [showRecognition, setShowRecognition] = useState(false);
  const [showStructures,  setShowStructures]  = useState(false);

  const [gameState, setGameState] = useState(INITIAL_GAME);
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [gardenConflict, setGardenConflict] = useState(null);

  useCapacitorPreferencesMirror({
    enabled: !!authUser && Capacitor.getPlatform() !== 'web',
  });

  useOfflineGardenQueue({
    enabled: process.env.REACT_APP_ENABLE_OFFLINE_QUEUE === 'true' && !!authUser,
    gameState,
    backendUp,
  });

  // ── Discord Rich Presence ─────────────────────────────────────────────────────
  useDiscordPresence(authUser ? {
    details: `Day ${gameState.currentDay} · ${gameState.weather || 'sunny'}`,
    state:   authUser.username ? `Playing as ${authUser.username}` : 'In the garden',
    season:  gameState.weather,
    day:     gameState.currentDay,
  } : { details: 'On the login screen', state: 'AllOne Garden' });

  // ── Notification helper ───────────────────────────────────────────────────────
  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Content Wiki badge — poll every 60 s ──────────────────────────────────────
  // Admins see global pending count; regular users see their own revision_requested count.
  // authUser.isAdmin is derived from the server profile (UI hint only); counts use public/admin endpoints as appropriate.
  useEffect(() => {
    if (!authUser) return;
    const fetchCount = () => {
      if (authUser.isAdmin) {
        fetch(`${BACKEND_URL}/api/content/proposals/pending-count`)
          .then((r) => r.ok ? r.json() : { count: 0 })
          .then(({ count }) => setContentWikiBadge(count || 0))
          .catch(() => {});
      } else {
        if (!hasServerAuth) { setContentWikiBadge(0); return; }
        api.get('/api/content/proposals/mine')
          .then((data) => {
            const n = (data.proposals || []).filter((p) => p.status === 'revision_requested').length;
            setContentWikiBadge(n);
          })
          .catch(() => {});
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [authUser, hasServerAuth]);

  // ── Restore session from localStorage or HttpOnly cookie ───────────────────
  useEffect(() => {
    if (AUTH_HTTPONLY) {
      fetch(`${BACKEND_URL}/api/auth/me`, { credentials: getFetchCredentials() })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(({ user }) => {
          setAuthUser(user);
          setAuthToken(null);
          setBackendUp(true);
        })
        .catch(() => {})
        .finally(() => setAuthChecked(true));
      return;
    }

    const savedToken = readGardenToken();
    if (!savedToken) { setAuthChecked(true); return; }

    fetch(`${BACKEND_URL}/api/auth/me`, {
      credentials: getFetchCredentials(),
      headers:     { Authorization: `Bearer ${savedToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ user }) => { setAuthUser(user); setAuthToken(savedToken); setBackendUp(true); })
      .catch(() => clearGardenToken())
      .finally(() => setAuthChecked(true));
  }, []);

  // ── Load garden + inventory from backend after login ──────────────────────────
  useEffect(() => {
    if (!authUser || !backendUp || !hasServerAuth) return;

    api.get('/api/garden')
      .then((data) => {
        if (data.serverUpdatedAt) {
          localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, data.serverUpdatedAt);
        }
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
  }, [authUser, backendUp, hasServerAuth]);

  // ── Auto-save garden to backend (debounced, 3 s after last change) ────────────
  const saveGarden = useCallback((state) => {
    if (!backendUp) return;
    const payload = {
      plots:      state.plots,
      currentDay: state.currentDay,
      weather:    state.weather,
    };
    const since = localStorage.getItem(GARDEN_SERVER_UPDATED_KEY);
    if (since) payload.ifUnmodifiedSince = since;
    api.post('/api/garden', payload)
      .then((r) => {
        if (r && r.serverUpdatedAt) {
          localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, r.serverUpdatedAt);
        }
      })
      .catch((err) => {
        if (err instanceof ConflictError && err.detail?.garden) {
          const snap = gameStateRef.current;
          setGardenConflict({
            serverGarden:    err.detail.garden,
            serverUpdatedAt: err.detail.serverUpdatedAt,
            localSnapshot: {
              plots:      snap.plots,
              currentDay: snap.currentDay,
              weather:    snap.weather,
            },
          });
          return;
        }
        if (err instanceof RateLimitError) {
          showNotification('Saving too fast — please wait a moment.');
        }
      });
  }, [backendUp, showNotification]);

  const debouncedSave = useDebounce(saveGarden, 3000);

  const handleConflictUseServer = useCallback(() => {
    if (!gardenConflict) return;
    const g = gardenConflict.serverGarden;
    setGameState((prev) => ({
      ...prev,
      plots:      g.plots || prev.plots,
      currentDay: g.currentDay ?? prev.currentDay,
      weather:    g.weather ?? prev.weather,
    }));
    if (gardenConflict.serverUpdatedAt) {
      localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, gardenConflict.serverUpdatedAt);
    }
    setGardenConflict(null);
    showNotification(t('gardenConflict.applied_server'));
  }, [gardenConflict, showNotification, t]);

  const handleConflictForceLocal = useCallback(() => {
    if (!gardenConflict) return;
    const s = gardenConflict.localSnapshot;
    api
      .post('/api/garden', {
        plots: s.plots,
        currentDay: s.currentDay,
        weather: s.weather,
      })
      .then((r) => {
        if (r?.serverUpdatedAt) {
          localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, r.serverUpdatedAt);
        }
        setGardenConflict(null);
        showNotification(t('gardenConflict.saved_local'));
      })
      .catch(() => showNotification('Could not save — try again.'));
  }, [gardenConflict, showNotification, t]);

  // Trigger save whenever plots / day / weather change
  useEffect(() => {
    debouncedSave(gameState);
  }, [gameState.plots, gameState.currentDay, gameState.weather, debouncedSave]); // eslint-disable-line

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;

    const newSocket = io(BACKEND_URL, {
      transports:      ['websocket'],
      reconnectionAttempts: 5,
      withCredentials: AUTH_HTTPONLY,
      auth:            { token: authToken || undefined },
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

    // ── Proposal status notifications ──────────────────────────────────
    const onProposalStatus = ({ status, itemName, note }) => {
      const msgs = {
        approved:           `✅ Your proposal for "${itemName}" was approved and is now live!`,
        rejected:           `❌ Your proposal for "${itemName}" was rejected.${note ? ` Reason: ${note}` : ''}`,
        revision_requested: `🔄 "${itemName}" proposal needs revision: ${note}`,
      };
      if (msgs[status]) showNotification(msgs[status]);
      // Refresh personal badge count immediately
      if (hasServerAuth) {
        api.get('/api/content/proposals/mine')
          .then((data) => {
            const n = (data.proposals || []).filter((p) => p.status === 'revision_requested').length;
            setContentWikiBadge(n);
          })
          .catch(() => {});
      }
    };

    socket.on('proposal:status_changed', onProposalStatus);

    return () => {
      socket.off('garden:visitor',  onVisitor);
      socket.off('player:helped',   onHelped);
      socket.off('chat:message',    onFederatedChat);
      socket.off('plugin:daily-bonus:awarded', onDailyBonus);
      socket.off('plugin:server-motd:data',    onMotd);
      socket.off('call:offer',      onCallOffer);
      socket.off('proposal:status_changed', onProposalStatus);
    };
  }, [socket, showNotification, hasServerAuth]);

  useEffect(() => {
    if (!socket) return;
    const onChatForBadge = (msg) => {
      if (showSocialMenu) return;
      if (msg?.username && msg.username === authUser?.username) return;
      setSocialUnread((n) => n + 1);
    };
    socket.on('chat:message', onChatForBadge);
    return () => socket.off('chat:message', onChatForBadge);
  }, [socket, showSocialMenu, authUser]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleLogin = (user, token) => {
    setAuthUser(user);
    setAuthToken(token);
    if (user.id !== 0) setBackendUp(true);
    track('session_start', { level: user.level || 1 });
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
    clearGardenToken();
    fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: getFetchCredentials(),
    }).catch(() => {});
    socket?.disconnect();
    setSocket(null);
    setAuthUser(null);
    setAuthToken(null);
    setServerInfo(null);
    setBackendUp(false);
    setGameState(INITIAL_GAME);
  };

  const handleNextDay = useCallback(() => {
    if (!hasServerAuth) {
      setGameState((prev) => ({
        ...prev,
        currentDay: (prev.currentDay || 1) + 1,
        weather: LOCAL_WEATHER_TYPES[Math.floor(Math.random() * LOCAL_WEATHER_TYPES.length)],
        plots: (prev.plots || []).map((plot) => {
          if (!plot?.planted) {
            const nextWater = Math.max(0, (plot?.waterLevel || 0) - 1);
            return { ...plot, waterLevel: nextWater };
          }
          const growthDays = LOCAL_GROWTH_STAGES[plot.plantType] || 3;
          const hasPest = !!plot.pest || Math.random() < 0.05;
          const waterBonus = (plot.waterLevel || 0) > 0 ? 1 : 0;
          const fertBonus = plot.fertilized ? 1 : 0;
          const nextDays = hasPest
            ? (plot.daysPlanted || 0)
            : Math.min(growthDays, (plot.daysPlanted || 0) + 1 + waterBonus + fertBonus);
          const nextWater = Math.max(0, (plot.waterLevel || 0) - 1);
          return {
            ...plot,
            daysPlanted: nextDays,
            waterLevel: nextWater,
            pest: hasPest,
          };
        }),
      }));
      showNotification('Nieuwe dag gestart.');
      return;
    }
    api.post('/api/garden/nextday')
      .then((data) => {
        setGameState((prev) => ({
          ...prev,
          currentDay: data.currentDay || ((prev.currentDay || 1) + 1),
          weather: data.weather || prev.weather,
          plots: data.plots?.length ? data.plots : prev.plots,
        }));
      })
      .catch(() => {
        showNotification('Kon de volgende dag niet starten.');
      });
  }, [hasServerAuth, showNotification]);

  // Sell a crop from inventory — silo gives +20% bonus
  const handleSell = useCallback((cropId, qty, priceEach) => {
    setGameState((prev) => {
      if ((prev.inventory[cropId] || 0) < qty) return prev;
      const siloBonus = prev.structures?.silo?.built ? 1.2 : 1;
      const earned    = Math.round(qty * priceEach * siloBonus);
      const bonusNote = siloBonus > 1 ? ' (+silo)' : '';
      showNotification(`Sold ${qty}× ${cropId} for 🪙${earned}${bonusNote}`);
      unlock('FIRST_SALE');
      triggerHaptic('MEDIUM');
      return {
        ...prev,
        inventory: { ...prev.inventory, [cropId]: prev.inventory[cropId] - qty },
        playerStats: { ...prev.playerStats, coins: prev.playerStats.coins + earned },
      };
    });
  }, [showNotification, unlock, triggerHaptic]);

  // Farm animal collect handlers
  // QR scan: plant the identified crop in the first available tilled empty plot
  const handlePlantFromQR = useCallback((cropSlug) => {
    let planted = false;
    setGameState((prev) => {
      const updatedPlots = [...prev.plots];
      const idx = updatedPlots.findIndex((p) => p.tilled && !p.planted);
      if (idx === -1) return prev; // no tilled plot available
      updatedPlots[idx] = {
        ...updatedPlots[idx],
        planted:     true,
        plantType:   cropSlug,
        dayPlanted:  prev.currentDay,
        daysPlanted: 0,
      };
      planted = true;
      return {
        ...prev,
        plots: updatedPlots,
        playerStats: { ...prev.playerStats, xp: prev.playerStats.xp + 10 },
      };
    });
    // Notification fires after state update via a short timeout
    setTimeout(() => {
      if (planted !== false) showNotification(`🌱 ${cropSlug} planted from QR scan!`);
      else showNotification('⚠️ No tilled plot available — till a plot first!');
    }, 50);
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

  /** Alleen voor gast-markt: oogst uit inventaris halen bij het plaatsen van een listing. */
  const handleTradeSellDeduct = useCallback((cropId, qty) => {
    setGameState((prev) => {
      if ((prev.inventory[cropId] || 0) < qty) return prev;
      return {
        ...prev,
        inventory: { ...prev.inventory, [cropId]: prev.inventory[cropId] - qty },
      };
    });
  }, []);

  const handleGuestSale = useCallback((cropId, qty, totalCoins) => {
    setGameState((prev) => ({
      ...prev,
      playerStats: { ...prev.playerStats, coins: (prev.playerStats?.coins || 0) + totalCoins },
    }));
    showNotification(`Virtuele koper kocht ${qty}× ${cropId} voor 🪙${totalCoins}`);
  }, [showNotification]);

  const handleBuildStructure = useCallback((id) => {
    setGameState((prev) => {
      const defCosts = { well: 50, compost: 30, greenhouse: 80, barn: 120, chickenCoop: 60, stable: 100, silo: 90 };
      const requires = { chickenCoop: 'barn', stable: 'barn' };
      const cost = defCosts[id] || 0;
      if ((prev.structures?.[id]?.built) || (prev.playerStats?.coins || 0) < cost) return prev;
      const req = requires[id];
      if (req && !prev.structures?.[req]?.built) return prev;
      return {
        ...prev,
        structures: {
          ...prev.structures,
          [id]: { ...(prev.structures?.[id] || {}), built: true },
        },
        playerStats: {
          ...prev.playerStats,
          coins: Math.max(0, (prev.playerStats?.coins || 0) - cost),
        },
      };
    });
  }, []);

  const handleUseWell = useCallback(() => {
    setGameState((prev) => {
      const charges = prev.structures?.well?.charges || 0;
      if (!prev.structures?.well?.built || charges <= 0) return prev;
      return {
        ...prev,
        plots: (prev.plots || []).map((p) => (p.tilled ? { ...p, waterLevel: 3 } : p)),
        structures: {
          ...prev.structures,
          well: { ...prev.structures.well, charges: charges - 1 },
        },
      };
    });
  }, []);

  const handleUseCompost = useCallback(() => {
    setGameState((prev) => {
      const charges = prev.structures?.compost?.charges || 0;
      if (!prev.structures?.compost?.built || charges <= 0) return prev;
      return {
        ...prev,
        plots: (prev.plots || []).map((p) => (p.tilled ? { ...p, fertilized: true } : p)),
        structures: {
          ...prev.structures,
          compost: { ...prev.structures.compost, charges: charges - 1 },
        },
      };
    });
  }, []);

  const handleCollectEggs = useCallback(() => {
    setGameState((prev) => {
      if (!prev.structures?.chickenCoop?.eggReady) return prev;
      return {
        ...prev,
        inventory: { ...prev.inventory, egg: (prev.inventory?.egg || 0) + 1 },
        playerStats: { ...prev.playerStats, coins: (prev.playerStats?.coins || 0) + 8 },
        structures: {
          ...prev.structures,
          chickenCoop: { ...prev.structures.chickenCoop, eggReady: false },
        },
      };
    });
  }, []);

  const handleCollectMilk = useCallback(() => {
    setGameState((prev) => {
      if (!prev.structures?.stable?.milkReady) return prev;
      return {
        ...prev,
        inventory: { ...prev.inventory, milk: (prev.inventory?.milk || 0) + 1 },
        playerStats: { ...prev.playerStats, coins: (prev.playerStats?.coins || 0) + 12 },
        structures: {
          ...prev.structures,
          stable: { ...prev.structures.stable, milkReady: false },
        },
      };
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  // Electron first-run setup wizard — shown before auth when no config exists
  if (window.__ELECTRON_SETUP__) {
    return <SetupWizard />;
  }

  // Public standalone pages — rendered without login regardless of auth state
  if (window.location.pathname.startsWith('/gradendex')) {
    document.title = 'AllOne Garden - Gradendex';
    return <GradendexPage />;
  }

  if (window.location.pathname.startsWith('/content-wiki')) {
    document.title = 'AllOne Garden - Content Wiki';
    return (
      <div className="public-tool-page">
        <div className="public-tool-page__topbar">
          <button
            type="button"
            className="public-tool-page__back-btn"
            onClick={() => { window.location.href = '/home'; }}
          >
            ← Back to Home
          </button>
        </div>
        <ContentWikiPage />
      </div>
    );
  }

  if (window.location.pathname.startsWith('/plugins')) {
    document.title = 'AllOne Garden - Plugins';
    return (
      <div className="public-tool-page">
        <div className="public-tool-page__topbar">
          <button
            type="button"
            className="public-tool-page__back-btn"
            onClick={() => { window.location.href = '/home'; }}
          >
            ← Back to Home
          </button>
        </div>
        <PluginMarketplace
          user={authUser}
          embedded
          onClose={() => { window.location.href = '/home'; }}
        />
      </div>
    );
  }

  if (window.location.pathname.startsWith('/admin')) {
    document.title = 'AllOne Garden - Admin';
    return (
      <div className="public-tool-page">
        <div className="public-tool-page__topbar">
          <button
            type="button"
            className="public-tool-page__back-btn"
            onClick={() => { window.location.href = '/home'; }}
          >
            ← Back to Home
          </button>
        </div>
        <AdminPanel embedded onClose={() => { window.location.href = '/home'; }} />
      </div>
    );
  }

  if (window.location.pathname.startsWith('/home')) {
    document.title = 'AllOne Garden - Home';
    return <HomePage />;
  }

  // Root redirects to the landing page; /login (or any authenticated path) stays
  if (window.location.pathname === '/' || window.location.pathname === '') {
    window.location.replace('/home');
    return null;
  }

  if (!authChecked) return null;
  if (!authUser) {
    document.title = 'AllOne Garden - Login';
    return <AuthScreen onLogin={handleLogin} />;
  }
  document.title = 'AllOne Garden';
  const isGuestMode = authUser.id === 0;

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
        onOpenAccount={() => setShowAccount(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenProfile={() => setShowProfile(true)}
        onOpenSocialMenu={() => setShowSocialMenu((prev) => !prev)}
        socialBadge={socialUnread}
        onNextDay={handleNextDay}
      />

      {showXpDetails && (
        <div className="xp-floating-panel" role="dialog" aria-label="XP details">
          <div className="xp-floating-panel__header">
            <strong>✨ XP details</strong>
            <button type="button" className="btn btn-secondary xp-floating-panel__close" onClick={() => setShowXpDetails(false)}>✕</button>
          </div>
          {(() => {
            const xp = Number(gameState.playerStats?.xp || 0);
            const level = Number(gameState.playerStats?.level || 1);
            const floor = Math.max(0, (level - 1) * (level - 1) * 100);
            const next = Math.max((level * level) * 100, floor + 100);
            const progress = Math.max(0, xp - floor);
            const needed = Math.max(0, next - xp);
            const range = Math.max(1, next - floor);
            const pct = Math.max(0, Math.min(100, Math.round((progress / range) * 100)));
            return (
              <>
                <div className="xp-floating-panel__stats">
                  <div><span>⭐ Level</span><strong>{level}</strong></div>
                  <div><span>✨ XP totaal</span><strong>{xp}</strong></div>
                  <div><span>🪙 Coins</span><strong>{gameState.playerStats?.coins || 0}</strong></div>
                  <div><span>🌱 Plants grown</span><strong>{gameState.playerStats?.plantsGrown || 0}</strong></div>
                </div>
                <div className="xp-floating-panel__progress">
                  <div className="xp-floating-panel__bar">
                    <div className="xp-floating-panel__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <small>{progress} / {range} XP this level · {needed} XP tot next level</small>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <div className="game-container game-container--world">
        <div data-tour="garden">
          <div className="world-playfield-wrap">
            <div className="mobile-world-mini-hud" aria-label="World quick info">
              <div className="mobile-world-mini-hud__line">📅 Day {gameState.currentDay || 1}</div>
              <div className="mobile-world-mini-hud__line">🍂 {gameState.currentSeason || 'spring'}</div>
              <div className="mobile-world-mini-hud__line">{WEATHER_ICONS[gameState.weather] || '🌤️'} {gameState.weather || 'sunny'}</div>
              <div className="mobile-world-mini-hud__line">✨ XP {gameState.playerStats?.xp || 0}</div>
              <div className="mobile-world-mini-hud__line">📍 {worldHud.coords || '-,-'}</div>
              {!isGuestMode && <div className="mobile-world-mini-hud__line">👥 {worldHud.onlineCount || 0} online</div>}
            </div>
            <WorldMap
              embedded
              socket={socket}
              currentUserId={authUser.id}
              currentUsername={authUser.username}
              gameState={gameState}
              onUpdateGame={setGameState}
              onStartCall={(state) => setCallState(state)}
              onOpenMarketplace={() => setShowTrade(true)}
              onWorldHudChange={setWorldHud}
            />
            {showSocialMenu && (
              <div className="world-social-dropdown" data-tour="chat">
                <div className="world-social-dropdown__header">
                  <strong>{t('header_menu_social', { defaultValue: 'Chat & Online Players' })}</strong>
                  <button
                    type="button"
                    className="modal-close world-social-dropdown__close"
                    onClick={() => setShowSocialMenu(false)}
                    aria-label={t('worldMap.close_panel')}
                    title={t('worldMap.close_panel')}
                  >
                    ✕
                  </button>
                </div>
                <ChatPanel socket={socket} username={authUser.username} />
                <PlayersPanel socket={socket} currentUserId={authUser.id} />
              </div>
            )}
            {showInventoryMenu && (
              <div data-tour="inventory" className="world-floating-inventory">
                <Inventory
                  inventory={gameState.inventory}
                  onSell={handleSell}
                  onOpenTrade={() => setShowTrade(true)}
                  onClose={() => setShowInventoryMenu(false)}
                />
              </div>
            )}
            {showStructures && (
              <div className="modal-overlay" data-tour="structures">
                <div className="modal world-structures-modal">
                  <div className="modal-header">
                    <h2>🏗️ Structures</h2>
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => setShowStructures(false)}
                      aria-label="Structures sluiten"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="world-structures-modal__body">
                    <StructuresPanel
                      hideTitle
                      structures={gameState.structures}
                      coins={gameState.playerStats.coins}
                      onBuild={handleBuildStructure}
                      onUseWell={handleUseWell}
                      onUseCompost={handleUseCompost}
                      onCollectEggs={handleCollectEggs}
                      onCollectMilk={handleCollectMilk}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>{/* /data-tour="garden" */}
      </div>

      {/* Modals */}
      {showTrade && (
        <TradeModal
          inventory={gameState.inventory}
          coins={gameState.playerStats.coins}
          userId={authUser.id}
          socket={socket}
          onBuy={handleTradeBuy}
          onSellDeduct={handleTradeSellDeduct}
          onGuestSale={handleGuestSale}
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

      {showProfile && (
        <div className="modal-overlay">
          <div className="modal profile-modal">
            <div className="modal-header">
              <h2>👤 {authUser.username || 'Guest'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowProfile(false)} aria-label="Close profile">
                ✕
              </button>
            </div>
            <div className="profile-modal__body">
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowAchievements(true); }}
              >
                🏆 Badges
              </button>
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowLeaderboard(true); }}
              >
                📊 Leaderboard
              </button>
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowAccount(true); }}
              >
                ⚙️ Account instellingen
              </button>
            </div>
          </div>
        </div>
      )}

      {showGradendex && (
        <GradendexPanel
          token={authToken}
          onClose={() => setShowGradendex(false)}
        />
      )}

      {showContentWiki && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1300,
          overflowY: 'auto', background: '#f1f8e9',
        }}>
          <button
            onClick={() => setShowContentWiki(false)}
            style={{
              position: 'fixed', top: '0.75rem', right: '1rem', zIndex: 1301,
              padding: '0.35rem 0.85rem', border: 'none', borderRadius: '6px',
              background: 'rgba(0,0,0,0.35)', color: '#fff',
              cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem',
            }}
            title="Close Content Wiki"
          >
            ✕
          </button>
          <ContentWikiPage />
        </div>
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

      {gardenConflict && (
        <GardenConflictModal
          onUseServer={handleConflictUseServer}
          onForceLocal={handleConflictForceLocal}
          onDismiss={() => setGardenConflict(null)}
        />
      )}

      {/* ── Auto-update banner (Electron only) ── */}
      {updateReady && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: '#2e7d32', color: 'white', borderRadius: '10px',
          padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999, fontSize: '0.9rem',
        }}>
          <span>🌱 Update downloaded — restart to apply</span>
          <button
            onClick={() => window.electronAPI?.installUpdate()}
            style={{
              background: 'white', color: '#2e7d32', border: 'none', borderRadius: '6px',
              padding: '0.35rem 0.9rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Restart now
          </button>
          <button
            onClick={() => setUpdateReady(false)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Persistent 📖 Gardendex hub button ── */}
      <button
        onClick={() => setShowGradendexQuick((prev) => !prev)}
        title="Open Gardendex menu"
        aria-label="Open Gardendex options"
        className="world-fab world-fab--gradendex"
      >
        📖
      </button>

      {showGradendexQuick && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 12.9rem)',
          right: 'max(1rem, env(safe-area-inset-right))',
          zIndex: 1401,
          width: '220px',
          background: 'rgba(15, 43, 22, 0.92)',
          border: '1px solid rgba(165, 214, 167, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
          padding: '0.5rem',
          display: 'grid',
          gap: '0.4rem',
        }}>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setShowGradendexQuick(false); setShowGradendex(true); }}>
            🔍 Zoeken
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setShowGradendexQuick(false); setShowContentWiki(true); }}>
            📚 Wiki
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setShowGradendexQuick(false); setShowRecognition(true); }}>
            🌿 Plant recognition
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setShowGradendexQuick(false); setShowQR(true); }}>
            📷 Garden QR
          </button>
        </div>
      )}

      <button
        onClick={() => setShowInventoryMenu((prev) => !prev)}
        title="Open inventory"
        aria-label="Open inventory"
        className="world-fab world-fab--inventory"
      >
        🎒
      </button>

      <button
        type="button"
        onClick={() => setShowStructures((open) => !open)}
        title={showStructures ? 'Structures sluiten' : 'Structures openen'}
        aria-label={showStructures ? 'Structures sluiten' : 'Structures openen'}
        aria-expanded={showStructures}
        className="world-fab world-fab--structures"
      >
        🏗️
      </button>

      {/* ── Persistent ❓ Help button ── */}
      <button
        onClick={() => setShowHelp(true)}
        title="Help & Reference"
        aria-label="Open help panel"
        className="world-fab world-fab--help"
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

      {/* ── QR Panel ── */}
      {showQR && (
        <QRPanel
          onClose={() => setShowQR(false)}
          onPlantFromQR={handlePlantFromQR}
        />
      )}

      {/* ── Plant Recognition Modal ── */}
      {showRecognition && (
        <PlantRecognitionModal
          onClose={() => setShowRecognition(false)}
          onPlantIdentified={(slug) => {
            handlePlantFromQR(slug);
            unlock('PLANT_ID');
            setShowRecognition(false);
          }}
        />
      )}

      {/* ── First-time tour (or manual replay) ── */}
      {showTour && (
        <TourOverlay onFinish={handleTourFinish} />
      )}
    </div>
  );
}

// Wrap App in GameContentProvider so all components have access to dynamic game content
function AppWithProviders() {
  return (
    <GameContentProvider>
      <App />
    </GameContentProvider>
  );
}

export default AppWithProviders;
