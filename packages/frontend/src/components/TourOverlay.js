import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Tour steps ────────────────────────────────────────────────────────────────
// target: CSS selector matching the element to spotlight (null = centred modal)
// position: where to place the card relative to the target
export const TOUR_STEPS = [
  {
    id:       'welcome',
    title:    '👋 Welcome to AllOne Garden!',
    body:     'This quick tour shows you the most important parts of the game. You can skip at any time and replay it later with the ❓ Help button.',
    target:   null,
    position: 'center',
  },
  {
    id:       'tools',
    title:    '🔧 Tools Panel',
    body:     'Pick a tool to interact with your plots. Start by selecting ⛏️ Till, then click a plot to prepare the soil. After tilling, switch to 🌱 Plant and choose a seed. Add 💧 Water and come back tomorrow with ⏭ Next Day to watch your crops grow!',
    target:   '[data-tour="tools"]',
    position: 'right',
  },
  {
    id:       'garden',
    title:    '🌾 Your Garden',
    body:     'Click any of the 24 plots to apply the active tool. Plots change colour as you work them — brown when tilled, blue-tinted when watered. The 💚 and ⚠️ icons indicate companion-planting effects that boost or reduce your harvest.',
    target:   '[data-tour="garden"]',
    position: 'left',
  },
  {
    id:       'structures',
    title:    '🏗️ Structures',
    body:     'Spend coins to build structures. The 🪣 Well waters every tilled plot in one click (3 charges/day). The 🌿 Compost Heap auto-fertilizes after every 3 harvests. The 🏡 Greenhouse shields your crops from storms and drought.',
    target:   '[data-tour="structures"]',
    position: 'right',
  },
  {
    id:       'inventory',
    title:    '🎒 Inventory',
    body:     'Harvested crops land here. Click "Sell" to exchange them for coins right away, or open the 🔄 Marketplace to post trade listings and buy from other players.',
    target:   '[data-tour="inventory"]',
    position: 'top',
  },
  {
    id:       'chat',
    title:    '🌍 Multiplayer',
    body:     'Chat with other players in real time and see who is currently online. Use the 🗺️ World Map to visit a neighbour\'s garden, help them out for bonus XP, or start a video call. The game syncs automatically when you\'re connected.',
    target:   '[data-tour="chat"]',
    position: 'top',
  },
  {
    id:       'header',
    title:    '⚙️ Top Bar',
    body:     'Quick access to everything: 🔄 Marketplace, 🔌 Plugins, 🏆 Badges, 🗺️ World Map, 📊 Leaderboard, and your 👤 Account. Switch the language or toggle 🌙 dark mode on the right.',
    target:   '[data-tour="header"]',
    position: 'bottom',
  },
  {
    id:       'done',
    title:    '🌱 You\'re all set!',
    body:     'That\'s everything you need to know to get started. Explore at your own pace — and remember, the ❓ Help button is always there if you need a refresher. Happy gardening!',
    target:   null,
    position: 'center',
  },
];

// ── Helper: position the card near the highlighted element ─────────────────
function calcCardStyle(targetRect, position) {
  const CARD_W  = 340;
  const CARD_H  = 240; // approximate
  const MARGIN  = 16;
  const viewW   = window.innerWidth;
  const viewH   = window.innerHeight;

  if (!targetRect || position === 'center') {
    return {
      position:  'fixed',
      top:       '50%',
      left:      '50%',
      transform: 'translate(-50%, -50%)',
      width:     CARD_W,
    };
  }

  const { top, bottom, left, right, width } = targetRect;
  const style = { position: 'fixed', width: CARD_W };

  switch (position) {
    case 'right':
      style.top  = Math.max(MARGIN, Math.min(top, viewH - CARD_H - MARGIN));
      style.left = Math.min(right + MARGIN, viewW - CARD_W - MARGIN);
      break;
    case 'left':
      style.top  = Math.max(MARGIN, Math.min(top, viewH - CARD_H - MARGIN));
      style.left = Math.max(MARGIN, left - CARD_W - MARGIN);
      break;
    case 'bottom':
      style.top  = Math.min(bottom + MARGIN, viewH - CARD_H - MARGIN);
      style.left = Math.max(MARGIN, Math.min(left + width / 2 - CARD_W / 2, viewW - CARD_W - MARGIN));
      break;
    case 'top':
    default:
      style.top  = Math.max(MARGIN, top - CARD_H - MARGIN);
      style.left = Math.max(MARGIN, Math.min(left + width / 2 - CARD_W / 2, viewW - CARD_W - MARGIN));
      break;
  }

  return style;
}

// ── Component ─────────────────────────────────────────────────────────────────
function TourOverlay({ onFinish }) {
  const [step,       setStep]       = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const rafRef = useRef(null);

  const current = TOUR_STEPS[step];
  const isLast  = step === TOUR_STEPS.length - 1;
  const isFirst = step === 0;

  // Measure the target element and keep the rect up-to-date on resize
  const measureTarget = useCallback(() => {
    if (!current.target) { setTargetRect(null); return; }
    const el = document.querySelector(current.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [current.target]);

  useEffect(() => {
    measureTarget();
    window.addEventListener('resize', measureTarget);
    const rafId = rafRef.current;
    return () => {
      window.removeEventListener('resize', measureTarget);
      cancelAnimationFrame(rafId);
    };
  }, [measureTarget]);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) setStep((s) => s + 1);
    else onFinish();
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const PAD = 8;

  return (
    <>
      {/* ── Backdrop ── (only shown when there is no spotlight element) */}
      {!targetRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}

      {/* ── Spotlight ring ── (box-shadow trick dims everything outside the target) */}
      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            position:  'fixed',
            top:       targetRect.top    - PAD,
            left:      targetRect.left   - PAD,
            width:     targetRect.width  + PAD * 2,
            height:    targetRect.height + PAD * 2,
            borderRadius:  10,
            zIndex:        2000,
            pointerEvents: 'none',
            // The enormous box-shadow dims everything except this element
            boxShadow: '0 0 0 3000px rgba(0,0,0,0.60)',
            border:    '2px solid #4caf50',
            transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
          }}
        />
      )}

      {/* ── Tour card ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        style={{
          ...calcCardStyle(targetRect, current.position),
          zIndex:       2001,
          background:   'white',
          borderRadius: 14,
          padding:      '1.4rem 1.5rem',
          boxShadow:    '0 12px 48px rgba(0,0,0,0.30)',
          fontFamily:   'inherit',
        }}
      >
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, marginBottom: '1rem', justifyContent: 'center' }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: i === step ? '#4caf50' : '#ddd',
                transition: 'background 0.2s',
                cursor: 'pointer',
              }}
              onClick={() => setStep(i)}
              role="button"
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.05rem', color: '#2e7d32', lineHeight: 1.3 }}>
          {current.title}
        </h3>
        <p style={{ margin: '0 0 1.2rem', fontSize: '0.88rem', color: '#555', lineHeight: 1.6 }}>
          {current.body}
        </p>

        {/* Step counter */}
        <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.75rem', textAlign: 'center' }}>
          {step + 1} / {TOUR_STEPS.length}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onFinish}
            style={{
              border: 'none', background: 'none', color: '#bbb',
              cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0',
            }}
          >
            Skip tour
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={handlePrev}
                style={STYLES.btnSecondary}
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              style={STYLES.btnPrimary}
              autoFocus
            >
              {isLast ? '🌱 Start playing!' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const STYLES = {
  btnPrimary: {
    padding: '0.45rem 1.1rem',
    background: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.88rem',
  },
  btnSecondary: {
    padding: '0.45rem 0.9rem',
    background: 'white',
    color: '#4caf50',
    border: '1.5px solid #4caf50',
    borderRadius: 7,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.88rem',
  },
};

export default TourOverlay;
