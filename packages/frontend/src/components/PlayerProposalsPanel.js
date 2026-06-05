import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../hooks/useApi';

import { formatProposalPayload } from '../utils/playerProposalFormat';

function formatPayload(payload) {
  return formatProposalPayload(payload);
}

export default function PlayerProposalsPanel({
  currentUserId,
  targetUser,
  targetUsername,
  compact = false,
  onNotice,
  onEconomyUpdate,
}) {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    kind: 'trade',
    message: '',
    offerCrop: 'tomato',
    offerQty: 1,
    requestCrop: 'carrot',
    requestQty: 1,
  });

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const data = await api.get('/api/player-proposals');
      setProposals(data.proposals || []);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  const incoming = proposals.filter(
    (p) => p.status === 'pending' && String(p.toUserId) === String(currentUserId),
  );
  const filtered = targetUser
    ? incoming.filter((p) => String(p.fromUserId) === String(targetUser))
    : incoming;

  const sendProposal = async () => {
    if (!targetUser || String(targetUser).startsWith('npc:')) {
      onNotice?.(t('worldMap.proposal_npc_hint', { defaultValue: 'Bots sturen zelf voorstellen — accepteer ze hierboven.' }));
      return;
    }
    try {
      await api.post('/api/player-proposals', {
        toUserId: targetUser,
        kind: form.kind,
        message: form.message || (form.kind === 'trade' ? 'Ruilvoorstel' : 'Samenwerken?'),
        payload: form.kind === 'trade'
          ? { offer: { [form.offerCrop]: form.offerQty }, request: { [form.requestCrop]: form.requestQty } }
          : { task: 'shared_garden', gardenHint: form.message },
      });
      onNotice?.(t('worldMap.proposal_sent', { defaultValue: 'Voorstel verstuurd — blijft bewaard tot reactie.' }));
      setForm((f) => ({ ...f, message: '' }));
      load();
    } catch (err) {
      onNotice?.(err.message || 'Kon voorstel niet versturen');
    }
  };

  const respond = async (id, action) => {
    try {
      const data = await api.post(`/api/player-proposals/${id}/respond`, { action });
      if (action === 'accept' && data.inventory) {
        onEconomyUpdate?.({ inventory: data.inventory });
      }
      onNotice?.(action === 'accept'
        ? t('worldMap.proposal_accepted', { defaultValue: 'Voorstel geaccepteerd' })
        : t('worldMap.proposal_rejected', { defaultValue: 'Voorstel afgewezen' }));
      load();
    } catch (err) {
      onNotice?.(err.message || 'Actie mislukt');
    }
  };

  if (!currentUserId) return null;

  return (
    <div className={`player-proposals${compact ? ' player-proposals--compact' : ''}`}>
      <div className="player-proposals__header">
        <strong>{t('worldMap.proposals_title', { defaultValue: 'Voorstellen' })}</strong>
        {loading && <span className="player-proposals__loading">…</span>}
      </div>

      {filtered.length > 0 ? filtered.map((p) => (
        <div key={p.id} className="player-proposal-card">
          <div className="player-proposal-card__who">
            {p.virtual ? '🤖' : '👤'} {p.fromUsername || p.fromUserId}
          </div>
          <div className="player-proposal-card__kind">
            {p.kind === 'trade' ? '🔄 Ruil' : '🤝 Samenwerken'}
          </div>
          {p.message && <p className="player-proposal-card__msg">{p.message}</p>}
          <p className="player-proposal-card__payload">{formatPayload(p.payload)}</p>
          <div className="player-proposal-card__actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => respond(p.id, 'accept')}>
              {t('worldMap.proposal_accept', { defaultValue: 'Accepteer' })}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => respond(p.id, 'reject')}>
              {t('worldMap.proposal_decline', { defaultValue: 'Weiger' })}
            </button>
          </div>
        </div>
      )) : (
        <p className="player-proposals__empty">
          {t('worldMap.proposals_empty', { defaultValue: 'Geen open voorstellen.' })}
        </p>
      )}

      {targetUser && !String(targetUser).startsWith('npc:') && (
        <div className="player-proposal-compose">
          <select
            className="player-proposal-compose__select"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            <option value="trade">{t('worldMap.proposal_kind_trade', { defaultValue: 'Ruil' })}</option>
            <option value="collaborate">{t('worldMap.proposal_kind_collab', { defaultValue: 'Samenwerken' })}</option>
          </select>
          {form.kind === 'trade' && (
            <div className="player-proposal-compose__trade">
              <input
                className="player-proposal-compose__input"
                type="number"
                min={1}
                value={form.offerQty}
                onChange={(e) => setForm((f) => ({ ...f, offerQty: Number(e.target.value) || 1 }))}
              />
              <select
                className="player-proposal-compose__select"
                value={form.offerCrop}
                onChange={(e) => setForm((f) => ({ ...f, offerCrop: e.target.value }))}
              >
                {['tomato', 'carrot', 'lettuce', 'corn', 'potato'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="player-proposal-compose__swap">↔</span>
              <input
                className="player-proposal-compose__input"
                type="number"
                min={1}
                value={form.requestQty}
                onChange={(e) => setForm((f) => ({ ...f, requestQty: Number(e.target.value) || 1 }))}
              />
              <select
                className="player-proposal-compose__select"
                value={form.requestCrop}
                onChange={(e) => setForm((f) => ({ ...f, requestCrop: e.target.value }))}
              >
                {['tomato', 'carrot', 'lettuce', 'corn', 'potato'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <input
            className="player-proposal-compose__input player-proposal-compose__message"
            type="text"
            placeholder={targetUsername ? `Bericht voor ${targetUsername}` : 'Bericht'}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
          <button type="button" className="btn btn-primary player-proposal-compose__submit" onClick={sendProposal}>
            {t('worldMap.proposal_send', { defaultValue: 'Voorstel sturen' })}
          </button>
        </div>
      )}
    </div>
  );
}
