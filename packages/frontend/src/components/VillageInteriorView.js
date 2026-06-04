import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../hooks/useApi';
import {
  exhibitAt,
  isInteriorPassable,
  localizedInteriorField,
  screenFilmAt,
  tileAtInterior,
  INTERIOR_TILE,
} from '../data/villageInteriors';
import { safeYoutubeId } from '../utils/youtubeId';

const TILE = 48;
const VIEW_W = 10;
const VIEW_H = 8;

function YouTubeCinema({ videoId, title, onClose }) {
  const safeId = safeYoutubeId(videoId);

  useEffect(() => {
    if (!safeId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose, safeId]);

  if (!safeId) return null;

  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(safeId)}?rel=0&modestbranding=1&autoplay=1`;

  return (
    <div className="village-cinema-overlay" role="presentation" onClick={onClose}>
      <div className="village-cinema-screen" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="village-cinema-screen__curtain" aria-hidden />
        <div className="village-cinema-screen__header">
          <span>📺 {title}</span>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="village-cinema-screen__frame">
          <iframe
            title={title || 'YouTube'}
            src={src}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}

function ShopPanel({ interior, lang, coins, onBuy, onOpenMarket, onCloseShop }) {
  const { t } = useTranslation();

  if (interior.shopKind === 'market') {
    return (
      <div className="village-interior-panel village-interior-panel--shop">
        <p>{t('worldMap.village_market_blurb', { defaultValue: 'Verkoop oogst of bekijk aanbod van andere spelers.' })}</p>
        <button type="button" className="btn btn-primary" onClick={onOpenMarket}>
          🏪 {t('worldMap.open_market', { defaultValue: 'Open marktplaats' })}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCloseShop}>
          {t('worldMap.village_close_counter', { defaultValue: 'Weg van toonbank' })}
        </button>
      </div>
    );
  }

  return (
    <div className="village-interior-panel village-interior-panel--shop">
      <p className="village-shop-coins">🪙 {coins}</p>
      <div className="village-shop-grid">
        {(interior.products || []).map((product) => (
          <button
            key={product.id}
            type="button"
            className="village-shop-item"
            disabled={coins < product.cost}
            onClick={() => onBuy(product)}
          >
            <span className="village-shop-item__emoji">{product.emoji}</span>
            <span className="village-shop-item__name">{localizedInteriorField(product.name, lang)}</span>
            <span className="village-shop-item__price">🪙{product.cost}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" onClick={onCloseShop}>
        {t('worldMap.village_close_counter', { defaultValue: 'Weg van toonbank' })}
      </button>
    </div>
  );
}

export default function VillageInteriorView({
  interior,
  onExit,
  onOpenMarket,
  gameState,
  onUpdateGame,
  onShopNotice,
  currentUserId,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'nl';
  const [pos, setPos] = useState(() => ({ ...interior.spawn }));
  const [facing, setFacing] = useState('down');
  const [activeExhibit, setActiveExhibit] = useState(null);
  const [cinemaFilm, setCinemaFilm] = useState(null);
  const [showShop, setShowShop] = useState(false);
  const [shopFlash, setShopFlash] = useState('');
  const viewportRef = useRef(null);

  const mapW = interior.width;
  const mapH = interior.height;
  const coins = gameState?.playerStats?.coins ?? 0;
  const themeClass = interior.theme ? ` village-interior--${interior.theme}` : '';
  const interiorSpawn = useMemo(
    () => ({ x: interior.spawn.x, y: interior.spawn.y }),
    [interior.spawn.x, interior.spawn.y],
  );

  const camAnchorX = Math.floor(VIEW_W / 2);
  const camAnchorY = Math.floor(VIEW_H / 2);
  const maxCamX = Math.max(0, mapW - VIEW_W);
  const maxCamY = Math.max(0, mapH - VIEW_H);
  const camX = Math.max(0, Math.min(maxCamX, pos.x - camAnchorX));
  const camY = Math.max(0, Math.min(maxCamY, pos.y - camAnchorY));

  const atCounter = useMemo(() => {
    const t0 = tileAtInterior(interior, pos.x, pos.y);
    if (t0 === INTERIOR_TILE.C) return true;
    const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    return neighbors.some(([dx, dy]) => tileAtInterior(interior, pos.x + dx, pos.y + dy) === INTERIOR_TILE.C);
  }, [interior, pos.x, pos.y]);

  const playFilmAtScreen = useCallback((screenX) => {
    const film = screenFilmAt(interior, screenX);
    if (film) setCinemaFilm(film);
  }, [interior]);

  const facingScreenX = useMemo(() => {
    if (!interior.films?.length) return null;
    const screenRow = interior.screenRow ?? 1;
    let fx = pos.x;
    let fy = pos.y;
    if (facing === 'up') fy -= 1;
    if (facing === 'down') fy += 1;
    if (facing === 'left') fx -= 1;
    if (facing === 'right') fx += 1;
    if (fy === screenRow && tileAtInterior(interior, fx, fy) === INTERIOR_TILE.S) return fx;
    return null;
  }, [interior, pos.x, pos.y, facing]);

  useEffect(() => {
    setPos({ ...interiorSpawn });
    setFacing('up');
    setCinemaFilm(null);
    setShowShop(false);
    const t0 = window.setTimeout(() => viewportRef.current?.focus(), 50);
    return () => window.clearTimeout(t0);
  }, [interior.id, interiorSpawn]);

  useEffect(() => {
    const ex = exhibitAt(interior, pos.x, pos.y);
    setActiveExhibit(ex);
  }, [interior, pos.x, pos.y]);

  useEffect(() => {
    if (atCounter && interior.shopKind) {
      setShowShop(true);
    } else if (!atCounter) {
      setShowShop(false);
    }
  }, [atCounter, interior.shopKind]);

  const move = useCallback((dx, dy, dir) => {
    setFacing(dir);
    setPos((prev) => {
      const nx = prev.x + dx;
      const ny = prev.y + dy;
      if (!isInteriorPassable(interior, nx, ny)) return prev;
      return { x: nx, y: ny };
    });
  }, [interior]);

  const handleBuy = useCallback(async (product) => {
    const name = localizedInteriorField(product.name, lang);
    const showSuccess = (msg) => {
      setShopFlash(msg);
      onShopNotice?.(msg);
      setTimeout(() => setShopFlash(''), 2500);
    };

    if (currentUserId && interior.id && interior.shopKind && interior.shopKind !== 'market') {
      try {
        const result = await api.post('/api/village/shop/buy', {
          shopId: interior.id,
          productId: product.id,
        });
        onUpdateGame?.((prev) => ({
          ...prev,
          inventory: { ...prev.inventory, ...(result.inventory || {}) },
          playerStats: {
            ...prev.playerStats,
            coins: result.coins ?? prev.playerStats?.coins,
          },
          ...(result.selectedSeed ? { selectedSeed: result.selectedSeed } : {}),
          ...(result.selectedTool ? { selectedTool: result.selectedTool } : {}),
        }));
        showSuccess(t('worldMap.village_bought', { name, defaultValue: `Gekocht: ${name}` }));
        return;
      } catch (err) {
        onShopNotice?.(err.message || t('worldMap.village_buy_failed', { defaultValue: 'Aankoop mislukt' }));
        return;
      }
    }

    let purchased = false;
    onUpdateGame?.((prev) => {
      const currentCoins = prev.playerStats?.coins ?? 0;
      if (currentCoins < product.cost) return prev;
      purchased = true;
      const stats = { ...prev.playerStats, coins: currentCoins - product.cost };
      const inventory = { ...prev.inventory };
      const extras = { ...prev };
      if (product.grant?.fertilizer) {
        inventory.fertilizer = (inventory.fertilizer || 0) + product.grant.fertilizer;
      }
      if (product.grant?.spray) {
        inventory.spray = (inventory.spray || 0) + product.grant.spray;
      }
      if (product.grant?.seed) {
        extras.selectedSeed = product.grant.seed;
        extras.selectedTool = 'plant';
      }
      return { ...extras, playerStats: stats, inventory };
    });
    if (!purchased) {
      onShopNotice?.(t('worldMap.village_not_enough_coins', { defaultValue: 'Niet genoeg munten' }));
      return;
    }
    showSuccess(t('worldMap.village_bought', { name, defaultValue: `Gekocht: ${name}` }));
  }, [onUpdateGame, lang, t, onShopNotice, currentUserId, interior.id, interior.shopKind]);

  const handleInteract = useCallback(() => {
    const here = tileAtInterior(interior, pos.x, pos.y);
    if (
      (pos.x === interior.exit.x && pos.y === interior.exit.y)
      || here === INTERIOR_TILE.D
    ) {
      onExit?.();
      return;
    }
    if (facingScreenX !== null) {
      playFilmAtScreen(facingScreenX);
      return;
    }
    if (atCounter && interior.shopKind) {
      setShowShop(true);
    }
  }, [pos, interior, atCounter, facingScreenX, playFilmAtScreen, onExit]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (cinemaFilm) {
          setCinemaFilm(null);
          return;
        }
        if (showShop) {
          setShowShop(false);
          return;
        }
        onExit?.();
        return;
      }

      if (cinemaFilm) return;

      const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D'];
      if (moveKeys.includes(e.key)) e.preventDefault();

      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': move(0, -1, 'up'); break;
        case 'ArrowDown': case 's': case 'S': move(0, 1, 'down'); break;
        case 'ArrowLeft': case 'a': case 'A': move(-1, 0, 'left'); break;
        case 'ArrowRight': case 'd': case 'D': move(1, 0, 'right'); break;
        case 'e': case 'E': case 'Enter':
          e.preventDefault();
          handleInteract();
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [move, handleInteract, onExit, cinemaFilm, showShop]);

  const tiles = [];
  for (let vy = 0; vy < VIEW_H; vy += 1) {
    for (let vx = 0; vx < VIEW_W; vx += 1) {
      const mx = camX + vx;
      const my = camY + vy;
      if (mx >= mapW || my >= mapH) continue;
      const kind = tileAtInterior(interior, mx, my);
      const ex = exhibitAt(interior, mx, my);
      const isMe = mx === pos.x && my === pos.y;
      const screenFilm = kind === INTERIOR_TILE.S ? screenFilmAt(interior, mx) : null;
      tiles.push({ vx, vy, mx, my, kind, ex, isMe, screenFilm });
    }
  }

  const title = localizedInteriorField(interior.title, lang);
  const subtitle = localizedInteriorField(interior.subtitle, lang);

  const interiorDpad = !cinemaFilm && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="village-interior-dpad walk-dpad walk-dpad--gameboy"
        role="group"
        aria-label={t('worldMap.village_controls', { defaultValue: 'Lopen en interactie' })}
      >
        <button type="button" className="walk-dpad-btn walk-dpad-btn--up" onClick={() => move(0, -1, 'up')}>↑</button>
        <button type="button" className="walk-dpad-btn walk-dpad-btn--left" onClick={() => move(-1, 0, 'left')}>←</button>
        <button type="button" className="walk-dpad-btn walk-dpad-btn--right" onClick={() => move(1, 0, 'right')}>→</button>
        <button type="button" className="walk-dpad-btn walk-dpad-btn--down" onClick={() => move(0, 1, 'down')}>↓</button>
        <button type="button" className="walk-dpad-btn walk-dpad-btn--center" onClick={handleInteract}>E</button>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`village-interior${themeClass}`}>
      <div className="village-interior__top">
        <div className="village-interior__header-card">
          <div className="village-interior__header-main">
            <span className="village-interior__emoji" aria-hidden>{interior.emoji}</span>
            <div className="village-interior__titles">
              <strong>{title}</strong>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary village-interior__exit"
            onClick={onExit}
            aria-label={t('worldMap.village_exit', { defaultValue: '← Dorp' })}
          >
            {t('worldMap.village_exit', { defaultValue: '← Dorp' })}
          </button>
        </div>
      </div>

      <div className="village-interior__scroll">
        <div className="village-interior__hint">
          {t('worldMap.village_controls_touch', { defaultValue: 'Pijltjes of knoppen linksonder · E interactie · Esc = uitgang' })}
        </div>

        <div className="village-interior-viewport-wrap">
        <div
          className="village-interior-viewport"
          ref={viewportRef}
          tabIndex={0}
          style={{ width: VIEW_W * TILE, height: VIEW_H * TILE }}
          onClick={() => viewportRef.current?.focus()}
        >
          <div className="village-interior-grid" style={{ width: VIEW_W * TILE, height: VIEW_H * TILE }}>
            {tiles.map(({ vx, vy, mx, my, kind, ex, isMe, screenFilm }) => (
              <div
                key={`${mx},${my}`}
                className={`village-interior-tile village-interior-tile--${kind}${isMe ? ' village-interior-tile--me' : ''}`}
                style={{ left: vx * TILE, top: vy * TILE, width: TILE, height: TILE }}
              >
                {kind === INTERIOR_TILE.S && screenFilm && (
                  <button
                    type="button"
                    className="village-interior-screen-btn"
                    title={localizedInteriorField(screenFilm.title, lang)}
                    onClick={() => playFilmAtScreen(mx)}
                  >
                    <span className="village-interior-screen-glow">📺</span>
                    <span className="village-interior-screen-label">
                      {localizedInteriorField(screenFilm.title, lang)}
                    </span>
                  </button>
                )}
                {kind === INTERIOR_TILE.E && ex && (
                  <span className="village-interior-exhibit-marker" title={localizedInteriorField(ex.heading, lang)}>
                    {ex.imageEmoji || '🖼️'}
                  </span>
                )}
                {kind === INTERIOR_TILE.C && <span className="village-interior-counter">🛒</span>}
                {kind === INTERIOR_TILE.D && <span className="village-interior-door">🚪</span>}
                {kind === INTERIOR_TILE.A && <span className="village-interior-seat" aria-hidden>🪑</span>}
                {isMe && (
                  <span className={`village-interior-player village-interior-player--${facing}`}>🧑‍🌾</span>
                )}
              </div>
            ))}
          </div>
        </div>
        </div>

        {activeExhibit && (
          <div className="village-interior-panel village-interior-panel--exhibit">
            <span className="village-interior-panel__emoji" aria-hidden>{activeExhibit.imageEmoji || '🖼️'}</span>
            <div>
              <h3>{localizedInteriorField(activeExhibit.heading, lang)}</h3>
              <p>{localizedInteriorField(activeExhibit.body, lang)}</p>
            </div>
          </div>
        )}

        {interior.films?.length > 0 && !cinemaFilm && (
          <div className="village-interior-panel village-interior-panel--cinema">
            <p>{t('worldMap.village_cinema_hint', { defaultValue: 'Klik op een scherm bovenin of kies hieronder.' })}</p>
            <div className="village-cinema-film-list">
              {(interior.films || []).map((film) => (
                <button
                  key={film.id}
                  type="button"
                  className="village-cinema-film-btn"
                  onClick={() => setCinemaFilm(film)}
                >
                  <strong>{localizedInteriorField(film.title, lang)}</strong>
                  <span>{localizedInteriorField(film.body, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {facingScreenX !== null && !cinemaFilm && (
          <div className="village-interior-panel village-interior-panel--hint">
            {t('worldMap.village_screen_hint', { defaultValue: 'Druk E om deze film te starten.' })}
          </div>
        )}

        {pos.x === interior.exit.x && pos.y === interior.exit.y && (
          <div className="village-interior-panel village-interior-panel--hint">
            {t('worldMap.village_door_hint', { defaultValue: 'Druk E om het dorp in te gaan.' })}
          </div>
        )}

        {showShop && (
          <ShopPanel
            interior={interior}
            lang={lang}
            coins={coins}
            onBuy={handleBuy}
            onOpenMarket={() => { setShowShop(false); onOpenMarket?.(); }}
            onCloseShop={() => setShowShop(false)}
          />
        )}
      </div>

      {shopFlash && <div className="village-shop-flash">{shopFlash}</div>}

      {cinemaFilm && (
        <YouTubeCinema
          videoId={cinemaFilm.youtubeId}
          title={localizedInteriorField(cinemaFilm.title, lang)}
          onClose={() => setCinemaFilm(null)}
        />
      )}

      {interiorDpad}
    </div>
  );
}
