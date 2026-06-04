import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const TOUR_STEP_META = [
  { id: 'welcome',    target: null,                      position: 'center' },
  { id: 'tools',      target: '[data-tour="tools"]',     position: 'right'  },
  { id: 'garden',     target: '[data-tour="garden"]',    position: 'left'   },
  { id: 'structures', target: '[data-tour="structures"]', position: 'right'  },
  { id: 'village',    target: '[data-tour="world"]',     position: 'bottom' },
  { id: 'inventory',  target: '[data-tour="inventory"]', position: 'top'    },
  { id: 'chat',       target: '[data-tour="chat"]',      position: 'top'    },
  { id: 'header',     target: '[data-tour="header"]',    position: 'bottom' },
  { id: 'done',       target: null,                      position: 'center' },
];

/** Build translated tour steps (for tests pass i18n.t). */
export function getTourSteps(t) {
  return TOUR_STEP_META.map(({ id, target, position }) => ({
    id,
    title: t(`tour.steps.${id}.title`),
    body:  t(`tour.steps.${id}.body`),
    target,
    position,
  }));
}

function calcCardStyle(targetRect, position) {
  const CARD_W  = 340;
  const CARD_H  = 280;
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
      maxHeight: 'min(85vh, calc(100vh - 2rem))',
      overflowY: 'auto',
    };
  }

  const { top, bottom, left, right, width } = targetRect;
  const style = { position: 'fixed', width: CARD_W, maxHeight: 'min(70vh, 320px)', overflowY: 'auto' };

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

function renderTourBody(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

function TourOverlay({ onFinish }) {
  const { t, i18n } = useTranslation();
  const tourSteps = useMemo(() => getTourSteps(t), [t, i18n.language]);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [showAgain, setShowAgain] = useState(false);
  const rafRef = useRef(null);

  const current = tourSteps[step] || tourSteps[0];
  const isLast  = step === tourSteps.length - 1;
  const isFirst = step === 0;

  const measureTarget = useCallback(() => {
    if (!current?.target) { setTargetRect(null); return; }
    const el = document.querySelector(current.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [current?.target]);

  useEffect(() => {
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [measureTarget]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onFinish(!showAgain); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFinish, showAgain]);

  const handleNext = () => {
    if (step < tourSteps.length - 1) setStep((s) => s + 1);
    else onFinish(!showAgain);
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const PAD = 8;

  return (
    <>
      {!targetRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 7000,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}

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
            zIndex:        7000,
            pointerEvents: 'none',
            boxShadow: '0 0 0 3000px rgba(0,0,0,0.60)',
            border:    '2px solid #4caf50',
            transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        style={{
          ...calcCardStyle(targetRect, current.position),
          zIndex:       7001,
          background:   'white',
          borderRadius: 14,
          padding:      '1.4rem 1.5rem',
          boxShadow:    '0 12px 48px rgba(0,0,0,0.30)',
          fontFamily:   'inherit',
        }}
      >
        <div style={{ display: 'flex', gap: 5, marginBottom: '1rem', justifyContent: 'center' }}>
          {tourSteps.map((_, i) => (
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
              aria-label={t('tour.goToStep', { n: i + 1 })}
            />
          ))}
        </div>

        <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.05rem', color: '#2e7d32', lineHeight: 1.3 }}>
          {current.title}
        </h3>
        <p style={{ margin: '0 0 1.2rem', fontSize: '0.88rem', color: '#555', lineHeight: 1.6 }}>
          {renderTourBody(current.body)}
        </p>

        <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.75rem', textAlign: 'center' }}>
          {t('tour.stepCounter', { current: step + 1, total: tourSteps.length })}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: '#999', marginBottom: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showAgain}
            onChange={(e) => setShowAgain(e.target.checked)}
            style={{ accentColor: '#4caf50', cursor: 'pointer' }}
          />
          {t('tour.showAgain')}
        </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => onFinish(!showAgain)}
            style={{
              border: 'none', background: 'none', color: '#bbb',
              cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0',
            }}
          >
            {t('tour.skip')}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button type="button" onClick={handlePrev} style={STYLES.btnSecondary}>
                {t('tour.back')}
              </button>
            )}
            <button type="button" onClick={handleNext} style={STYLES.btnPrimary} autoFocus>
              {isLast ? t('tour.finish') : t('tour.next')}
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
