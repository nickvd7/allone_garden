import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';

/** Lokale markt voor spelen zonder account (geen JWT). Alleen op dit apparaat opgeslagen. */
const GUEST_MARKET_KEY = 'garden_guest_market_v1';

function defaultGuestSeedListings() {
  return [
    { id: 1, crop_id: 'tomato', quantity: 4, price_per_unit: 9, seller_name: 'Reizende handelaar', seller_id: -1 },
    { id: 2, crop_id: 'lettuce', quantity: 6, price_per_unit: 8, seller_name: 'Reizende handelaar', seller_id: -1 },
    { id: 3, crop_id: 'corn', quantity: 3, price_per_unit: 6, seller_name: 'Vallei-boerderij', seller_id: -2 },
    { id: 4, crop_id: 'carrot', quantity: 10, price_per_unit: 4, seller_name: 'Vallei-boerderij', seller_id: -2 },
  ];
}

function loadGuestListings() {
  try {
    const raw = localStorage.getItem(GUEST_MARKET_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {
    /* ignore */
  }
  return defaultGuestSeedListings();
}

function saveGuestListings(arr) {
  try {
    localStorage.setItem(GUEST_MARKET_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function nextGuestListingId(listings) {
  return 1 + Math.max(0, ...listings.map((l) => Number(l.id) || 0));
}

const PLANT_INFO = {
  tomato:    { emoji: '🍅', name: 'Tomato'    },
  carrot:    { emoji: '🥕', name: 'Carrot'    },
  lettuce:   { emoji: '🥬', name: 'Lettuce'   },
  radish:    { emoji: '🌸', name: 'Radish'    },
  corn:      { emoji: '🌽', name: 'Corn'      },
  potato:    { emoji: '🥔', name: 'Potato'    },
  pumpkin:   { emoji: '🎃', name: 'Pumpkin'   },
  sunflower: { emoji: '🌻', name: 'Sunflower' },
  blueberry: { emoji: '🫐', name: 'Blueberry' },
};

// ── Crop Prices sub-component ─────────────────────────────────────────────────

function CropPricesTab({ socket }) {
  const [prices, setPrices] = useState(null);
  const [hot,    setHot]    = useState(null);
  const [cheap,  setCheap]  = useState(null);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = ({ prices: p, hot: h, cheap: c }) => {
      setPrices(p); setHot(h); setCheap(c);
    };
    const onData = ({ prices: p }) => setPrices(p);

    socket.on('plugin:crop-prices:update', onUpdate);
    socket.on('plugin:crop-prices:data',   onData);
    socket.emit('plugin:crop-prices:request', {});

    return () => {
      socket.off('plugin:crop-prices:update', onUpdate);
      socket.off('plugin:crop-prices:data',   onData);
    };
  }, [socket]);

  if (!socket) {
    return <div style={styles.empty}>Connect to server to see live prices.</div>;
  }

  if (!prices) {
    return <div style={styles.empty}>Loading live prices…</div>;
  }

  const entries = Object.entries(prices).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: '#888' }}>
        Prices update each in-game day. Sell high, buy low!
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            {['Crop', 'Price / unit', ''].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([crop, price]) => {
            const info    = PLANT_INFO[crop] || { emoji: '🌿', name: crop };
            const isHot   = crop === hot;
            const isCheap = crop === cheap;
            return (
              <tr key={crop} style={styles.tr}>
                <td style={styles.td}>{info.emoji} {info.name}</td>
                <td style={{ ...styles.td, fontWeight: 700, color: '#2e7d32' }}>
                  🪙 {price}
                </td>
                <td style={styles.td}>
                  {isHot   && <span style={{ background: '#fff3e0', color: '#e65100', padding: '0.1rem 0.45rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>🔥 Hot</span>}
                  {isCheap && <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.1rem 0.45rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>💚 Cheap</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ListingRow({ listing, onBuy, ownUserId }) {
  const [qty, setQty]     = useState(1);
  const [busy, setBusy]   = useState(false);
  const plant = PLANT_INFO[listing.crop_id || listing.cropId] || { emoji: '❓', name: listing.crop_id };
  const price = listing.price_per_unit || listing.pricePerUnit;
  const available = listing.quantity;
  const isOwn = listing.seller_id === ownUserId || listing.sellerId === ownUserId;

  const handleBuy = async () => {
    setBusy(true);
    try {
      await onBuy(listing.id, qty, price * qty);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr style={styles.tr}>
      <td style={styles.td}>{plant.emoji} {plant.name}</td>
      <td style={styles.td}>{listing.seller_name || listing.sellerName || '?'}</td>
      <td style={styles.td}>×{available}</td>
      <td style={styles.td}>🪙{price} each</td>
      <td style={styles.td}>
        {isOwn ? (
          <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Your listing</span>
        ) : (
          <div style={styles.buyActionRow}>
            <input
              type="number"
              min={1}
              max={available}
              value={qty}
              onChange={(e) => setQty(Math.min(available, Math.max(1, parseInt(e.target.value) || 1)))}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              style={styles.buyQtyInput}
            />
            <button
              style={{ ...styles.btnBuy, opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}
              onClick={handleBuy}
              disabled={busy}
            >
              {busy ? '…' : `Buy 🪙${price * qty}`}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function TradeModal({ inventory, coins, userId, socket, onBuy, onClose, onSellDeduct, onGuestSale }) {
  const hasAuth = !!localStorage.getItem('garden_token');
  const [tab, setTab]         = useState('browse'); // 'browse' | 'sell' | 'prices'
  const [listings, setListings] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Create listing form
  const [sellForm, setSellForm] = useState({ cropId: 'tomato', quantity: 1, pricePerUnit: 10 });
  const [selling, setSelling]   = useState(false);

  const fetchListings = useCallback(async () => {
    if (!hasAuth) {
      setLoading(true);
      setError('');
      try {
        setListings(loadGuestListings());
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const data = await api.get('/api/trade/listings');
      setListings(data);
    } catch {
      setError('Could not load listings (backend offline?)');
    } finally {
      setLoading(false);
    }
  }, [hasAuth]);

  useEffect(() => {
    if (tab === 'browse') fetchListings();
  }, [tab, fetchListings]);

  const handleGuestBuy = useCallback((listingId, qty, totalCost) => {
    if (coins < totalCost) { setError(`Not enough coins (need 🪙${totalCost})`); return; }
    const all = loadGuestListings();
    const idx = all.findIndex((l) => l.id === listingId);
    if (idx < 0) { setError('Aanbod niet gevonden.'); return; }
    const listing = all[idx];
    const sid = listing.seller_id ?? listing.sellerId;
    if (sid === userId) { setError('Je kunt je eigen aanbod niet kopen.'); return; }
    if (qty > listing.quantity) { setError(`Er zijn maar ${listing.quantity} beschikbaar.`); return; }
    const cropId = listing.crop_id || listing.cropId;
    const newQty = listing.quantity - qty;
    let updated;
    if (newQty <= 0) updated = all.filter((l) => l.id !== listingId);
    else {
      updated = [...all];
      updated[idx] = { ...listing, quantity: newQty };
    }
    saveGuestListings(updated);
    setListings(updated);
    onBuy(cropId, qty, totalCost);
    setError('');
  }, [coins, userId, onBuy]);

  const handleBuy = async (listingId, qty, totalCost) => {
    if (!hasAuth) {
      handleGuestBuy(listingId, qty, totalCost);
      return;
    }
    if (coins < totalCost) { setError(`Not enough coins (need 🪙${totalCost})`); return; }
    try {
      await api.post(`/api/trade/buy/${listingId}`, { quantity: qty });
      const listing = listings.find((l) => l.id === listingId);
      const cropId = listing?.crop_id || listing?.cropId;
      onBuy(cropId, qty, totalCost);
      await fetchListings();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    if (!hasAuth) {
      if (typeof onSellDeduct !== 'function') {
        setError('Verkopen is niet beschikbaar.');
        return;
      }
      const { cropId, quantity, pricePerUnit } = sellForm;
      if ((inventory[cropId] || 0) < quantity) {
        setError('Niet genoeg oogst in je inventaris.');
        return;
      }
      setSelling(true);
      setError('');
      try {
        onSellDeduct(cropId, quantity);
        const base = loadGuestListings();
        const newListing = {
          id: nextGuestListingId(base),
          crop_id: cropId,
          quantity,
          price_per_unit: pricePerUnit,
          seller_name: 'Jij',
          seller_id: userId,
        };
        const merged = [...base, newListing];
        saveGuestListings(merged);
        setListings(merged);
        setSellForm({ cropId: 'tomato', quantity: 1, pricePerUnit: 10 });
        setTab('browse');
      } finally {
        setSelling(false);
      }
      return;
    }
    setSelling(true);
    setError('');
    try {
      await api.post('/api/trade/listings', sellForm);
      setSellForm({ cropId: 'tomato', quantity: 1, pricePerUnit: 10 });
      setTab('browse');
    } catch (err) {
      setError(err.message);
    } finally {
      setSelling(false);
    }
  };

  useEffect(() => {
    if (hasAuth) return undefined;
    const timer = setInterval(() => {
      const all = loadGuestListings();
      const own = all.filter((l) => (l.seller_id ?? l.sellerId) === userId && Number(l.quantity) > 0);
      if (!own.length) return;
      // About 65% of ticks trigger one virtual purchase.
      if (Math.random() < 0.35) return;
      const picked = own[Math.floor(Math.random() * own.length)];
      const maxQty = Math.max(1, Number(picked.quantity) || 1);
      const buyQty = Math.min(maxQty, Math.max(1, Math.floor(Math.random() * 3) + 1));
      const price = Number(picked.price_per_unit || picked.pricePerUnit || 0);
      const total = buyQty * price;

      const updated = all
        .map((l) => {
          if (l.id !== picked.id) return l;
          return { ...l, quantity: Math.max(0, (Number(l.quantity) || 0) - buyQty) };
        })
        .filter((l) => (Number(l.quantity) || 0) > 0);

      saveGuestListings(updated);
      setListings(updated);
      if (typeof onGuestSale === 'function' && total > 0) {
        const cropId = picked.crop_id || picked.cropId;
        onGuestSale(cropId, buyQty, total);
      }
    }, 9000);

    return () => clearInterval(timer);
  }, [hasAuth, userId, onGuestSale]);

  const ownedCrops = Object.entries(inventory).filter(([, qty]) => qty > 0);

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>🔄 Marketplace</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {[
            { key: 'browse', label: '🛒 Browse' },
            { key: 'sell',   label: '📦 Sell'   },
            { key: 'prices', label: '📈 Prices'  },
          ].map(({ key, label }) => (
            <button
              key={key}
              style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Browse tab */}
        {tab === 'browse' && (
          <div style={styles.tabContent}>
            {!hasAuth && (
              <div style={styles.guestBanner}>
                <strong>Lokale markt</strong> — alleen op dit apparaat. Maak een account om met echte spelers te handelen.
              </div>
            )}
            {loading ? (
              <div style={styles.empty}>Loading listings…</div>
            ) : listings.length === 0 ? (
              <div style={styles.empty}>Nog geen aanbod. Verkoop iets op het tabblad Sell!</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Crop', 'Seller', 'Available', 'Price', 'Buy'].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l) => (
                      <ListingRow
                        key={l.id}
                        listing={l}
                        onBuy={handleBuy}
                        ownUserId={userId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button style={styles.btnRefresh} onClick={fetchListings}>↻ Refresh</button>
          </div>
        )}

        {/* Prices tab */}
        {tab === 'prices' && (
          <div style={styles.tabContent}>
            <CropPricesTab socket={socket} />
          </div>
        )}

        {/* Sell tab */}
        {tab === 'sell' && (
          <div style={styles.tabContent}>
            {!hasAuth && (
              <div style={styles.guestBanner}>
                Verkoop gaat naar je <strong>lokale markt</strong> (zelfde apparaat). Voor de online markt: registreer en log in.
              </div>
            )}
            {ownedCrops.length === 0 ? (
              <div style={styles.empty}>You have no crops to sell. Harvest some first!</div>
            ) : (
              <form onSubmit={handleSell} style={styles.sellForm}>
                <label style={styles.label}>Crop</label>
                <select
                  style={styles.select}
                  value={sellForm.cropId}
                  onChange={(e) => setSellForm((p) => ({ ...p, cropId: e.target.value }))}
                >
                  {ownedCrops.map(([id, qty]) => {
                    const p = PLANT_INFO[id] || { emoji: '❓', name: id };
                    return (
                      <option key={id} value={id}>
                        {p.emoji} {p.name} (×{qty} in inventory)
                      </option>
                    );
                  })}
                </select>

                <label style={styles.label}>Quantity</label>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  max={inventory[sellForm.cropId] || 1}
                  value={sellForm.quantity}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  onChange={(e) =>
                    setSellForm((p) => ({
                      ...p,
                      quantity: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                />

                <label style={styles.label}>Price per unit (🪙 coins)</label>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={sellForm.pricePerUnit}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  onChange={(e) =>
                    setSellForm((p) => ({
                      ...p,
                      pricePerUnit: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                />

                <div style={styles.totalValueNote}>
                  Total listing value: 🪙{sellForm.quantity * sellForm.pricePerUnit}
                </div>

                <button
                  style={{ ...styles.btnPrimary, marginTop: '1rem', opacity: selling ? 0.6 : 1 }}
                  type="submit"
                  disabled={selling}
                >
                  {selling ? 'Listing…' : '📦 List for sale'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '14px',
    width: '100%', maxWidth: '680px',
    maxHeight: '85vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee',
  },
  modalTitle: { margin: 0, color: '#2e7d32', fontSize: '1.3rem' },
  closeBtn: {
    border: 'none', background: 'none', fontSize: '1.2rem',
    cursor: 'pointer', color: '#aaa', padding: '0.25rem',
  },
  tabs: {
    display: 'flex', borderBottom: '1px solid #eee',
    padding: '0 1.5rem', gap: '0.5rem',
  },
  tab: {
    padding: '0.6rem 1rem', border: 'none', background: 'none',
    cursor: 'pointer', fontWeight: '600', color: '#888',
    borderBottom: '3px solid transparent', fontSize: '0.95rem',
  },
  tabActive: { color: '#4caf50', borderBottomColor: '#4caf50' },
  tabContent: { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  error: {
    margin: '0.75rem 1.5rem 0',
    background: '#ffebee', color: '#c62828',
    padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.9rem',
  },
  guestBanner: {
    background: '#e8f5e9',
    color: '#33691e',
    padding: '0.65rem 0.85rem',
    borderRadius: '8px',
    fontSize: '0.85rem',
    marginBottom: '0.85rem',
    lineHeight: 1.4,
  },
  empty: { color: '#aaa', textAlign: 'center', padding: '2rem 0', fontSize: '0.95rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: {
    textAlign: 'left', padding: '0.6rem 0.75rem',
    background: '#f9fbe7', color: '#558b2f',
    fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase',
  },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '0.6rem 0.75rem', verticalAlign: 'middle' },
  btnBuy: {
    padding: '0.35rem 0.75rem', background: '#4caf50', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontWeight: '600', fontSize: '0.85rem',
  },
  buyActionRow: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
    minWidth: '174px',
  },
  buyQtyInput: {
    width: '64px',
    minWidth: '64px',
    padding: '0.35rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  btnRefresh: {
    marginTop: '0.75rem', padding: '0.4rem 0.9rem',
    border: '1.5px solid #ccc', background: 'white',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#555',
  },
  sellForm: { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '360px' },
  label: { fontWeight: '600', color: '#555', fontSize: '0.85rem' },
  select: {
    padding: '0.6rem', border: '1.5px solid #ddd',
    borderRadius: '6px', fontSize: '0.95rem', background: 'white',
  },
  input: {
    padding: '0.6rem', border: '1.5px solid #ddd',
    borderRadius: '6px', fontSize: '0.95rem', width: '100%',
    minHeight: '40px',
    boxSizing: 'border-box',
  },
  totalValueNote: {
    color: '#888',
    fontSize: '0.85rem',
    marginTop: '0.25rem',
    whiteSpace: 'nowrap',
  },
  btnPrimary: {
    padding: '0.75rem', background: '#4caf50', color: 'white',
    border: 'none', borderRadius: '8px', fontWeight: '700',
    cursor: 'pointer', fontSize: '1rem',
  },
};

export default TradeModal;
