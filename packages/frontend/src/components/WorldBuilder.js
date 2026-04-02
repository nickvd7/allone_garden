/**
 * WorldBuilder — drag-to-paint 32×20 tile-map editor.
 *
 * Admins can:
 *   • Select a tile type from the palette and click/drag to paint the grid
 *   • Place 🏡 Garden slots (up to 12) by selecting the Garden tile type
 *   • Save the layout to the server (persisted to DB or in-memory)
 *   • Reset to the built-in default map
 *   • Load the current server map
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../hooks/useApi';

// ── Map constants ─────────────────────────────────────────────────────────────
const MAP_W = 32;
const MAP_H = 20;
const CELL  = 34;  // px per tile in the editor grid

// Tile codes (must match WorldMap.js)
const TILE_GRASS  = 0;
const TILE_PATH   = 1;
const TILE_WATER  = 2;
const TILE_TREE   = 3;
const TILE_DESERT = 4;
const TILE_MOUNTAIN = 5;
const TILE_GARDEN = 6;  // virtual — stored as a gardenSlot, not in the map array

const PALETTE = [
  { code: TILE_GRASS,  label: '🌿 Grass',   bg: '#5fa33a', border: '#4a8a2e' },
  { code: TILE_PATH,   label: '🟤 Path',    bg: '#b8955a', border: '#9a7840' },
  { code: TILE_WATER,  label: '🌊 Water',   bg: '#3a8fc8', border: '#2a72a8' },
  { code: TILE_TREE,   label: '🌲 Tree',    bg: '#3a7a22', border: '#2a6015' },
  { code: TILE_DESERT, label: '🏜️ Desert', bg: '#d2b56b', border: '#b59549' },
  { code: TILE_MOUNTAIN, label: '⛰️ Mountain', bg: '#8a9099', border: '#6f7680' },
  { code: TILE_GARDEN, label: '🏡 Garden',  bg: '#e8c84a', border: '#c4a820' },
];

const TILE_BG = {
  [TILE_GRASS]:  '#5fa33a',
  [TILE_PATH]:   '#b8955a',
  [TILE_WATER]:  '#3a8fc8',
  [TILE_TREE]:   '#3a7a22',
  [TILE_DESERT]: '#d2b56b',
  [TILE_MOUNTAIN]: '#8a9099',
};

// ── Default map + garden slots (mirrors WorldMap.js) ─────────────────────────
const G = TILE_GRASS, P = TILE_PATH, W = TILE_WATER, T = TILE_TREE;

const DEFAULT_MAP = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => G));
for (let y = 0; y < MAP_H; y += 1) DEFAULT_MAP[y][Math.floor(MAP_W / 2)] = P;
for (let x = 0; x < MAP_W; x += 1) DEFAULT_MAP[Math.floor(MAP_H / 2)][x] = P;
[
  [4, 3], [5, 3], [6, 3], [4, 4], [5, 4], [6, 4],
  [25, 3], [26, 3], [27, 3], [25, 4], [26, 4], [27, 4],
  [4, 15], [5, 15], [6, 15], [4, 16], [5, 16], [6, 16],
  [25, 15], [26, 15], [27, 15], [25, 16], [26, 16], [27, 16],
].forEach(([x, y]) => { DEFAULT_MAP[y][x] = W; });
[
  [2, 2], [3, 2], [2, 3], [29, 2], [28, 2], [29, 3],
  [2, 17], [3, 17], [2, 16], [29, 17], [28, 17], [29, 16],
  [15, 1], [16, 1], [15, 18], [16, 18], [1, 9], [30, 10],
].forEach(([x, y]) => { DEFAULT_MAP[y][x] = T; });
for (let y = 0; y <= 6; y += 1) {
  for (let x = 21; x < MAP_W; x += 1) {
    if (DEFAULT_MAP[y][x] === G) DEFAULT_MAP[y][x] = TILE_DESERT;
  }
}
[
  [20, 5], [21, 5], [22, 5], [23, 6], [24, 7], [25, 8], [26, 9], [27, 10],
  [23, 11], [22, 12], [21, 13], [20, 14],
].forEach(([x, y]) => {
  if (DEFAULT_MAP[y] && DEFAULT_MAP[y][x] !== W) DEFAULT_MAP[y][x] = TILE_MOUNTAIN;
});
[
  [15, 1], [16, 1], [17, 1],
  [15, 2], [16, 2], [17, 2],
  [15, 3], [16, 3], [17, 3],
].forEach(([x, y]) => {
  if (DEFAULT_MAP[y][x] !== W && DEFAULT_MAP[y][x] !== T) DEFAULT_MAP[y][x] = P;
});

const DEFAULT_GARDEN_SLOTS = [
  { x: 3,  y: 3  }, { x: 28, y: 16 },
  { x: 3,  y: 16 }, { x: 28, y: 3  },
  { x: 9,  y: 4  }, { x: 23, y: 15 },
  { x: 8,  y: 14 }, { x: 23, y: 4  },
  { x: 5,  y: 9  }, { x: 26, y: 9  },
  { x: 14, y: 5  }, { x: 17, y: 14 },
];

const MARKET_TILE = { x: 16, y: 2 };
const WORLD_HUB = { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
const roadTile = (x, y) => {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  if (DEFAULT_MAP[y][x] === W) return;
  DEFAULT_MAP[y][x] = P;
};
const roadBetween = (from, to) => {
  const stepX = from.x <= to.x ? 1 : -1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) roadTile(x, from.y);
  const stepY = from.y <= to.y ? 1 : -1;
  for (let y = from.y; y !== to.y + stepY; y += stepY) roadTile(to.x, y);
};
[MARKET_TILE, ...DEFAULT_GARDEN_SLOTS].forEach((slot) => roadBetween(WORLD_HUB, slot));

const MAX_GARDENS = 12;

function cloneMap(m) { return m.map((row) => [...row]); }
function hasSlot(slots, x, y) { return slots.some((s) => s.x === x && s.y === y); }

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {boolean} [inline]  When true, renders without the dark overlay/modal wrapper
 *                            (for embedding inside AdminPanel tabs).
 * @param {Function} [onClose]
 */
function WorldBuilder({ onClose, inline = false }) {
  const [map,          setMap]          = useState(() => cloneMap(DEFAULT_MAP));
  const [gardenSlots,  setGardenSlots]  = useState([...DEFAULT_GARDEN_SLOTS]);
  const [selected,     setSelected]     = useState(TILE_GRASS);
  const [painting,     setPainting]     = useState(false);
  const [status,       setStatus]       = useState('');
  const [mapLoading,   setMapLoading]   = useState(false);  // loading the map from server
  const [saving,       setSaving]       = useState(false);  // saving the map to server
  const paintingRef = useRef(false);

  // ── Load current server map on mount ───────────────────────────────────────
  useEffect(() => { loadMap(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMap = useCallback(async () => {
    setMapLoading(true);
    setStatus('');
    try {
      const data = await api.get('/api/admin/world');
      if (data && data.map) {
        setMap(cloneMap(data.map));
        setGardenSlots(data.gardenSlots || []);
        setStatus('Map loaded from server.');
      } else {
        setStatus('No custom map on server — showing default.');
      }
    } catch {
      setStatus('Could not load server map.');
    } finally {
      setMapLoading(false);
    }
  }, []);

  // ── Paint helpers ──────────────────────────────────────────────────────────
  const paintCell = useCallback((x, y) => {
    if (selected === TILE_GARDEN) {
      setGardenSlots((prev) => {
        if (hasSlot(prev, x, y)) {
          // Remove existing slot
          return prev.filter((s) => !(s.x === x && s.y === y));
        }
        if (prev.length >= MAX_GARDENS) return prev; // cap
        return [...prev, { x, y }];
      });
    } else {
      setMap((prev) => {
        const next = cloneMap(prev);
        next[y][x] = selected;
        return next;
      });
    }
  }, [selected]);

  const onMouseDown = useCallback((x, y) => {
    paintingRef.current = true;
    setPainting(true);
    paintCell(x, y);
  }, [paintCell]);

  const onMouseEnter = useCallback((x, y) => {
    if (paintingRef.current) paintCell(x, y);
  }, [paintCell]);

  const onMouseUp = useCallback(() => {
    paintingRef.current = false;
    setPainting(false);
  }, []);

  useEffect(() => {
    const up = () => { paintingRef.current = false; setPainting(false); };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await api.put('/api/admin/world', { map, gardenSlots });
      setStatus('✅ Map saved!');
    } catch (err) {
      setStatus(`❌ Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to default ──────────────────────────────────────────────────────
  const handleReset = () => {
    setMap(cloneMap(DEFAULT_MAP));
    setGardenSlots([...DEFAULT_GARDEN_SLOTS]);
    setStatus('Reset to default map (not saved yet).');
  };

  const inner = (
    <div style={inline ? styles.inlineWrapper : styles.modal} onMouseUp={onMouseUp}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>🗺️ World Builder</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
            <button style={styles.btn} onClick={loadMap} disabled={mapLoading || saving} aria-label="Load map">↻ Load</button>
            <button style={styles.btn} onClick={handleReset} disabled={mapLoading || saving} aria-label="Reset map">⟳ Reset</button>
            <button style={{ ...styles.btn, ...styles.btnSave }} onClick={handleSave} disabled={mapLoading || saving} aria-label="Save map">
              {saving ? 'Saving…' : '💾 Save'}
            </button>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div style={{ ...styles.status, color: status.startsWith('❌') ? '#c62828' : '#2e7d32' }}>
            {status}
          </div>
        )}

        {/* Main content */}
        <div style={styles.body}>
          {/* Palette */}
          <div style={styles.palette}>
            <div style={styles.paletteTitle}>Tile palette</div>
            {PALETTE.map((t) => (
              <button
                key={t.code}
                style={{
                  ...styles.paletteBtn,
                  background: t.bg,
                  border: `2.5px solid ${selected === t.code ? '#fff' : t.border}`,
                  boxShadow: selected === t.code ? '0 0 0 3px #4caf50' : 'none',
                  opacity: selected === t.code ? 1 : 0.75,
                }}
                onClick={() => setSelected(t.code)}
                title={t.label}
              >
                {t.label}
              </button>
            ))}
            <div style={styles.paletteHint}>
              🏡 Slots: {gardenSlots.length}/{MAX_GARDENS}
            </div>
            <div style={styles.paletteHint}>
              Select Garden type then click to toggle slots.
            </div>
            <div style={styles.paletteHint}>
              Drag to paint multiple tiles.
            </div>
          </div>

          {/* Grid */}
          <div
            style={{ ...styles.grid, cursor: painting ? 'crosshair' : 'pointer' }}
            role="grid"
            aria-label="World map editor"
          >
            {map.map((row, y) =>
              row.map((tile, x) => {
                const isSlot = hasSlot(gardenSlots, x, y);
                return (
                  <div
                    key={`${x}-${y}`}
                    role="gridcell"
                    aria-label={`tile-${x}-${y}`}
                    style={{
                      width: CELL, height: CELL,
                      background: isSlot ? '#e8c84a' : TILE_BG[tile] || '#5fa33a',
                      border: isSlot
                        ? '1.5px solid #c4a820'
                        : '1px solid rgba(0,0,0,0.08)',
                      boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem',
                      userSelect: 'none',
                      transition: 'filter 0.05s',
                    }}
                    onMouseDown={() => onMouseDown(x, y)}
                    onMouseEnter={() => onMouseEnter(x, y)}
                  >
                    {isSlot ? '🏡' : tile === TILE_WATER ? '🌊' : tile === TILE_TREE ? '🌲' : tile === TILE_DESERT ? '🏜️' : tile === TILE_MOUNTAIN ? '⛰️' : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
  );

  if (inline) return inner;
  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      {inner}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 700, padding: '0.75rem',
  },
  modal: {
    background: '#1a2a1a', borderRadius: '14px',
    width: '100%', maxWidth: '920px', maxHeight: '95vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    color: '#f0f4e8',
  },
  inlineWrapper: {
    background: '#1a2a1a', borderRadius: '10px',
    display: 'flex', flexDirection: 'column',
    overflow: 'auto', color: '#f0f4e8',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.2)',
  },
  title: { margin: 0, fontSize: '1.2rem', color: '#a5d6a7' },
  btn: {
    padding: '0.35rem 0.85rem', border: '1.5px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#ccc',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600',
  },
  btnSave: {
    background: '#2e7d32', borderColor: '#4caf50', color: 'white',
  },
  closeBtn: {
    border: 'none', background: 'none',
    fontSize: '1.2rem', cursor: 'pointer', color: '#aaa',
  },
  status: {
    padding: '0.4rem 1.25rem',
    fontSize: '0.85rem', fontWeight: '500',
    background: 'rgba(255,255,255,0.04)',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'auto', gap: '1rem',
    padding: '1rem 1.25rem',
  },
  palette: {
    display: 'flex', flexDirection: 'column', gap: '0.4rem',
    minWidth: '130px',
  },
  paletteTitle: {
    fontSize: '0.72rem', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#888', marginBottom: '0.25rem',
  },
  paletteBtn: {
    padding: '0.45rem 0.6rem', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600',
    color: 'rgba(255,255,255,0.9)', textAlign: 'left',
    transition: 'transform 0.08s',
  },
  paletteHint: {
    fontSize: '0.72rem', color: '#666', marginTop: '0.3rem', lineHeight: '1.4',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(${MAP_W}, ${CELL}px)`,
    gridTemplateRows:    `repeat(${MAP_H}, ${CELL}px)`,
    gap: 0,
    border: '2px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    overflow: 'hidden',
    flexShrink: 0,
  },
};

export default WorldBuilder;
