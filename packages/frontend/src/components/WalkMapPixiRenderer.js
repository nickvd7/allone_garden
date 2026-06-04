/**
 * Optional WebGL map layer (PixiJS). Visual style aligned with DOM/CSS tiles.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  hexToPixiColor,
  tilePixiGradient,
  drawPixiTileBackground,
  drawPixiPlotPanel,
} from '../utils/mapTileVisuals';

function drawTileCell(Graphics, Text, TextStyle, pxTile, spec) {
  const container = new Graphics();
  const pad = 1;
  const size = pxTile - pad;

  const bg = drawPixiTileBackground(Graphics, pxTile, spec.gradientStops || ['#5fa33a', '#4a852e']);
  container.addChild(bg);

  if (spec.borderHex) {
    const border = new Graphics();
    border.rect(0, 0, size, size);
    border.stroke({ width: 2, color: hexToPixiColor(spec.borderHex), alpha: 0.85 });
    container.addChild(border);
  }

  if (spec.worldEdge) {
    const edge = new Graphics();
    edge.rect(0, 0, size, size);
    edge.stroke({ width: 3, color: 0x1a3a0a, alpha: 0.75 });
    container.addChild(edge);
  }

  const emojiStyle = new TextStyle({
    fontSize: Math.max(14, Math.round(pxTile * 0.38)),
    fill: '#ffffff',
    fontFamily: 'system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif',
    dropShadow: {
      alpha: 0.45,
      angle: Math.PI / 2,
      blur: 2,
      distance: 2,
      color: '#000000',
    },
  });

  if (spec.decor) {
    const decor = new Text({ text: spec.decor, style: emojiStyle });
    decor.anchor.set(0.5);
    decor.x = pxTile / 2;
    decor.y = pxTile / 2 - (spec.plotOverlay || spec.poiEmoji ? 5 : 0);
    container.addChild(decor);
  }

  if (spec.plotOverlay) {
    const plotPanel = drawPixiPlotPanel(Graphics, pxTile, spec.plotOverlay);
    container.addChild(plotPanel);
    if (spec.plotOverlay.emoji) {
      const crop = new Text({
        text: spec.plotOverlay.emoji,
        style: new TextStyle({
          fontSize: Math.max(12, Math.round(pxTile * 0.28)),
          fontFamily: 'system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif',
        }),
      });
      crop.anchor.set(0.5);
      crop.x = pxTile / 2;
      crop.y = pxTile / 2 + 2;
      container.addChild(crop);
    } else if (spec.plotOverlay.tilled) {
      const dot = new Text({
        text: '•',
        style: new TextStyle({ fontSize: Math.max(10, Math.round(pxTile * 0.22)), fill: '#ffffff' }),
      });
      dot.anchor.set(0.5);
      dot.x = pxTile / 2;
      dot.y = pxTile / 2;
      container.addChild(dot);
    }
  }

  if (spec.poiEmoji) {
    const poi = new Text({
      text: spec.poiEmoji,
      style: new TextStyle({ fontSize: Math.max(16, Math.round(pxTile * 0.42)) }),
    });
    poi.anchor.set(0.5);
    poi.x = pxTile / 2;
    poi.y = pxTile / 2;
    container.addChild(poi);
  }

  if (spec.houseEmoji) {
    const house = new Text({
      text: spec.houseEmoji,
      style: new TextStyle({
        fontSize: Math.max(12, pxTile * 0.3),
        fontFamily: 'system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif',
        dropShadow: { alpha: 0.35, blur: 2, distance: 1, color: '#000' },
      }),
    });
    house.x = 3;
    house.y = 2;
    container.addChild(house);
  }

  if (spec.houseLabel) {
    const label = new Text({
      text: spec.houseLabel,
      style: new TextStyle({
        fontSize: 7,
        fill: '#ffffff',
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: pxTile - 6,
      }),
    });
    label.x = 2;
    label.y = pxTile - 12;
    container.addChild(label);
  }

  container.x = spec.vx * pxTile;
  container.y = spec.vy * pxTile;
  return container;
}

function WalkMapPixiRenderer({
  width,
  height,
  pxTile,
  tileSpecs = [],
  walkers = [],
  playerTile,
  playerPulse = false,
  playerEmoji = '🧑‍🌾',
  onTileClick,
}) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const worldRef = useRef(null);
  const pixiRef = useRef(null);
  const specsRef = useRef(tileSpecs);
  const walkersRef = useRef(walkers);
  const clickRef = useRef(onTileClick);
  const playerRef = useRef({ playerTile, playerEmoji, playerPulse });

  specsRef.current = tileSpecs;
  walkersRef.current = walkers;
  clickRef.current = onTileClick;
  playerRef.current = { playerTile, playerEmoji, playerPulse };

  const rebuild = useCallback(async () => {
    const app = appRef.current;
    const world = worldRef.current;
    const pixi = pixiRef.current;
    if (!app || !world || !pixi) return;

    const { Graphics, Text, TextStyle, Rectangle } = pixi;
    world.removeChildren();

    specsRef.current.forEach((spec) => {
      const cell = drawTileCell(Graphics, Text, TextStyle, pxTile, spec);
      cell.eventMode = 'static';
      cell.cursor = 'pointer';
      cell.hitArea = new Rectangle(0, 0, pxTile, pxTile);
      cell.on('pointertap', (e) => {
        e.stopPropagation();
        clickRef.current?.(spec.clickPayload);
      });
      world.addChild(cell);
    });

    const { playerTile: pt, playerEmoji: pe, playerPulse: pulsing } = playerRef.current;
    if (pt) {
      const shadow = new Graphics();
      shadow.ellipse(pt.vx * pxTile + pxTile / 2, pt.vy * pxTile + pxTile * 0.72, pxTile * 0.22, pxTile * 0.08);
      shadow.fill({ color: 0x000000, alpha: pulsing ? 0.5 : 0.35 });
      world.addChild(shadow);

      const player = new Text({
        text: pe,
        style: new TextStyle({
          fontSize: Math.max(18, Math.round(pxTile * (pulsing ? 0.58 : 0.52))),
          fontFamily: 'system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif',
          dropShadow: {
            alpha: pulsing ? 0.95 : 0.55,
            blur: pulsing ? 10 : 4,
            distance: pulsing ? 0 : 3,
            color: pulsing ? '#ffeb3b' : '#000000',
          },
        }),
      });
      player.anchor.set(0.5);
      player.x = pt.vx * pxTile + pxTile / 2;
      player.y = pt.vy * pxTile + pxTile / 2 - (pulsing ? 10 : 6);
      player.scale.set(pulsing ? 1.12 : 1);
      world.addChild(player);
    }

    walkersRef.current.forEach((w) => {
      const bubble = new Graphics();
      const bw = Math.min(pxTile * 0.7, 28);
      const bh = 16;
      bubble.roundRect(0, 0, bw, bh, 6);
      bubble.fill(w.virtual ? 0x8d6e63 : (w.colorHex ? hexToPixiColor(w.colorHex) : 0x5c6bc0));
      bubble.x = w.vx * pxTile + pxTile / 2 - bw / 2 + w.stackOffset;
      bubble.y = w.vy * pxTile + 4;
      world.addChild(bubble);
      const label = new Text({
        text: w.virtual ? '🤖' : (w.initial || '?'),
        style: new TextStyle({ fontSize: 11, fill: '#ffffff', fontWeight: '700' }),
      });
      label.anchor.set(0.5);
      label.x = bubble.x + bw / 2;
      label.y = bubble.y + bh / 2;
      world.addChild(label);
    });
  }, [pxTile]);

  useEffect(() => {
    let app;
    let cancelled = false;

    (async () => {
      try {
        const pixi = await import('pixi.js');
        if (cancelled || !hostRef.current) return;
        pixiRef.current = pixi;

        app = new pixi.Application();
        await app.init({
          width,
          height,
          background: '#3d6b28',
          antialias: false,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          preference: 'webgl',
          powerPreference: 'low-power',
        });

        if (cancelled || !hostRef.current) {
          app.destroy(true, { children: true, texture: true });
          return;
        }

        hostRef.current.replaceChildren();
        const canvas = app.canvas;
        canvas.className = 'walk-pixi-canvas';
        hostRef.current.appendChild(canvas);

        const world = new pixi.Container();
        app.stage.addChild(world);

        appRef.current = app;
        worldRef.current = world;
        rebuild();
      } catch {
        appRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      if (app) app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      worldRef.current = null;
    };
  }, [width, height, rebuild]);

  useEffect(() => {
    rebuild();
  }, [tileSpecs, walkers, playerTile, playerEmoji, playerPulse, rebuild]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.resize(width, height);
  }, [width, height]);

  return (
    <div
      ref={hostRef}
      className="walk-pixi-layer"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export default WalkMapPixiRenderer;
