/**
 * Sanitize player trade/collaboration proposal payloads (size + shape).
 */
const { VALID_CROPS } = require('./inventory');

function normalizeTradePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.offer && typeof payload.offer === 'object') {
    const offerEntries = Object.entries(payload.offer).filter(([, q]) => Number(q) > 0);
    const wantEntries = Object.entries(payload.request || payload.want || {}).filter(([, q]) => Number(q) > 0);
    if (!offerEntries.length || !wantEntries.length) return null;
    const [offerCrop, offerQty] = offerEntries[0];
    const [wantCrop, wantQty] = wantEntries[0];
    return {
      offerCrop: String(offerCrop).slice(0, 32),
      offerQty: Math.min(99, Math.max(1, parseInt(offerQty, 10) || 0)),
      wantCrop: String(wantCrop).slice(0, 32),
      wantQty: Math.min(99, Math.max(1, parseInt(wantQty, 10) || 0)),
    };
  }

  const offerCrop = payload.offerCrop || payload.offer_crop;
  const wantCrop = payload.wantCrop || payload.requestCrop || payload.want_crop;
  const offerQty = parseInt(payload.offerQty ?? payload.offer_qty, 10);
  const wantQty = parseInt(payload.wantQty ?? payload.requestQty ?? payload.want_qty, 10);
  if (!offerCrop || !wantCrop || offerQty < 1 || wantQty < 1) return null;

  return {
    offerCrop: String(offerCrop).slice(0, 32),
    offerQty: Math.min(99, offerQty),
    wantCrop: String(wantCrop).slice(0, 32),
    wantQty: Math.min(99, wantQty),
  };
}

function sanitizeProposalPayload(kind, payload) {
  if (payload === null || payload === undefined) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) return null;

  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return null;
  }
  if (serialized.length > 500) return null;

  if (kind === 'trade') {
    const trade = normalizeTradePayload(payload);
    if (!trade) return null;
    if (!VALID_CROPS.has(trade.offerCrop) || !VALID_CROPS.has(trade.wantCrop)) return null;
    return trade;
  }

  if (kind === 'collaborate') {
    return {
      task: String(payload.task || 'shared_garden').slice(0, 64),
      plotIndex: Math.min(11, Math.max(0, parseInt(payload.plotIndex, 10) || 0)),
      note: String(payload.note || payload.gardenHint || payload.message || '').slice(0, 200),
      gardenHint: String(payload.gardenHint || '').slice(0, 200),
    };
  }

  return {};
}

function safeParsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = { sanitizeProposalPayload, safeParsePayload, normalizeTradePayload };
