/** Shared formatting for player trade/collaboration proposals. */

export function formatProposalPayload(payload) {
  if (!payload) return '';
  const parts = [];
  const trade = payload.offerCrop
    ? { offer: { [payload.offerCrop]: payload.offerQty }, request: { [payload.wantCrop]: payload.wantQty } }
    : null;
  const source = trade || payload;
  if (source.offer) {
    parts.push(`Biedt: ${Object.entries(source.offer).map(([k, v]) => `${v}× ${k}`).join(', ')}`);
  }
  if (source.request) {
    parts.push(`Vraagt: ${Object.entries(source.request).map(([k, v]) => `${v}× ${k}`).join(', ')}`);
  }
  if (payload.task) parts.push(`Taak: ${payload.task}`);
  if (payload.gardenHint) parts.push(payload.gardenHint);
  return parts.join(' · ');
}

export function contentProposalTitle(proposal) {
  const item = proposal?.item || {};
  return item.name || item.slug || item.id || proposal?.type || '—';
}
