import React from 'react';
import { useTranslation } from 'react-i18next';

// Map plant IDs to display info
const PLANT_INFO = {
  tomato:    { emoji: '🍅', labelKey: 'plant_tomato',    sellPrice: 10 },
  carrot:    { emoji: '🥕', labelKey: 'plant_carrot',    sellPrice: 6  },
  lettuce:   { emoji: '🥬', labelKey: 'plant_lettuce',   sellPrice: 5  },
  radish:    { emoji: '🌸', labelKey: 'plant_radish',    sellPrice: 4  },
  corn:      { emoji: '🌽', labelKey: 'plant_corn',      sellPrice: 12 },
  potato:    { emoji: '🥔', labelKey: 'plant_potato',    sellPrice: 8  },
  pumpkin:   { emoji: '🎃', labelKey: 'plant_pumpkin',   sellPrice: 22 },
  sunflower: { emoji: '🌻', labelKey: 'plant_sunflower', sellPrice: 9  },
  blueberry: { emoji: '🫐', labelKey: 'plant_blueberry', sellPrice: 16 },
};

function Inventory({ inventory, onSell }) {
  const { t } = useTranslation();

  const items = Object.entries(inventory).map(([id, count]) => ({
    id,
    count,
    ...(PLANT_INFO[id] || { emoji: '❓', labelKey: id, sellPrice: 5 }),
  }));

  const handleSell = (item) => {
    if (item.count <= 0) return;
    if (onSell) onSell(item.id, 1, item.sellPrice);
  };

  return (
    <div className="card inventory-section">
      <h3>🧺 {t('inventory')}</h3>

      <div className="inventory-grid">
        {items.map((item) => (
          <div key={item.id} className="inventory-item">
            <span className="emoji">{item.emoji}</span>
            <div className="name">{t(item.labelKey)}</div>
            <div className="count">×{item.count}</div>
            {item.count > 0 && (
              <button
                style={{
                  marginTop: '0.3rem',
                  padding: '0.2rem 0.5rem',
                  border: '1px solid #ffb74d',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  color: '#e65100',
                }}
                onClick={() => handleSell(item)}
                title={`Sell for ${item.sellPrice} coins`}
              >
                Sell 🪙{item.sellPrice}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Inventory;
