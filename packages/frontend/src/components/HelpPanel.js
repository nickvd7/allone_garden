import React, { useState } from 'react';

// ── Content ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'start',      label: '🚀 Quick Start' },
  { id: 'plants',     label: '🌱 Plants' },
  { id: 'structures', label: '🏗️ Structures' },
  { id: 'multi',      label: '🌍 Multiplayer' },
  { id: 'tips',       label: '💡 Tips' },
];

const CONTENT = {
  start: [
    {
      heading: 'Your first harvest in 4 steps',
      items: [
        '⛏️ Select the **Till** tool and click a plot to prepare the soil.',
        '🌱 Switch to **Plant**, pick a seed (Radish is fastest — 1 day!), and click a tilled plot.',
        '💧 Select **Water** and click the planted plot. Watered plants grow one extra day per Next Day tick.',
        '🧺 When the growth bar is full, switch to **Harvest** and click the plot to collect your crop.',
      ],
    },
    {
      heading: 'The Next Day button',
      items: [
        '⏭ Each click on **Next Day** advances the calendar by one day.',
        'Plants grow faster when watered (+1 day) and fertilized (+1 day).',
        'Pest 🐛 infestations stop growth — use 🧴 Spray to remove them.',
        'Weather events (storm ⛈️, drought 🏜️) can slow or damage crops — unless you have a 🏡 Greenhouse.',
      ],
    },
    {
      heading: 'Coins & XP',
      items: [
        'Harvesting earns coins 🪙 and XP. More XP → higher level.',
        'Tilling gives 5 XP, planting 10 XP, harvesting 25 XP.',
        'Companion planting bonuses (💚) multiply your harvest coins.',
        'Spend coins to build Structures or buy crops on the Marketplace.',
      ],
    },
  ],
  plants: [
    {
      heading: 'Growth times (days to harvest)',
      items: [
        '🌸 Radish — 1 day · 🪙6',
        '🥕 Carrot — 2 days · 🪙10',
        '🥬 Lettuce — 2 days · 🪙8',
        '🌻 Sunflower — 2 days · 🪙12',
        '🍅 Tomato — 3 days · 🪙15',
        '🥔 Potato — 3 days · 🪙12',
        '🫐 Blueberry — 4 days · 🪙22',
        '🌽 Corn — 4 days · 🪙18',
        '🎃 Pumpkin — 5 days · 🪙28',
      ],
    },
    {
      heading: 'Companion planting',
      items: [
        '💚 Plants next to good companions earn a **bonus yield multiplier** at harvest.',
        '⚠️ Plants next to bad companions earn a **reduced yield** — avoid these combinations.',
        'Tip combos: Tomato + Carrot (+20%), Carrot + Lettuce (+15%), Corn + Potato (+20%).',
        'Avoid: Corn + Lettuce (−15%), Corn + Pumpkin (−20%), Potato + Pumpkin (−10%).',
      ],
    },
    {
      heading: 'Pests & weather effects',
      items: [
        '🐛 Pests freeze crop growth — select 🧴 Spray and click the infested plot to remove them.',
        '🌧️ Rain auto-waters all planted plots to level 3.',
        '🏜️ Drought drains water twice as fast and raises pest chance to 15%.',
        '⛈️ Storm can set ripe crops back by one day (no Greenhouse).',
        '🏡 Greenhouse converts storm/drought into a calm cloudy day for your crops.',
      ],
    },
  ],
  structures: [
    {
      heading: '🪣 Water Well — costs 50 🪙',
      items: [
        'Instantly waters **every tilled plot** by +2 water levels.',
        'Has 3 charges per day — charges reset automatically at midnight (Next Day).',
        'Best used early morning when you have many plots planted.',
      ],
    },
    {
      heading: '🌿 Compost Heap — costs 30 🪙',
      items: [
        'After every **3 harvests** it earns 1 fertilizer charge.',
        'Click "Fertilize All" to apply fertilizer to every planted, unfertilized plot at once.',
        'Saves time — especially useful once you are running a full 24-plot garden.',
      ],
    },
    {
      heading: '🏡 Greenhouse — costs 80 🪙',
      items: [
        'Passive protection — no charges or clicks needed once built.',
        'Converts **storm** and **drought** weather into safe Cloudy conditions for your crops.',
        'Eliminates the 15% drought-pest bonus; storm damage is nullified.',
        'Worth building once you grow slow, high-value crops like Pumpkin or Blueberry.',
      ],
    },
  ],
  multi: [
    {
      heading: 'Real-time chat & players',
      items: [
        '💬 The chat panel shows messages from all players connected to this server.',
        '👥 The players panel lists who is online right now.',
        '🌍 Federated messages from neighbouring AllOne Garden servers appear with a 🌍 tag.',
      ],
    },
    {
      heading: '🗺️ World Map — visiting other gardens',
      items: [
        'Open the World Map from the header to see nearby players on the map.',
        'Click a player and choose **Visit Garden** to view their plots.',
        'You can water or fertilize one plot in a visited garden — the owner gets +XP.',
        'You also earn XP for helping others.',
      ],
    },
    {
      heading: '🔄 Marketplace',
      items: [
        'Post a **sell listing** with any crop from your inventory and set a price.',
        'Other players can browse listings and buy from you directly.',
        'Coins are transferred instantly when a trade completes.',
      ],
    },
    {
      heading: '📹 Video Calls',
      items: [
        'Start a call from the World Map by clicking another player → **Call**.',
        'The other player receives an incoming-call overlay and can accept or reject.',
        'Requires a browser with WebRTC support (Chrome, Firefox, Edge, Safari 15+).',
      ],
    },
  ],
  tips: [
    {
      heading: 'Early game',
      items: [
        '🌸 Grow Radishes first — 1 day harvest, cheap, and they pair well with Lettuce and Carrot.',
        '💧 Always water before clicking Next Day — it adds a free growth day.',
        '🏗️ Build the **Compost Heap** early (30 🪙) — it pays for itself quickly.',
        '🌱 Fill all 24 plots for maximum XP and coins per Next Day.',
      ],
    },
    {
      heading: 'Advanced',
      items: [
        '💚 Plan a companion layout: Tomato/Carrot/Lettuce trio gives multiple bonuses.',
        '🪣 The Well is worth building once you have 12+ plots — one click vs 12 clicks.',
        '🎃 Pumpkins earn the most coins (28 🪙) — pair with 🌻 Sunflower for a +15% bonus.',
        '🏡 Buy the Greenhouse before expanding to high-value crops to protect your investment.',
        '📊 Check the Leaderboard to see the top strategies other players are using.',
      ],
    },
    {
      heading: 'Offline & saving',
      items: [
        'Your garden auto-saves to the server every 3 seconds (when online).',
        'Playing as Guest works offline but progress is not saved between sessions.',
        'Create an account to save progress, earn badges, and visit other gardens.',
        'The 🔌 Plugin Marketplace adds extra features like daily bonuses and seasonal events.',
      ],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderText(text) {
  // Convert **bold** to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
function HelpPanel({ onClose, onStartTour }) {
  const [activeTab, setActiveTab] = useState('start');
  const sections = CONTENT[activeTab] || [];

  return (
    <div style={S.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.panel} role="dialog" aria-modal="true" aria-label="Help & Reference">
        {/* Header */}
        <div style={S.header}>
          <span style={S.headerTitle}>❓ Help &amp; Reference</span>
          <button onClick={onClose} style={S.closeBtn} aria-label="Close help panel">✕</button>
        </div>

        {/* Tab bar */}
        <div style={S.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              style={{ ...S.tab, ...(activeTab === tab.id ? S.tabActive : {}) }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={S.body}>
          {sections.map((section) => (
            <div key={section.heading} style={S.section}>
              <h4 style={S.sectionHeading}>{section.heading}</h4>
              <ul style={S.list}>
                {section.items.map((item, i) => (
                  <li key={i} style={S.listItem}>{renderText(item)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.tourBtn} onClick={onStartTour}>
            🗺️ Take the tour again
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  backdrop: {
    position:   'fixed',
    inset:      0,
    background: 'rgba(0,0,0,0.45)',
    zIndex:     1500,
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding:    '1rem',
  },
  panel: {
    background:   'white',
    borderRadius: 16,
    width:        '100%',
    maxWidth:     660,
    maxHeight:    '90vh',
    display:      'flex',
    flexDirection:'column',
    boxShadow:    '0 16px 64px rgba(0,0,0,0.25)',
    overflow:     'hidden',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '1rem 1.25rem 0.75rem',
    borderBottom:   '1px solid #f0f0f0',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize:   '1.1rem',
    color:      '#2e7d32',
  },
  closeBtn: {
    border:     'none',
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 6,
    padding:    '0.3rem 0.6rem',
    cursor:     'pointer',
    fontSize:   '0.9rem',
    color:      '#555',
  },
  tabBar: {
    display:    'flex',
    overflowX:  'auto',
    padding:    '0.5rem 1rem 0',
    gap:        4,
    borderBottom: '2px solid #e8f5e9',
    flexShrink: 0,
  },
  tab: {
    padding:        '0.45rem 0.85rem',
    borderTop:      'none',
    borderLeft:     'none',
    borderRight:    'none',
    borderBottom:   '2px solid transparent', // longhand only — avoids shorthand conflict
    background:     'none',
    borderRadius:   '6px 6px 0 0',
    cursor:         'pointer',
    fontSize:       '0.82rem',
    fontWeight:     600,
    color:          '#777',
    whiteSpace:     'nowrap',
    transition:     'all 0.15s',
  },
  tabActive: {
    background:   '#e8f5e9',
    color:        '#2e7d32',
    borderBottom: '2px solid #4caf50', // same longhand — no conflict on rerender
  },
  body: {
    overflowY: 'auto',
    padding:   '1rem 1.25rem',
    flex:      1,
  },
  section: {
    marginBottom: '1.25rem',
  },
  sectionHeading: {
    margin:    '0 0 0.5rem',
    fontSize:  '0.92rem',
    color:     '#2e7d32',
    fontWeight: 700,
  },
  list: {
    margin:    0,
    paddingLeft: '1.2rem',
  },
  listItem: {
    fontSize:     '0.85rem',
    color:        '#444',
    lineHeight:   1.7,
    marginBottom: '0.2rem',
  },
  footer: {
    borderTop: '1px solid #f0f0f0',
    padding:   '0.75rem 1.25rem',
    display:   'flex',
    justifyContent: 'flex-end',
  },
  tourBtn: {
    padding:    '0.5rem 1.1rem',
    background: '#e8f5e9',
    color:      '#2e7d32',
    border:     '1.5px solid #a5d6a7',
    borderRadius: 8,
    cursor:     'pointer',
    fontWeight: 600,
    fontSize:   '0.88rem',
  },
};

export default HelpPanel;
