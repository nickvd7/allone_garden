import React, { useCallback, useEffect, useRef } from 'react';

const REPEAT_DELAY_MS = 220;
const REPEAT_INTERVAL_MS = 110;

/**
 * Game Boy-style D-pad with hold-to-repeat and touch-safe handlers.
 */
export default function WalkDpad({
  onMove,
  onInteract,
  onClearTarget,
  ariaLabel,
  className = 'walk-dpad walk-dpad--gameboy walk-dpad--world-float',
}) {
  const repeatRef = useRef({ delay: null, interval: null });
  const suppressMapClickUntilRef = useRef(0);

  const stopRepeat = useCallback(() => {
    if (repeatRef.current.delay) {
      clearTimeout(repeatRef.current.delay);
    }
    if (repeatRef.current.interval) {
      clearInterval(repeatRef.current.interval);
    }
    repeatRef.current = { delay: null, interval: null };
  }, []);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const markDpadUse = useCallback(() => {
    suppressMapClickUntilRef.current = Date.now() + 400;
    if (typeof window !== 'undefined') {
      window.__walkDpadSuppressUntil = suppressMapClickUntilRef.current;
    }
    onClearTarget?.();
  }, [onClearTarget]);

  const startRepeat = useCallback((dx, dy, dir) => {
    stopRepeat();
    markDpadUse();
    onMove(dx, dy, dir);
    repeatRef.current.delay = setTimeout(() => {
      repeatRef.current.interval = setInterval(() => {
        onMove(dx, dy, dir);
      }, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }, [markDpadUse, onMove, stopRepeat]);

  const bindDirection = useCallback((dx, dy, dir) => ({
    type: 'button',
    className: `walk-dpad-btn walk-dpad-btn--${dir}`,
    onContextMenu: (e) => e.preventDefault(),
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startRepeat(dx, dy, dir);
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      stopRepeat();
    },
    onPointerCancel: stopRepeat,
    onPointerLeave: (e) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
      stopRepeat();
    },
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
  }), [startRepeat, stopRepeat]);

  const bindCenter = useCallback(() => ({
    type: 'button',
    className: 'walk-dpad-btn walk-dpad-btn--center',
    onContextMenu: (e) => e.preventDefault(),
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      markDpadUse();
    },
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      markDpadUse();
      onInteract?.();
    },
  }), [markDpadUse, onInteract]);

  return (
    <div
      className={className}
      role="group"
      aria-label={ariaLabel}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button {...bindDirection(0, -1, 'up')}>↑</button>
      <button {...bindDirection(-1, 0, 'left')}>←</button>
      <button {...bindDirection(1, 0, 'right')}>→</button>
      <button {...bindDirection(0, 1, 'down')}>↓</button>
      <button {...bindCenter()}>E</button>
    </div>
  );
}

export function shouldSuppressWalkMapClick() {
  return typeof window !== 'undefined'
    && window.__walkDpadSuppressUntil
    && Date.now() < window.__walkDpadSuppressUntil;
}
