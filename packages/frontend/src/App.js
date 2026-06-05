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
import TradeModal from './components/TradeModal';
import PluginMarketplace from './components/PluginMarketplace';
import AchievementsPanel from './components/AchievementsPanel';
import AdminPanel from './components/AdminPanel';
import AccountSettings from './components/AccountSettings';
import Leaderboard from './components/Leaderboard';
import WorldMap from './components/WorldMap';
import NotificationsPanel, { fetchNotificationBadgeCount } from './components/NotificationsPanel';
import VideoCall from './components/VideoCall';
import GroupCallManager from './components/GroupCallManager';
import TourOverlay from './components/TourOverlay';
import HelpPanel from './components/HelpPanel';
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
  inventory: { tomato: 0, carrot: 0, lettuce: 0, radish: 0, corn: 0, potato: 0, pumpkin: 0, sunflower: 0, blueberry: 0, egg: 0, milk: 0, fertilizer: 0, spray: 0 },
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
  const debounced = useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
  debounced.cancel = () => clearTimeout(timer.current);
  return debounced;
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

  const [toasts,           setToasts]           = useState([]);
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
  const [showContentWiki,  setShowContentWiki]  = useState(false);
  const [showSocialMenu,   setShowSocialMenu]   = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsBadge, setNotificationsBadge] = useState(0);
  const [showXpDetails,    setShowXpDetails]    = useState(false);
  const [worldHud,         setWorldHud]         = useState({ coords: null, onlineCount: 0 });
  const [socialUnread,     setSocialUnread]     = useState(0);
  const refreshNotificationsBadge = useCallback(async () => {
    if (!authUser?.id || authUser.id === 0) {
      setNotificationsBadge(0);
      return;
    }
    const n = await fetchNotificationBadgeCount({
      userId: authUser.id,
      isAdmin: !!authUser.isAdmin,
      hasServerAuth,
    });
    setNotificationsBadge(n);
  }, [authUser?.id, authUser?.isAdmin, hasServerAuth]);
  const [callState,        setCallState]        = useState(null);   // { mode, peerId, peerUsername, offer? }
  const [groupCallState,   setGroupCallState]   = useState(null);   // group call state
  const [dmTarget,         setDmTarget]         = useState(null);   // { id, username } — pre-select DM conversation

  // ── Tour & Help ───────────────────────────────────────────────────────────────
  // Show the tour automatically on first-ever login; persisted in localStorage
  const [showTour, setShowTour] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showQR,          setShowQR]          = useState(false);
  const [showRecognition, setShowRecognition] = useState(false);
  const [showWorldOverview, setShowWorldOverview] = useState(false);
  const [hideMovementControls, setHideMovementControls] = useState(
    () => localStorage.getItem('garden_hide_dpad') === 'true'
  );

  const [gameState, setGameState] = useState(INITIAL_GAME);
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // ── Level-up celebration ──────────────────────────────────────────────────────
  const [levelUpOverlay, setLevelUpOverlay] = useState(null);
  const prevLevelRef = useRef(null);
  useEffect(() => {
    const level = gameState.playerStats?.level;
    if (prevLevelRef.current !== null && level > prevLevelRef.current) {
      setLevelUpOverlay(level);
      setTimeout(() => setLevelUpOverlay(null), 2600);
    }
    prevLevelRef.current = level;
  }, [gameState.playerStats?.level]);

  const [gardenConflict, setGardenConflict] = useState(null);

  // ── Child-friendly: break reminder ───────────────────────────────────────────
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const sessionStartRef = useRef(Date.now());

  // ── Child-friendly: community daily goal ─────────────────────────────────────
  const [communityGoal, setCommunityGoal] = useState(null);
  const [communityProgress, setCommunityProgress] = useState(0);

  // ── Break reminder after 45 minutes ─────────────────────────────────────────
  useEffect(() => {
    if (!authUser || authUser.id === 0) return;
    const interval = setInterval(() => {
      const minutesPlayed = (Date.now() - sessionStartRef.current) / 60000;
      if (minutesPlayed >= 45 && !showBreakReminder) {
        setShowBreakReminder(true);
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, [authUser, showBreakReminder]); // eslint-disable-line

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

  const [, setLoginStreak] = useState(() => parseInt(localStorage.getItem('garden_streak') || '0', 10));

  // ── Notification helper ───────────────────────────────────────────────────────
  const showNotification = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    refreshNotificationsBadge();
    const interval = setInterval(refreshNotificationsBadge, 45_000);
    return () => clearInterval(interval);
  }, [authUser, refreshNotificationsBadge]);

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
          inventory:  data.inventory ? { ...prev.inventory, ...data.inventory } : prev.inventory,
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
      inventory:  state.inventory,
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
          const server = err.detail.garden;
          if (
            Number(server.currentDay) === Number(snap.currentDay)
            && Number(server.currentDay) > 1
          ) {
            if (err.detail.serverUpdatedAt) {
              localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, err.detail.serverUpdatedAt);
            }
            setGameState((prev) => ({
              ...prev,
              plots: server.plots?.length ? server.plots : prev.plots,
              currentDay: server.currentDay ?? prev.currentDay,
              weather: server.weather ?? prev.weather,
            }));
            return;
          }
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

  // ── Community daily goal — local fallback based on current day ────────────────
  useEffect(() => {
    if (!socket || !gameState.currentDay) return;
    if (communityGoal) return; // already set (via server or previous effect run)
    const goals = [
      { text: 'Water samen 20 gewassen vandaag! 💧', target: 20, type: 'water', icon: '💧' },
      { text: 'Oogst samen 15 gewassen vandaag! 🧺', target: 15, type: 'harvest', icon: '🧺' },
      { text: 'Plant samen 10 nieuwe gewassen vandaag! 🌱', target: 10, type: 'plant', icon: '🌱' },
    ];
    const dayIndex = (gameState.currentDay || 1) % goals.length;
    setCommunityGoal({ ...goals[dayIndex], progress: 0 });
  }, [gameState.currentDay, socket]); // eslint-disable-line

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;

    const newSocket = io(BACKEND_URL, {
      transports:           ['websocket', 'polling'],  // fallback to polling if websocket fails
      reconnectionAttempts: 15,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      timeout:              20000,
      withCredentials:      AUTH_HTTPONLY,
      auth:                 { token: authToken || undefined },
    });

    newSocket.on('connect', () => {
      setSocket(newSocket);
      setBackendUp(true);
      setServerInfo({ name: process.env.REACT_APP_SERVER_NAME || 'Local Server', players: 1 });
    });

    newSocket.on('server:info', (info) => setServerInfo(info));
    newSocket.on('connect_error', () => newSocket.disconnect());

    newSocket.on('reconnect', () => {
      setBackendUp(true);
      // Re-fetch garden to sync after reconnect
      if (hasServerAuth) {
        api.get('/api/garden').then((data) => {
          setGameState((prev) => ({
            ...prev,
            plots: data.plots?.length ? data.plots : prev.plots,
            currentDay: data.currentDay || prev.currentDay,
            weather: data.weather || prev.weather,
          }));
        }).catch(() => {});
      }
    });
    newSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        newSocket.connect(); // server disconnected us, try reconnecting
      }
    });

    return () => newSocket.disconnect();
  }, [authUser, authToken, hasServerAuth]);

  // ── Socket event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onVisitor = ({ username }) =>
      showNotification(`🌱 ${username} is visiting your garden!`);

    const onHelped = ({ username, amount }) => {
      showNotification(`🤝 ${username} heeft jou geholpen! +${amount} XP`, 'success');
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

    // ── Community goal (server-side + action tracking) ─────────────────────
    const onCommunityGoal     = (goal) => setCommunityGoal(goal);
    const onCommunityProgress = ({ progress }) => setCommunityProgress(progress);
    const onGameAction = (action) => {
      setCommunityGoal((goal) => {
        if (goal && ['harvest', 'water', 'plant'].includes(action.type) && action.type === goal.type) {
          setCommunityProgress((p) => p + 1);
        }
        return goal;
      });
    };
    socket.on('community:goal',     onCommunityGoal);
    socket.on('community:progress', onCommunityProgress);
    socket.on('game:action',        onGameAction);

    // ── Plugin: daily-bonus ────────────────────────────────────────────────
    const onDailyBonus = (data) => {
      setBonusToast(data);
      setTimeout(() => setBonusToast(null), 5000);
      if (data.streak) {
        setLoginStreak(data.streak);
        localStorage.setItem('garden_streak', String(data.streak));
      }
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
    const onCallOffer = ({ from, fromUsername, offer, audioOnly }) => {
      // Only show if not already in a call
      setCallState((prev) => prev ? prev : {
        mode:         'incoming',
        peerId:       from,
        peerUsername: fromUsername,
        offer,
        audioOnly:    audioOnly || false,
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
      refreshNotificationsBadge();
    };

    socket.on('proposal:status_changed', onProposalStatus);

    const onPlayerProposalEvent = () => {
      refreshNotificationsBadge();
    };
    socket.on('player-proposal:received', onPlayerProposalEvent);
    socket.on('player-proposal:updated', onPlayerProposalEvent);

    return () => {
      socket.off('garden:visitor',  onVisitor);
      socket.off('player:helped',   onHelped);
      socket.off('chat:message',    onFederatedChat);
      socket.off('plugin:daily-bonus:awarded', onDailyBonus);
      socket.off('plugin:server-motd:data',    onMotd);
      socket.off('call:offer',      onCallOffer);
      socket.off('proposal:status_changed', onProposalStatus);
      socket.off('player-proposal:received', onPlayerProposalEvent);
      socket.off('player-proposal:updated', onPlayerProposalEvent);
      socket.off('community:goal',     onCommunityGoal);
      socket.off('community:progress', onCommunityProgress);
      socket.off('game:action',        onGameAction);
    };
  }, [socket, showNotification, hasServerAuth, refreshNotificationsBadge]);

  useEffect(() => {
    if (!socket) return;
    const onDmToast = (msg) => {
      if (showSocialMenu) return;
      if (!msg.from && msg.from !== 0) return;
      const preview = msg.text?.slice(0, 60) + (msg.text?.length > 60 ? '…' : '');
      showNotification(`✉️ ${msg.fromUsername}: ${preview}`);
    };
    socket.on('dm:receive', onDmToast);
    return () => socket.off('dm:receive', onDmToast);
  }, [socket, showSocialMenu, showNotification]);

  // ── Click-outside: close social menu ─────────────────────────
  useEffect(() => {
    if (!showSocialMenu) return;
    const onPointerDown = (e) => {
      const isInsideSocial = e.target.closest('.world-social-dropdown') || e.target.closest('[data-social-toggle]');
      if (!isInsideSocial) setShowSocialMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showSocialMenu]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleLogin = (user, token) => {
    setAuthUser(user);
    setAuthToken(token);
    if (user.id !== 0) setBackendUp(true);
    const savedLang = localStorage.getItem('garden_lang');
    if (savedLang) i18n.changeLanguage(savedLang);
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

  const handleStartDm = useCallback((player) => {
    setShowWorldOverview(false);
    setShowSocialMenu(true);
    setDmTarget(player);
  }, []);

  const toggleSocialMenu = useCallback(() => {
    setShowSocialMenu((prev) => {
      const next = !prev;
      if (next) {
        setShowWorldOverview(false);
        setShowNotifications(false);
        setShowProfile(false);
        setShowGradendex(false);
      }
      return next;
    });
  }, []);

  const toggleWorldMap = useCallback(() => {
    setShowWorldOverview((prev) => {
      const next = !prev;
      if (next) {
        setShowSocialMenu(false);
        setShowNotifications(false);
        setShowProfile(false);
        setShowGradendex(false);
      }
      return next;
    });
  }, []);

  const toggleNotifications = useCallback(() => {
    if (!authUser?.id || authUser.id === 0) return;
    setShowNotifications((prev) => {
      const next = !prev;
      if (next) {
        setShowSocialMenu(false);
        setShowWorldOverview(false);
        setShowProfile(false);
        setShowGradendex(false);
        refreshNotificationsBadge();
      }
      return next;
    });
  }, [authUser?.id, refreshNotificationsBadge]);

  const handleLanguageChange = useCallback((lang) => {
    localStorage.setItem('garden_lang', lang);
    i18n.changeLanguage(lang);
  }, [i18n]);

  const handleHideMovementToggle = useCallback((hide) => {
    setHideMovementControls(hide);
    localStorage.setItem('garden_hide_dpad', String(hide));
  }, []);

  const handleTourFinish = (dontShowAgain = true) => {
    if (dontShowAgain) {
      localStorage.setItem('garden_tour_done', 'true');
    }
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
    setSocialUnread(0);
  };

  // ── Auto-logout na 15 min inactiviteit ───────────────────────────────────
  const handleLogoutRef = useRef(handleLogout);
  handleLogoutRef.current = handleLogout;
  useEffect(() => {
    if (!authUser || authUser.id === 0) return undefined;
    const idleMs = 15 * 60 * 1000;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        showNotification(t('session_idle_logout', { defaultValue: 'Je bent uitgelogd wegens inactiviteit.' }));
        handleLogoutRef.current();
      }, idleMs);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [authUser, showNotification, t]);

  const handleNextDay = useCallback(() => {
    debouncedSave.cancel();
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
        if (data.serverUpdatedAt) {
          localStorage.setItem(GARDEN_SERVER_UPDATED_KEY, data.serverUpdatedAt);
        }
        setGameState((prev) => ({
          ...prev,
          currentDay: data.currentDay || ((prev.currentDay || 1) + 1),
          weather: data.weather || prev.weather,
          plots: data.plots?.length ? data.plots : prev.plots,
        }));
        setGardenConflict(null);
        showNotification(t('header_next_day'));
      })
      .catch(() => {
        showNotification('Kon de volgende dag niet starten.');
      });
  }, [hasServerAuth, showNotification, debouncedSave, t]);

  // Sell a crop from inventory — silo gives +20% bonus
  const handleSell = useCallback(async (cropId, qty, priceEach) => {
    const siloBonus = gameStateRef.current?.structures?.silo?.built ? 1.2 : 1;
    if (hasServerAuth) {
      try {
        const result = await api.post('/api/trade/quick-sell', {
          cropId,
          quantity: qty,
          pricePerUnit: priceEach,
          siloBonus,
        });
        setGameState((prev) => ({
          ...prev,
          inventory: result.inventory || {
            ...prev.inventory,
            [cropId]: Math.max(0, (prev.inventory[cropId] || 0) - qty),
          },
          playerStats: {
            ...prev.playerStats,
            coins: result.coins ?? ((prev.playerStats.coins || 0) + (result.earned || 0)),
          },
        }));
        const bonusNote = siloBonus > 1 ? ' (+silo)' : '';
        showNotification(`Sold ${qty}× ${cropId} for 🪙${result.earned}${bonusNote}`);
        unlock('FIRST_SALE');
        triggerHaptic('MEDIUM');
      } catch (err) {
        showNotification(err?.message || 'Verkopen mislukt');
      }
      return;
    }

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
  }, [hasServerAuth, showNotification, unlock, triggerHaptic]);

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

  const syncInventoryToServer = useCallback(async () => {
    if (!hasServerAuth || !backendUp) return;
    const snap = gameStateRef.current;
    await api.post('/api/garden', {
      plots: snap.plots,
      currentDay: snap.currentDay,
      weather: snap.weather,
      inventory: snap.inventory,
    });
  }, [hasServerAuth, backendUp]);

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

  const handleBuildStructure = useCallback((id, ringSlot) => {
    setGameState((prev) => {
      const defCosts = { well: 50, compost: 30, greenhouse: 80, barn: 120, chickenCoop: 60, stable: 100, silo: 90 };
      const requires = { chickenCoop: 'barn', stable: 'barn' };
      const cost = defCosts[id] || 0;
      if ((prev.structures?.[id]?.built) || (prev.playerStats?.coins || 0) < cost) return prev;
      const req = requires[id];
      if (req && !prev.structures?.[req]?.built) return prev;
      if (!Number.isInteger(ringSlot) || ringSlot < 0) return prev;
      return {
        ...prev,
        structures: {
          ...prev.structures,
          [id]: { ...(prev.structures?.[id] || {}), built: true, ringSlot },
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
    return <AuthScreen onLogin={handleLogin} allowGuest={!BACKEND_URL} />;
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
        serverInfo={serverInfo}
        username={authUser.username}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onLogout={handleLogout}
        onOpenAccount={() => setShowAccount(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenProfile={() => {
          setShowSocialMenu(false);
          setShowWorldOverview(false);
          setShowGradendex(false);
          setShowProfile(true);
        }}
        onOpenSocialMenu={toggleSocialMenu}
        onOpenNotifications={!isGuestMode ? toggleNotifications : undefined}
        notificationsBadge={notificationsBadge}
        notificationsOpen={showNotifications}
        onOpenWorldMap={toggleWorldMap}
        worldMapOpen={showWorldOverview}
        onOpenHelp={() => {
          setShowProfile(false);
          setShowHelp(true);
        }}
        onOpenGradendex={() => {
          setShowSocialMenu(false);
          setShowWorldOverview(false);
          setShowProfile(false);
          setShowGradendex(true);
        }}
        isAdmin={!!authUser.isAdmin}
        onOpenAdmin={authUser.isAdmin ? () => { window.location.href = '/admin'; } : undefined}
        socialBadge={socialUnread}
        onNextDay={handleNextDay}
        worldSummary={{
          currentDay: gameState.currentDay,
          season: gameState.currentSeason,
          weather: gameState.weather,
          xp: gameState.playerStats?.xp,
          coords: worldHud.coords,
          onlineCount: worldHud.onlineCount,
          isGuest: isGuestMode,
        }}
        communityGoal={communityGoal}
        communityProgress={communityProgress}
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
            <WorldMap
              embedded
              socket={socket}
              currentUserId={authUser.id}
              currentUsername={authUser.username}
              gameState={gameState}
              onUpdateGame={setGameState}
              onStartCall={(state) => setCallState(state)}
              onOpenDm={handleStartDm}
              onOpenMarketplace={() => setShowTrade(true)}
              onWorldHudChange={setWorldHud}
              hideDpad={hideMovementControls}
              suppressSidePanels={
                showSocialMenu || showNotifications || showWorldOverview || showProfile || showGradendex
                || showHelp || showAccount
              }
              showOverviewMap={showWorldOverview}
              onShowOverviewMapChange={setShowWorldOverview}
              onSell={handleSell}
              onBuildStructure={handleBuildStructure}
              onUseWell={handleUseWell}
              onUseCompost={handleUseCompost}
              onCollectEggs={handleCollectEggs}
              onCollectMilk={handleCollectMilk}
            />
            {showNotifications && (
              <div className="notifications-dropdown" data-tour="notifications-panel">
                <div className="notifications-dropdown__header">
                  <strong>{t('notifications.title', { defaultValue: 'Meldingen' })}</strong>
                  <button
                    type="button"
                    className="modal-close notifications-dropdown__close"
                    onClick={() => setShowNotifications(false)}
                    aria-label={t('worldMap.close_panel')}
                    title={t('worldMap.close_panel')}
                  >
                    ✕
                  </button>
                </div>
                <NotificationsPanel
                  currentUserId={authUser.id}
                  isAdmin={!!authUser.isAdmin}
                  hasServerAuth={hasServerAuth}
                  onCountChange={setNotificationsBadge}
                  onNotice={showNotification}
                  onOpenContentWiki={() => {
                    setShowNotifications(false);
                    setShowContentWiki(true);
                  }}
                  onEconomyUpdate={({ inventory, coins }) => {
                    setGameState((prev) => ({
                      ...prev,
                      inventory: inventory ? { ...prev.inventory, ...inventory } : prev.inventory,
                      playerStats: coins !== undefined
                        ? { ...prev.playerStats, coins }
                        : prev.playerStats,
                    }));
                  }}
                />
              </div>
            )}
            <div
              className={`world-social-dropdown${showSocialMenu ? '' : ' world-social-dropdown--hidden'}`}
              data-tour="chat"
              aria-hidden={!showSocialMenu}
            >
              {showSocialMenu && (
                <div className="world-social-dropdown__header">
                  <strong>{t('header_menu_social', { defaultValue: 'Chat' })}</strong>
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
              )}
              <ChatPanel
                socket={socket}
                username={authUser.username}
                currentUserId={authUser.id}
                dmTarget={dmTarget}
                onDmTargetClear={() => setDmTarget(null)}
                onStartCall={(state) => setCallState(state)}
                dmOnly
                isOpen={showSocialMenu}
                onUnreadChange={setSocialUnread}
              />
            </div>
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
          onSyncInventory={syncInventoryToServer}
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
              <label className="profile-modal__lang" htmlFor="profile-lang-select">
                <span>{t('language')}</span>
                <select
                  id="profile-lang-select"
                  className="lang-selector"
                  value={i18n.language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                >
                  <option value="nl">NL 🇳🇱</option>
                  <option value="en">EN 🇬🇧</option>
                  <option value="de">DE 🇩🇪</option>
                  <option value="fr">FR 🇫🇷</option>
                  <option value="es">ES 🇪🇸</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowAchievements(true); }}
              >
                🏆 {t('header_menu_badges', { defaultValue: 'Badges' })}
              </button>
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowLeaderboard(true); }}
              >
                📊 {t('header_leaderboard_title', { defaultValue: 'Leaderboard' })}
              </button>
              <button
                type="button"
                className="btn btn-secondary profile-modal__action"
                onClick={() => { setShowProfile(false); setShowAccount(true); }}
              >
                ⚙️ {t('account_settings', { defaultValue: 'Account settings' })}
              </button>
              {authUser.isAdmin && (
                <button
                  type="button"
                  className="btn btn-secondary profile-modal__action"
                  onClick={() => { setShowProfile(false); window.location.href = '/admin'; }}
                >
                  🛠️ {t('header_menu_admin', { defaultValue: 'Admin' })}
                </button>
              )}
              <label className="profile-modal__toggle">
                <input
                  type="checkbox"
                  checked={hideMovementControls}
                  onChange={(e) => handleHideMovementToggle(e.target.checked)}
                />
                <span>{t('profile_hide_movement', { defaultValue: 'Hide movement buttons' })}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {showGradendex && (
        <GradendexPanel
          token={authToken}
          onClose={() => setShowGradendex(false)}
          onPlantIdentified={(slug) => {
            setGameState((prev) => ({ ...prev, selectedSeed: slug, selectedTool: 'plant' }));
            showNotification(t('gardendex_hub.plant_selected', { plant: slug, defaultValue: `Selected ${slug} to plant` }));
          }}
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

      {/* Group call overlay */}
      {groupCallState && socket && (
        <GroupCallManager
          socket={socket}
          currentUserId={authUser.id}
          currentUsername={authUser.username}
          {...groupCallState}
          onLeave={() => setGroupCallState(null)}
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

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`notification toast-item toast-item--${toast.type}`}>
            {toast.msg}
          </div>
        ))}
      </div>

      {levelUpOverlay && (
        <div className="level-up-overlay">
          <div className="level-up-card">
            <div className="level-up-card__emoji">🎉</div>
            <div className="level-up-card__title">LEVEL {levelUpOverlay}!</div>
            <div className="level-up-card__sub">Je tuin groeit — goed bezig! 🌱</div>
          </div>
        </div>
      )}

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

      {/* ── Session break reminder (45 min) ── */}
      {showBreakReminder && (
        <div className="break-reminder-overlay">
          <div className="break-reminder-card">
            <div style={{ fontSize: '3rem' }}>🌳</div>
            <h2>Even een pauze?</h2>
            <p>Je speelt al 45 minuten. Ga even buiten kijken naar echte planten — je tuin wacht op je! 🌱</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => { setShowBreakReminder(false); sessionStartRef.current = Date.now(); }}>
                🎮 Nog even doorgaan
              </button>
              <button className="btn btn-secondary" onClick={handleLogout}>
                🚪 Uitloggen
              </button>
            </div>
          </div>
        </div>
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
