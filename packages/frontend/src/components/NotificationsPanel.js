import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../hooks/useApi';
import { formatProposalPayload, contentProposalTitle } from '../utils/playerProposalFormat';

const CONTENT_STATUS_KEYS = {
  pending: 'notifications.wiki_status_pending',
  approved: 'notifications.wiki_status_approved',
  rejected: 'notifications.wiki_status_rejected',
  revision_requested: 'notifications.wiki_status_revision',
};

function avatarColor(userId) {
  const hue = ((Number(userId) || 0) * 73 + 137) % 360;
  return `hsl(${hue},60%,45%)`;
}

/** Badge count: incoming player proposals + wiki items needing your attention. */
export async function fetchNotificationBadgeCount({ userId, isAdmin, hasServerAuth }) {
  if (!userId || userId === 0) return 0;
  let count = 0;
  try {
    const playerData = await api.get('/api/player-proposals');
    const incoming = (playerData.proposals || []).filter(
      (p) => p.status === 'pending' && String(p.toUserId) === String(userId),
    );
    count += incoming.length;
  } catch {
    /* ignore */
  }

  if (hasServerAuth) {
    try {
      if (isAdmin) {
        const data = await api.get('/api/admin/content/proposals').catch(() => ({ proposals: [] }));
        count += (data.proposals || []).filter((p) => p.status === 'pending').length;
      } else {
        const contentData = await api.get('/api/content/proposals/mine');
        const revisions = (contentData.proposals || []).filter((p) => p.status === 'revision_requested');
        count += revisions.length;
      }
    } catch {
      /* ignore */
    }
  }
  return count;
}

export default function NotificationsPanel({
  currentUserId,
  isAdmin = false,
  hasServerAuth = true,
  onEconomyUpdate,
  onOpenContentWiki,
  onNotice,
  onCountChange,
}) {
  const { t } = useTranslation();
  const [playerProposals, setPlayerProposals] = useState([]);
  const [contentProposals, setContentProposals] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const playerData = await api.get('/api/player-proposals').catch(() => ({ proposals: [] }));
      let contentData = { proposals: [] };
      if (hasServerAuth) {
        contentData = isAdmin
          ? await api.get('/api/admin/content/proposals').catch(() => ({ proposals: [] }))
          : await api.get('/api/content/proposals/mine').catch(() => ({ proposals: [] }));
      }
      setPlayerProposals(playerData.proposals || []);
      setContentProposals(contentData.proposals || []);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, hasServerAuth, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const incoming = useMemo(
    () => playerProposals.filter(
      (p) => p.status === 'pending' && String(p.toUserId) === String(currentUserId),
    ),
    [playerProposals, currentUserId],
  );

  const sent = useMemo(
    () => playerProposals.filter(
      (p) => p.status === 'pending' && String(p.fromUserId) === String(currentUserId),
    ),
    [playerProposals, currentUserId],
  );

  const wikiActionable = useMemo(
    () => contentProposals.filter((p) => (
      p.status === 'revision_requested'
      || (isAdmin && p.status === 'pending')
    )),
    [contentProposals, isAdmin],
  );

  const wikiHistory = useMemo(
    () => contentProposals.filter(
      (p) => p.status !== 'revision_requested' && !(isAdmin && p.status === 'pending'),
    ).slice(0, 12),
    [contentProposals, isAdmin],
  );

  const wikiItems = useMemo(
    () => [...wikiActionable, ...wikiHistory],
    [wikiActionable, wikiHistory],
  );

  const hasAny = incoming.length > 0 || sent.length > 0 || wikiItems.length > 0;

  useEffect(() => {
    const badge = incoming.length + wikiActionable.length;
    onCountChange?.(badge);
  }, [incoming.length, wikiActionable.length, onCountChange]);

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
      onNotice?.(err.message || t('notifications.action_failed', { defaultValue: 'Actie mislukt' }));
    }
  };

  const handleWikiApprove = async (id) => {
    try {
      await api.post(`/api/admin/content/proposals/${id}/approve`, { note: '' });
      onNotice?.(t('notifications.wiki_approved', { defaultValue: 'Wiki-voorstel goedgekeurd' }));
      load();
    } catch (err) {
      onNotice?.(err.message || t('notifications.action_failed', { defaultValue: 'Actie mislukt' }));
    }
  };

  const handleWikiReject = async (id) => {
    try {
      await api.post(`/api/admin/content/proposals/${id}/reject`, { note: '' });
      onNotice?.(t('notifications.wiki_rejected', { defaultValue: 'Wiki-voorstel afgewezen' }));
      load();
    } catch (err) {
      onNotice?.(err.message || t('notifications.action_failed', { defaultValue: 'Actie mislukt' }));
    }
  };

  const renderPlayerCard = (p, { showActions }) => {
    const name = showActions
      ? (p.fromUsername || p.fromUserId)
      : (p.toUsername || p.toUserId || '—');
    const kindLabel = p.kind === 'trade'
      ? t('worldMap.proposal_kind_trade', { defaultValue: 'Ruil' })
      : t('worldMap.proposal_kind_collab', { defaultValue: 'Samenwerken' });
    const payloadText = formatProposalPayload(p.payload);
    const userId = showActions ? p.fromUserId : p.toUserId;

    return (
      <article key={`p-${p.id}`} className="notification-item">
        <div className="chat-panel__contact chat-panel__contact--static">
          <div
            className="chat-panel__contact-avatar"
            style={{ background: p.virtual ? '#78909c' : avatarColor(userId) }}
          >
            {String(name)[0]?.toUpperCase() || '?'}
          </div>
          <div className="chat-panel__contact-body">
            <div className="chat-panel__contact-name">{name}</div>
            <div className="chat-panel__contact-preview">
              {kindLabel}
              {p.message ? ` · ${p.message}` : ''}
            </div>
            {payloadText && (
              <div className="chat-panel__contact-preview chat-panel__contact-preview--empty">
                {payloadText}
              </div>
            )}
            {!showActions && (
              <div className="chat-panel__contact-preview chat-panel__contact-preview--empty">
                {t('notifications.waiting_reply', { defaultValue: 'Wacht op reactie…' })}
              </div>
            )}
          </div>
        </div>
        {showActions && (
          <div className="notification-item__actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => respond(p.id, 'accept')}>
              {t('worldMap.proposal_accept', { defaultValue: 'Accepteer' })}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => respond(p.id, 'reject')}>
              {t('worldMap.proposal_decline', { defaultValue: 'Weiger' })}
            </button>
          </div>
        )}
      </article>
    );
  };

  const renderWikiCard = (p) => {
    const statusKey = CONTENT_STATUS_KEYS[p.status] || 'notifications.wiki_status_pending';
    const needsAction = p.status === 'revision_requested' || (isAdmin && p.status === 'pending');
    const title = contentProposalTitle(p);

    return (
      <article key={`c-${p.id}`} className={`notification-item${needsAction ? ' notification-item--action' : ''}`}>
        <div className="chat-panel__contact chat-panel__contact--static">
          <div className="chat-panel__contact-avatar" style={{ background: '#5c6bc0' }}>
            W
          </div>
          <div className="chat-panel__contact-body">
            <div className="chat-panel__contact-name">{title}</div>
            <div className="chat-panel__contact-preview">
              {p.type} · {t(statusKey, { defaultValue: p.status })}
            </div>
            {p.note && (
              <div className="chat-panel__contact-preview chat-panel__contact-preview--empty">
                {p.note}
              </div>
            )}
          </div>
        </div>
        {needsAction && (
          <div className="notification-item__actions">
            {isAdmin && p.status === 'pending' && (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleWikiApprove(p.id)}>
                  {t('notifications.wiki_approve', { defaultValue: 'Goedkeuren' })}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleWikiReject(p.id)}>
                  {t('notifications.wiki_reject', { defaultValue: 'Afwijzen' })}
                </button>
              </>
            )}
            {onOpenContentWiki && (p.status === 'revision_requested' || (isAdmin && p.status === 'pending')) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenContentWiki}>
                {p.status === 'revision_requested'
                  ? t('notifications.open_wiki_edit', { defaultValue: 'Aanpassen in wiki' })
                  : t('notifications.open_wiki_review', { defaultValue: 'Bekijk in wiki' })}
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  if (!currentUserId) return null;

  return (
    <div className="card chat-panel notifications-panel">
      <div className="chat-panel__list-header">
        <strong>✉️ {t('notifications.overview', { defaultValue: 'Overzicht' })}</strong>
        <div className="chat-panel__list-header-actions">
          {(incoming.length + wikiActionable.length) > 0 && (
            <span className="chat-panel__tab-badge">
              {(incoming.length + wikiActionable.length) > 9
                ? '9+'
                : incoming.length + wikiActionable.length}
            </span>
          )}
          <button
            type="button"
            className="chat-panel__search-btn"
            onClick={load}
            disabled={loading}
            aria-label={t('notifications.refresh', { defaultValue: 'Vernieuwen' })}
            title={t('notifications.refresh', { defaultValue: 'Vernieuwen' })}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="notifications-panel__list chat-panel__contact-list">
        {loading && (
          <p className="chat-panel__empty-hint">{t('loading', { defaultValue: 'Laden…' })}</p>
        )}

        {!loading && !hasAny && (
          <p className="chat-panel__empty-hint">
            {t('notifications.all_empty', { defaultValue: 'Geen meldingen op dit moment.' })}
          </p>
        )}

        {!loading && incoming.length > 0 && (
          <section className="notifications-panel__section">
            <h3 className="notifications-panel__section-title">
              {t('notifications.section_incoming', { defaultValue: 'Inkomend' })}
              <span className="notifications-panel__section-count">{incoming.length}</span>
            </h3>
            {incoming.map((p) => renderPlayerCard(p, { showActions: true }))}
          </section>
        )}

        {!loading && wikiItems.length > 0 && (
          <section className="notifications-panel__section">
            <h3 className="notifications-panel__section-title">
              {t('notifications.section_wiki', { defaultValue: 'Wiki' })}
              {wikiActionable.length > 0 && (
                <span className="notifications-panel__section-count notifications-panel__section-count--action">
                  {wikiActionable.length}
                </span>
              )}
            </h3>
            {wikiItems.map(renderWikiCard)}
          </section>
        )}

        {!loading && sent.length > 0 && (
          <section className="notifications-panel__section">
            <h3 className="notifications-panel__section-title">
              {t('notifications.section_sent', { defaultValue: 'Verzonden' })}
              <span className="notifications-panel__section-count">{sent.length}</span>
            </h3>
            {sent.map((p) => renderPlayerCard(p, { showActions: false }))}
          </section>
        )}
      </div>
    </div>
  );
}
