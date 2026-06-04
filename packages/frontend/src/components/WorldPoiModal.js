import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedField } from '../utils/worldPois';

import { safeYoutubeId } from '../utils/youtubeId';

function YouTubeEmbed({ videoId, title }) {
  const safeId = safeYoutubeId(videoId);
  if (!safeId) return null;
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(safeId)}?rel=0&modestbranding=1`;
  return (
    <div className="world-poi-youtube">
      <iframe
        title={title || 'YouTube video'}
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

export default function WorldPoiModal({ poi, onClose, onOpenTrade }) {
  const { i18n, t } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'nl';
  const [hubTab, setHubTab] = useState('trade');
  const [activeTipId, setActiveTipId] = useState(null);

  if (!poi) return null;

  const title = localizedField(poi.content?.title || poi.label, lang);
  const subtitle = localizedField(poi.content?.subtitle, lang);
  const isHub = poi.content?.kind === 'hub';

  return (
    <div className="world-poi-overlay" onClick={onClose} role="presentation">
      <div
        className="world-poi-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="world-poi-panel__header">
          <span className="world-poi-panel__emoji" aria-hidden>{poi.emoji}</span>
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="world-poi-panel__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="world-poi-panel__body">
          {isHub && (
            <>
              <div className="world-poi-hub-tabs">
                {poi.content?.openTrade && (
                  <button
                    type="button"
                    className={`world-poi-hub-tab${hubTab === 'trade' ? ' world-poi-hub-tab--active' : ''}`}
                    onClick={() => setHubTab('trade')}
                  >
                    🏪 {t('marketplace', { defaultValue: 'Markt' })}
                  </button>
                )}
                <button
                  type="button"
                  className={`world-poi-hub-tab${hubTab === 'culture' ? ' world-poi-hub-tab--active' : ''}`}
                  onClick={() => setHubTab('culture')}
                >
                  🏛️ {t('worldMap.poi_culture', { defaultValue: 'Cultuur' })}
                </button>
                <button
                  type="button"
                  className={`world-poi-hub-tab${hubTab === 'tips' ? ' world-poi-hub-tab--active' : ''}`}
                  onClick={() => setHubTab('tips')}
                >
                  📺 {t('worldMap.poi_tips', { defaultValue: 'Tips' })}
                </button>
              </div>

              {hubTab === 'trade' && (
                <div className="world-poi-hub-trade">
                  <p>{t('worldMap.poi_trade_blurb', { defaultValue: 'Verkoop oogst of ruil met andere spelers op de markt.' })}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => { onClose?.(); onOpenTrade?.(); }}
                  >
                    {t('worldMap.open_market', { defaultValue: 'Open marktplaats' })}
                  </button>
                </div>
              )}

              {hubTab === 'culture' && (poi.content.sections || []).map((section) => (
                <article key={localizedField(section.heading, lang)} className="world-poi-exhibit">
                  <div className="world-poi-exhibit__emoji" aria-hidden>{section.imageEmoji || '🖼️'}</div>
                  <div>
                    <h3>{localizedField(section.heading, lang)}</h3>
                    <p>{localizedField(section.body, lang)}</p>
                  </div>
                </article>
              ))}

              {hubTab === 'tips' && (
                <>
                  <div className="world-poi-tip-list">
                    {(poi.content.tips || []).map((tip) => (
                      <button
                        key={tip.id}
                        type="button"
                        className={`world-poi-tip-btn${activeTipId === tip.id ? ' world-poi-tip-btn--active' : ''}`}
                        onClick={() => setActiveTipId(tip.id)}
                      >
                        <strong>{localizedField(tip.title, lang)}</strong>
                        <span>{localizedField(tip.body, lang)}</span>
                      </button>
                    ))}
                  </div>
                  {(poi.content.tips || []).map((tip) => (
                    activeTipId === tip.id ? (
                      <div key={`${tip.id}-video`} className="world-poi-tip-detail">
                        <h3>{localizedField(tip.title, lang)}</h3>
                        <p>{localizedField(tip.body, lang)}</p>
                        <YouTubeEmbed videoId={tip.youtubeId} title={localizedField(tip.title, lang)} />
                      </div>
                    ) : null
                  ))}
                </>
              )}
            </>
          )}

          {!isHub && poi.content?.kind === 'info' && (
            <article className="world-poi-exhibit">
              <p>{localizedField(poi.content.body, lang)}</p>
            </article>
          )}

          {!isHub && poi.content?.kind === 'exhibition' && (poi.content.sections || []).map((section) => (
            <article key={localizedField(section.heading, lang)} className="world-poi-exhibit">
              <div className="world-poi-exhibit__emoji" aria-hidden>{section.imageEmoji || '🖼️'}</div>
              <div>
                <h3>{localizedField(section.heading, lang)}</h3>
                <p>{localizedField(section.body, lang)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
