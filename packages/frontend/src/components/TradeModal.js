import React, { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';

const PLANT_INFO = {
  tomato:  { emoji: '🍅', name: 'Tomato'  },
  carrot:  { emoji: '🥕', name: 'Carrot'  },
  lettuce: { emoji: '🥬', name: 'Lettuce' },
  radish:  { emoji: '🌸', name: 'Radish'  },
  corn:    { emoji: '🌽', name: 'Corn'    },
  potato:  { emoji: '🥔', name: 'Potato'  },
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
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              max={available}
              value={qty}
              onChange={(e) => setQty(Math.min(available, Math.max(1, parseInt(e.target.value) || 1)))}
              style={{ width: '52px', padding: '0.3rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <button
              style={{ ...styles.btnBuy, opacity: busy ? 0.6 : 1 }}
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

function TradeModal({ inventory, coins, userId, socket, onBuy, onClose }) {
  const [tab, setTab]         = useState('browse'); // 'browse' | 'sell' | 'prices'
  const [listings, setListings] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Create listing form
  const [sellForm, setSellForm] = useState({ cropId: 'tomato', quantity: 1, pricePerUnit: 10 });
  const [selling, setSelling]   = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/trade/listings');
      setListings(data);
    } catch {
      setError('Could not load listings (backend offline?)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'browse') fetchListings();
  }, [tab, fetchListings]);

  const handleBuy = async (listingId, qty, totalCost) => {
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
            {loading ? (
              <div style={styles.empty}>Loading listings…</div>
            ) : listings.length === 0 ? (
              <div style={styles.empty}>No listings yet. Be the first to sell!</div>
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
                  onChange={(e) =>
                    setSellForm((p) => ({
                      ...p,
                      pricePerUnit: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                />

                <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.25rem' }}>
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
    borderRadius: '6px', fontSize: '0.95rem',
  },
  btnPrimary: {
    padding: '0.75rem', background: '#4caf50', color: 'white',
    border: 'none', borderRadius: '8px', fontWeight: '700',
    cursor: 'pointer', fontSize: '1rem',
  },
};

export default TradeModal;
